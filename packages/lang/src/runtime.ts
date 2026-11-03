/**
 * Runtime: evaluates a root AST incrementally as the host replaces it.
 *
 * The host keeps an immutable AST and hands each new version to `setRoot`.
 * Results are cached on a node's signature instead of its position:
 *
 *   signature(node, env) = (content of node, signature of each thing it refers to)
 *
 * What a node refers to comes from `freeRefs`. So editing `b` in
 * `{a = (heavy 1) b = 1 (+ a b)}` leaves the signature of `a` unchanged, and
 * `a` hits the cache and returns the very same JS value. That makes an
 * unchanged value `===` across edits, which is what `React.memo` and Vue's
 * `shallowRef` look at, and it makes undo a cache hit.
 *
 * Content ignores identity, trivia, and metadata, so reparsing text that did
 * not change, or reformatting it, costs nothing.
 *
 * Nothing is held per node or per frame beyond weak maps. Cached results live
 * here, and `setRoot` evicts the least recently used once over `maxEntries`.
 *
 * Host functions must be pure: a cached result outlives the root it was
 * computed for.
 *
 * Spec: docs/spec/eval.md — Incremental evaluation
 */

import {
	childAt,
	enterNode,
	evaluate,
	type EvalResult,
	type EvalStore,
	type TypeValue,
	lookupBareName,
	pathTarget,
	withEvalStore,
} from './eval.js'
import { desugar } from './desugar.js'
import { evaluatedRefs, type FreePath } from './resolve.js'
import { type AST, type Env, SpreadAST, UNIT, withoutMeta } from './types.js'

export interface RuntimeOptions {
	/** Cached results to keep across edits. Older ones are evicted first. */
	readonly maxEntries?: number
	/**
	 * Inside a function call, a result is cached only if it took at least this
	 * many milliseconds: frames there are short-lived, and keeping every
	 * `(+ x 1)` would cost more than recomputing it.
	 */
	readonly heavyMs?: number
}

export interface RuntimeStats {
	/** Results computed since the last `resetStats`. */
	readonly computed: number
	/** Results served from the cache since the last `resetStats`. */
	readonly hits: number
	/** Results currently cached. */
	readonly entries: number
}

interface Entry {
	readonly result: EvalResult
	readonly cost: number
	readonly children: Entry[]
	generation: number
}

interface Computation {
	readonly children: Entry[]
}

/** A dependency as it appears in a signature. */
type Dep =
	| { readonly label: string; readonly token: string }
	| { readonly label: string; readonly ast: AST; readonly env: Env }

/** A node while its strongly connected component is being worked out. */
interface GraphNode {
	readonly ast: AST
	readonly env: Env
	readonly index: number
	low: number
	onStack: boolean
	deps: ReadonlyArray<{ readonly label: string; readonly to: GraphNode | string }>
	signature?: number
}

const ROOT_ENV_KEY = {}

export class Runtime {
	private rootAst: AST | null = null
	private rootEnv: Env
	private readonly store: SignatureStore

	constructor(env: Env, options: RuntimeOptions = {}) {
		this.rootEnv = env
		this.store = new SignatureStore(options)
	}

	/** The current root, or `null` before the first `setRoot`. */
	get root(): AST | null {
		return this.rootAst
	}

	/**
	 * Replace the root. Evaluation stays lazy until the next read. The previous
	 * root keeps its cached results until they are evicted, so restoring it is
	 * an undo at no cost.
	 */
	setRoot(ast: AST): void {
		this.rootAst = ast
		this.store.nextGeneration()
	}

	/** Evaluate `ast`, or the root, against `env`, or the root's environment. */
	evaluate(ast: AST | null = this.rootAst, env: Env = this.rootEnv): EvalResult {
		if (ast === null) return { value: UNIT, diagnostics: [] }
		return withEvalStore(this.store, () => evaluate(ast, env))
	}

	/**
	 * Read a sub-expression of the root by the names and indices leading to
	 * it, in the scope it has in the root. `read('layers', 0, 'fill')`.
	 */
	read(...path: ReadonlyArray<string | number>): EvalResult {
		if (this.rootAst === null) return { value: UNIT, diagnostics: [] }
		let here: AST = desugar(this.rootAst)
		let env = this.rootEnv
		for (const segment of path) {
			here = withoutMeta(here)
			const child = childAt(here, segment, env)
			if (child === null) return { value: UNIT, diagnostics: [] }
			env = enterNode(here, env)
			here = child
		}
		return this.evaluate(here, env)
	}

	stats(): RuntimeStats {
		return this.store.stats()
	}

	resetStats(): void {
		this.store.resetStats()
	}
}

class SignatureStore implements EvalStore {
	private readonly maxEntries: number
	private readonly heavyMs: number

	private readonly entries = new Map<number, Entry>()
	private generation = 0
	private computed = 0
	private hits = 0
	private readonly stack: Computation[] = []

	/** Canonical strings to ids, with the generation that last used each. */
	private readonly interned = new Map<string, { id: number; generation: number }>()
	private nextId = 1
	private readonly contentIds = new WeakMap<AST, number>()
	private readonly hostIds = new WeakMap<object, number>()
	private readonly signatures = new WeakMap<AST, WeakMap<object, number>>()
	private readonly transient = new WeakMap<object, boolean>()
	/** Signatures whose value depends on where a cycle was entered. */
	private readonly unstable = new Set<number>()

	constructor(options: RuntimeOptions) {
		this.maxEntries = options.maxEntries ?? 20000
		this.heavyMs = options.heavyMs ?? 1
	}

	stats(): RuntimeStats {
		return { computed: this.computed, hits: this.hits, entries: this.entries.size }
	}

	resetStats(): void {
		this.computed = 0
		this.hits = 0
	}

	nextGeneration(): void {
		this.generation++
		this.evict()
	}

	// --- EvalStore ------------------------------------------------------------

	memoize(ast: AST, env: Env, compute: () => EvalResult): EvalResult {
		if (isLeaf(ast)) return compute()
		const signature = this.signatureOf(ast, env)
		if (this.unstable.has(signature)) return compute()
		const hit = this.entries.get(signature)
		if (hit !== undefined) {
			this.hits++
			this.link(hit)
			return hit.result
		}

		const computation: Computation = { children: [] }
		const startedAt = performance.now()
		this.stack.push(computation)
		let result: EvalResult
		try {
			result = compute()
		} finally {
			this.stack.pop()
		}
		const cost = performance.now() - startedAt
		this.computed++

		if (!this.isTransient(env) || cost >= this.heavyMs) {
			const entry: Entry = {
				result,
				cost,
				children: computation.children,
				generation: this.generation,
			}
			this.entries.set(signature, entry)
			this.link(entry)
		} else {
			this.stack.at(-1)?.children.push(...computation.children)
		}
		return result
	}

	touch(ast: AST, env: Env): void {
		if (isLeaf(ast)) return
		const entry = this.entries.get(this.signatureOf(ast, env))
		if (entry !== undefined) this.link(entry)
	}

	// --- Lifetime -------------------------------------------------------------

	/** Mark an entry as in use, along with everything it was computed from. */
	private link(entry: Entry): void {
		this.stack.at(-1)?.children.push(entry)
		this.keepAlive(entry)
	}

	private keepAlive(entry: Entry): void {
		if (entry.generation === this.generation) return
		entry.generation = this.generation
		for (const child of entry.children) this.keepAlive(child)
	}

	private evict(): void {
		const excess = this.entries.size - this.maxEntries
		if (excess <= 0) return
		const oldestFirst = [...this.entries].sort(
			([, a], [, b]) => a.generation - b.generation || a.cost - b.cost
		)
		for (let i = 0; i < excess; i++) {
			this.entries.delete(oldestFirst[i]![0])
		}
		const oldestKept = oldestFirst[excess]?.[1].generation ?? this.generation
		for (const [key, { id, generation }] of this.interned) {
			if (generation < oldestKept) {
				this.interned.delete(key)
				this.unstable.delete(id)
			}
		}
	}

	/** Whether `env` is inside a function call, so its frames will not recur. */
	private isTransient(env: Env): boolean {
		if (env === null) return false
		const known = this.transient.get(env)
		if (known !== undefined) return known
		const result = env.ast.kind === 'fn' || this.isTransient(env.parent)
		this.transient.set(env, result)
		return result
	}

	// --- Interning ------------------------------------------------------------

	private intern(key: string): number {
		const found = this.interned.get(key)
		if (found !== undefined) {
			found.generation = this.generation
			return found.id
		}
		const id = this.nextId++
		this.interned.set(key, { id, generation: this.generation })
		return id
	}

	private hostId(value: object): number {
		let id = this.hostIds.get(value)
		if (id === undefined) {
			id = this.nextId++
			this.hostIds.set(value, id)
		}
		return id
	}

	private valueKey(value: unknown): string {
		if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
			return `h${this.hostId(value as object)}`
		}
		if (typeof value === 'string') return `s${JSON.stringify(value)}`
		if (Object.is(value, -0)) return 'n-0'
		return `${typeof value}:${String(value)}`
	}

	// --- Content --------------------------------------------------------------

	/** Structure without identity, trivia, or metadata. Equal content, equal id. */
	private contentId(ast: AST): number {
		const known = this.contentIds.get(ast)
		if (known !== undefined) return known
		const id = this.intern(this.contentKey(ast))
		this.contentIds.set(ast, id)
		return id
	}

	private contentKey(ast: AST): string {
		const id = (a: AST): number => this.contentId(a)
		switch (ast.kind) {
			case 'lit':
				return `lit ${this.valueKey(ast.value)}`
			case 'host':
				return `host ${this.valueKey(ast.value)}`
			case 'sym':
				return `sym ${ast.name}`
			case 'path':
				return `path ${JSON.stringify(ast.segments)}`
			case 'unquote':
				return `~ ${id(ast.expr)}`
			case 'spread':
				return `... ${id(ast.expr)}`
			case 'meta':
				// Of metadata, evaluation reads only a `default`.
				return `meta ${id(ast.expr)} ${
					ast.metadata.get('default') === undefined
						? ''
						: id(ast.metadata.get('default')!)
				}`
			case 'access':
				return `. ${id(ast.target)} ${JSON.stringify(ast.key)}`
			case 'vec':
				return `[ ${ast.elements.map(id).join(' ')}`
			case 'record':
				return `{: ${ast.fields
					.map(entry =>
						entry instanceof SpreadAST
							? `...${id(entry.expr)}`
							: `${JSON.stringify(entry[0])}=${id(entry[1])}`
					)
					.join(' ')} ?${[...(ast.optional ?? [])].sort().join(',')}`
			case 'let':
				return `{= ${ast.bindings
					.map(([name, value]) => `${JSON.stringify(name)}=${id(value)}`)
					.join(' ')} -> ${ast.body === null ? '' : id(ast.body)}`
			case 'call':
				return `( ${id(ast.head)} ${ast.args.map(id).join(' ')} ${[
					...(ast.kwargs ?? []),
				]
					.map(([name, value]) => `${JSON.stringify(name)}=${id(value)}`)
					.sort()
					.join(' ')}`
			case 'fn':
				return `=> ${ast.generics.join(',')} (${ast.params
					.map(
						p =>
							`${JSON.stringify(p.name)}${p.optional ? '?' : ''}${p.variadic ? '...' : ''}:${id(p.type)}`
					)
					.join(' ')}) ${id(ast.returnType)} ${ast.body === null ? '' : id(ast.body)}`
		}
	}

	// --- Signatures -----------------------------------------------------------

	/**
	 * The signature of evaluating `ast` in `env`. Bindings can refer to each
	 * other, so this finds strongly connected components with Tarjan's
	 * algorithm: a cycle gets one signature for the group as a whole.
	 *
	 * A cycle of function literals is ordinary recursion. A cycle through
	 * anything else is a value depending on itself: evaluation cuts it short,
	 * with a result that depends on where it was entered. So that signature,
	 * and any that depends on it, is marked unstable and never cached.
	 */
	private signatureOf(ast: AST, env: Env): number {
		const known = this.signatures.get(ast)?.get(env ?? ROOT_ENV_KEY)
		if (known !== undefined) return known
		const nodes = new Map<AST, Map<Env, GraphNode>>()
		const pending: GraphNode[] = []
		let nextIndex = 0

		const visit = (ast: AST, env: Env): GraphNode | number => {
			const signature = this.signatures.get(ast)?.get(env ?? ROOT_ENV_KEY)
			if (signature !== undefined) return signature
			let byEnv = nodes.get(ast)
			if (byEnv === undefined) nodes.set(ast, (byEnv = new Map()))
			const seen = byEnv.get(env)
			if (seen !== undefined) return seen

			const node: GraphNode = {
				ast,
				env,
				index: nextIndex,
				low: nextIndex,
				onStack: true,
				deps: [],
			}
			nextIndex++
			byEnv.set(env, node)
			pending.push(node)

			const deps: Array<{ label: string; to: GraphNode | string }> = []
			for (const dep of this.dependencies(ast, env)) {
				if ('token' in dep) {
					deps.push({ label: dep.label, to: dep.token })
					continue
				}
				const to = visit(dep.ast, dep.env)
				if (typeof to === 'number') {
					deps.push({ label: dep.label, to: `#${to}` })
				} else {
					deps.push({ label: dep.label, to })
					if (to.onStack) node.low = Math.min(node.low, to.low)
				}
			}
			node.deps = deps

			if (node.low === node.index) {
				const group = pending.splice(pending.indexOf(node))
				for (const member of group) member.onStack = false
				this.assignSignatures(group)
				return node.signature!
			}
			return node
		}

		const result = visit(ast, env)
		return typeof result === 'number' ? result : result.signature!
	}

	private assignSignatures(group: ReadonlyArray<GraphNode>): void {
		const position = new Map(group.map((member, i) => [member, i]))
		const memberKey = (member: GraphNode): string => {
			const deps = member.deps.map(({ label, to }) => {
				if (typeof to === 'string') return `${label}:${to}`
				const inGroup = position.get(to)
				return inGroup !== undefined
					? `${label}:@${inGroup}`
					: `${label}:#${to.signature!}`
			})
			return `${this.contentId(member.ast)}(${deps.join(' ')})`
		}
		const isCycle = group.length > 1 || isSelfReferencing(group[0]!)
		const unstable =
			(isCycle && !group.every(isFunctionLiteral)) ||
			group.some(member => member.deps.some(dep => this.isUnstableDep(dep.to)))
		const assign = (member: GraphNode, signature: number): void => {
			this.setSignature(member, signature)
			if (unstable) this.unstable.add(signature)
		}
		if (!isCycle) {
			assign(group[0]!, this.intern(`n ${memberKey(group[0]!)}`))
			return
		}
		const groupId = this.intern(`g ${group.map(memberKey).join(';')}`)
		group.forEach((member, i) => {
			assign(member, this.intern(`m ${groupId} ${i}`))
		})
	}

	private isUnstableDep(to: GraphNode | string): boolean {
		if (typeof to !== 'string') {
			return to.signature !== undefined && this.unstable.has(to.signature)
		}
		return to.startsWith('#') && this.unstable.has(Number(to.slice(1)))
	}

	private setSignature(node: GraphNode, signature: number): void {
		node.signature = signature
		let byEnv = this.signatures.get(node.ast)
		if (byEnv === undefined) {
			byEnv = new WeakMap()
			this.signatures.set(node.ast, byEnv)
		}
		byEnv.set(node.env ?? ROOT_ENV_KEY, signature)
	}

	private dependencies(ast: AST, env: Env): Dep[] {
		const refs = evaluatedRefs(ast)
		const deps: Dep[] = []
		for (const name of refs.names) {
			const target = lookupBareName(name, env)
			const label = JSON.stringify(name)
			if (target === null) {
				deps.push({ label, token: 'unbound' })
				continue
			}
			// By name, since an equal type may be a different object on each call.
			const cast =
				target.type === undefined ? '' : `:${(target.type as TypeValue).typeName}`
			deps.push({ label: label + cast, ast: desugar(target.ast), env: target.env })
		}
		for (const free of refs.paths) deps.push(this.pathDependency(free, env))
		return deps
	}

	private pathDependency(free: FreePath, env: Env): Dep {
		const label = JSON.stringify(free.path.segments)
		const leading = free.path.segments.findIndex(segment => segment !== '..')
		const names =
			leading === -1 ? [] : free.path.segments.slice(leading)
		// A path climbing again after descending has no fixed target to name,
		// so it depends on exactly where it stands.
		if (names.includes('..')) {
			return {
				label,
				token: env === null ? 'root' : `frame${this.hostId(env)}`,
			}
		}
		let start = env
		for (let i = 0; i < free.up; i++) {
			if (start === null) return { label, token: 'unreachable' }
			start = start.parent
		}
		const target = pathTarget(names, start)
		return 'message' in target
			? { label, token: JSON.stringify(target.message) }
			: { label, ast: desugar(target.ast), env: target.env }
	}
}

function isLeaf(ast: AST): boolean {
	return (
		ast.kind === 'lit' ||
		ast.kind === 'host' ||
		ast.kind === 'sym' ||
		ast.kind === 'path'
	)
}

function isFunctionLiteral(node: GraphNode): boolean {
	let ast = node.ast
	while (ast.kind === 'meta') ast = ast.expr
	return ast.kind === 'fn'
}

function isSelfReferencing(node: GraphNode): boolean {
	return node.deps.some(dep => dep.to === node)
}
