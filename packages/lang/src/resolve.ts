/**
 * Static name resolution: what each name and path in an AST refers to,
 * worked out without evaluating anything.
 *
 * Spec: docs/spec/eval.md — Static name resolution pass
 *
 * Two entry points:
 *
 * - `freeRefs(ast)` is what a node needs from outside itself. It depends on
 *   the node alone, so it is cached per AST instance, and a shared subtree
 *   is only ever analyzed once.
 * - `resolve(ast, env)` binds every reference in a tree to its target and
 *   reports the ones that fail. It depends on the surrounding scope, so an
 *   AST instance shared between two scopes appears once per position.
 *
 * Scopes mirror the frames the evaluator pushes: vectors, records, calls,
 * and let-blocks each add a level, and a function literal adds one around
 * its body. The two must agree, or a static answer would not match `eval`.
 */

import { desugar } from './desugar.js'
import { argumentOf, type CallParameters, childAt, isHostLevel, isKeySegment, keyOfSegment, namedChildrenOf, NO_ROOT } from './eval.js'
import { callParameters } from './infer.js'
import {
	type AST,
	type BindingTarget,
	type CallAST,
	type Diagnostic,
	type Env,
	type FnAST,
	type FnParam,
	type LetAST,
	type PathAST,
	SpreadAST,
	type SymAST,
	withoutMeta,
	type MetaAST,
	HIDDEN,
} from './types.js'

/** Call heads dispatched by name, which never refer to a binding. */
const SPECIAL_FORMS = new Set(['?', '|>', ':', 'overload'])

function isSpecialHead(ast: AST): ast is SymAST {
	return ast.kind === 'sym' && SPECIAL_FORMS.has(ast.name)
}

// -----------------------------------------------------------------------------
// Free references
// -----------------------------------------------------------------------------

/** A path whose walk starts outside the node it was collected from. */
export interface FreePath {
	readonly path: PathAST
	/** Levels above the frame enclosing the node where the walk resumes. */
	readonly up: number
}

export interface FreeRefs {
	readonly names: ReadonlySet<string>
	readonly paths: ReadonlyArray<FreePath>
}

const NO_REFS: FreeRefs = { names: new Set(), paths: [] }
const freeRefsCache: WeakMap<AST, FreeRefs> = new WeakMap()

/**
 * Everything `ast` needs from its surroundings: the bare names it does not
 * bind itself, and the paths that climb out of it. The value of a node is
 * determined by its own structure and what these refer to.
 */
export function freeRefs(ast: AST): FreeRefs {
	const cached = freeRefsCache.get(ast)
	if (cached !== undefined) return cached
	const refs = computeFreeRefs(ast, freeRefs, meta => freeRefs(meta.metadata))
	freeRefsCache.set(ast, refs)
	return refs
}

const evaluatedRefsCache: WeakMap<AST, FreeRefs> = new WeakMap()

/**
 * What `ast` needs for its value: `freeRefs`, apart from what only metadata refers
 * to, and what `#_` bypasses. Of metadata, evaluation reads a `default`, from inside
 * the metadata's record.
 */
export function evaluatedRefs(ast: AST): FreeRefs {
	// What `#_` bypasses is not worked out, so it needs nothing.
	if (ast.kind === 'meta' && ast.metadata.get(HIDDEN) !== undefined) return NO_REFS
	const cached = evaluatedRefsCache.get(ast)
	if (cached !== undefined) return cached
	const refs = computeFreeRefs(ast, evaluatedRefs, meta => {
		const field = meta.metadata.get('default')
		return field === undefined ? NO_REFS : enterFrame(evaluatedRefs(field))
	})
	evaluatedRefsCache.set(ast, refs)
	return refs
}

function computeFreeRefs(
	ast: AST,
	refs: (ast: AST) => FreeRefs,
	metadataRefs: (ast: MetaAST) => FreeRefs
): FreeRefs {
	switch (ast.kind) {
		case 'lit':
		case 'host':
			return NO_REFS
		case 'sym':
			return { names: new Set([ast.name]), paths: [] }
		case 'path':
			return { names: new Set(), paths: [{ path: ast, up: climbCount(ast) }] }
		case 'unquote':
		case 'spread':
			return refs(ast.expr)
		case 'access':
			return refs(ast.target)
		case 'meta':
			return merge([metadataRefs(ast), refs(ast.expr)])
		case 'vec':
			return enterFrame(bindNamed(merge(ast.elements.map(refs)), ast))
		case 'record':
			return enterFrame(
				bindNamed(
					merge(
						ast.fields.map(entry =>
							refs(entry instanceof SpreadAST ? entry.expr : entry[1])
						)
					),
					ast
				)
			)
		case 'call':
			return enterFrame(bindNamed(merge(callOperands(ast).map(refs)), ast))
		case 'let': {
			const parts = ast.bindings.map(([, value]) => refs(value))
			if (ast.body !== null) parts.push(refs(ast.body))
			return enterFrame(bind(merge(parts), ast.bindings.map(([n]) => n)))
		}
		case 'fn': {
			const types = merge([
				...ast.params.map(p => refs(p.type)),
				refs(ast.returnType),
			])
			const body =
				ast.body === null
					? NO_REFS
					: enterFrame(bind(refs(ast.body), ast.params.map(p => p.name)))
			return bind(merge([types, body]), ast.generics)
		}
	}
}

/** `refs`, with the names of what is directly in `node` bound there. See syntax.md (Names). */
function bindNamed(refs: FreeRefs, node: AST): FreeRefs {
	const named = namedChildrenOf(node)
	return named.length === 0 ? refs : bind(refs, named.map(([name]) => name))
}

function climbCount(path: PathAST): number {
	// From the root, it is outside of anything but the root itself.
	if (path.segments[0] === '/') return Infinity
	return path.segments.filter(seg => seg === '..').length
}

/** The operands a call evaluates, without a special form's dispatch name. */
function callOperands(ast: CallAST): AST[] {
	if (isSpecialHead(ast.head)) {
		if (ast.head.name === '?') return ast.args.filter(isNotCatchAll)
		return [...ast.args, ...(ast.kwargs?.values() ?? [])]
	}
	return [ast.head, ...ast.args, ...(ast.kwargs?.values() ?? [])]
}

/** `_` in a pattern of `?` always matches, whether or not `_` is bound. */
function isNotCatchAll(arg: AST, index: number, args: ReadonlyArray<AST>): boolean {
	const isPattern = index % 2 === 1 && index < args.length - 1
	return !(isPattern && arg.kind === 'sym' && arg.name === '_')
}

function merge(parts: ReadonlyArray<FreeRefs>): FreeRefs {
	const names = new Set<string>()
	const paths: FreePath[] = []
	for (const part of parts) {
		for (const name of part.names) names.add(name)
		paths.push(...part.paths)
	}
	return { names, paths }
}

function bind(refs: FreeRefs, bound: ReadonlyArray<string>): FreeRefs {
	const names = new Set(refs.names)
	for (const name of bound) names.delete(name)
	return { names, paths: refs.paths }
}

/** A path that climbs no further than this frame stays inside the node. */
function enterFrame(refs: FreeRefs): FreeRefs {
	if (refs.paths.length === 0) return refs
	return {
		names: refs.names,
		paths: refs.paths.flatMap(({ path, up }) =>
			up === 0 ? [] : [{ path, up: up - 1 }]
		),
	}
}

// -----------------------------------------------------------------------------
// Resolution
// -----------------------------------------------------------------------------

/** What a reference points at. */
export type Target =
	| { readonly kind: 'let'; readonly name: string; readonly binder: LetAST; readonly value: AST }
	/** What has a name in a vector, a call or a record, `binder`. See syntax.md (Names). */
	| { readonly kind: 'named'; readonly name: string; readonly binder: AST; readonly value: AST }
	| { readonly kind: 'param'; readonly name: string; readonly binder: FnAST; readonly param: FnParam }
	| { readonly kind: 'generic'; readonly name: string; readonly binder: FnAST }
	| { readonly kind: 'env'; readonly name: string; readonly binding: BindingTarget }
	| { readonly kind: 'node'; readonly ast: AST }

export interface Reference {
	readonly node: SymAST | PathAST
	/** `null` when the reference does not resolve. */
	readonly target: Target | null
}

export interface Resolution {
	/** The desugared tree that `references` point into. */
	readonly ast: AST
	/** Every name and path in the tree, once per position. */
	readonly references: ReadonlyArray<Reference>
	readonly diagnostics: ReadonlyArray<Diagnostic>
}

interface Scope {
	readonly ast: AST
	readonly parent: Scope | null
	readonly names?: ReadonlyMap<string, Target>
}

/**
 * Bind every name and path in `ast`, evaluated against `env`, to its target.
 * Runs nothing and never throws. The messages match what evaluating the same
 * reference would report.
 */
export function resolve(ast: AST, env: Env): Resolution {
	const root = desugar(ast)
	const walker = new Walker(env)
	walker.walk(root, scopeOfEnv(env))
	return { ast: root, references: walker.references, diagnostics: walker.diagnostics }
}

/** An env does not change, and what is asked of one is asked of it for each thing checked in it. */
const scopesOfEnvs = new WeakMap<NonNullable<Env>, Scope>()

function scopeOfEnv(env: Env): Scope | null {
	if (env === null) return null
	const known = scopesOfEnvs.get(env)
	if (known !== undefined) return known
	const scope: { -readonly [K in keyof Scope]: Scope[K] } = {
		ast: env.ast,
		parent: scopeOfEnv(env.parent),
	}
	if (env.bindings !== undefined) {
		scope.names = new Map(
			[...env.bindings].map(([name, binding]) => [
				name,
				{ kind: 'env', name, binding } as const,
			])
		)
	}
	scopesOfEnvs.set(env, scope)
	return scope
}

class Walker {
	readonly references: Reference[] = []
	readonly diagnostics: Diagnostic[] = []

	constructor(private readonly env: Env) {}

	walk(ast: AST, scope: Scope | null): void {
		switch (ast.kind) {
			case 'lit':
			case 'host':
				return
			case 'sym':
				return this.addName(ast, scope)
			case 'path':
				return this.addPath(ast, scope)
			case 'unquote':
			case 'spread':
				return this.walk(ast.expr, scope)
			case 'access':
				return this.walk(ast.target, scope)
			case 'meta':
				this.walk(ast.metadata, scope)
				return this.walk(ast.expr, scope)
			case 'vec': {
				const inside = this.scopeOf(ast, scope)
				for (const element of ast.elements) this.walk(element, inside)
				return
			}
			case 'record': {
				const inside = this.scopeOf(ast, scope)
				const seen = new Set<string>()
				for (const entry of ast.fields) {
					if (entry instanceof SpreadAST) {
						this.walk(entry.expr, inside)
						continue
					}
					const [name, value] = entry
					if (seen.has(name)) this.warn(value, `duplicate field: ${name}`)
					seen.add(name)
					this.walk(value, inside)
				}
				return
			}
			case 'call': {
				const inside = this.scopeOf(ast, scope)
				for (const operand of callOperands(ast)) this.walk(operand, inside)
				return
			}
			case 'let': {
				const names = new Map<string, Target>()
				for (const [name, value] of ast.bindings) {
					if (names.has(name)) this.warn(value, `duplicate binding: ${name}`)
					names.set(name, { kind: 'let', name, binder: ast, value })
				}
				const inside: Scope = { ast, parent: scope, names }
				for (const [, value] of ast.bindings) this.walk(value, inside)
				if (ast.body !== null) this.walk(ast.body, inside)
				return
			}
			case 'fn':
				return this.walkFn(ast, scope)
		}
	}

	/** The scope of a vector, a call or a record, which has the names of what is directly in it. */
	private scopeOf(ast: AST, parent: Scope | null): Scope {
		const named = namedChildrenOf(ast)
		if (named.length === 0) return { ast, parent }
		const names = new Map<string, Target>()
		for (const [name, value] of named) {
			if (names.has(name)) this.warn(value, `duplicate name: ${name}`)
			names.set(name, { kind: 'named', name, binder: ast, value })
		}
		return { ast, parent, names }
	}

	/**
	 * Generics are visible to the types and the body. Parameters are visible
	 * to the body only: a parameter's type is evaluated before any argument
	 * is bound.
	 */
	private walkFn(ast: FnAST, scope: Scope | null): void {
		const generics = new Map<string, Target>(
			ast.generics.map(name => [name, { kind: 'generic', name, binder: ast }])
		)
		const typeScope: Scope | null =
			generics.size > 0
				? { ast, parent: scope, names: generics }
				: scope
		for (const param of ast.params) this.walk(param.type, typeScope)
		this.walk(ast.returnType, typeScope)
		if (ast.body === null) return
		const names = new Map(generics)
		for (const param of ast.params) {
			names.set(param.name, {
				kind: 'param',
				name: param.name,
				binder: ast,
				param,
			})
		}
		this.walk(ast.body, { ast, parent: scope, names })
	}

	private addName(node: SymAST, scope: Scope | null): void {
		const target = lookup(node.name, scope)
		this.references.push({ node, target })
		if (target === null) this.error(node, `unresolvable name: ${node.name}`)
	}

	private addPath(node: PathAST, scope: Scope | null): void {
		const walked = walkPath(node, scope, this.env)
		if (walked === UNKNOWN) {
			this.references.push({ node, target: null })
		} else if (typeof walked === 'string') {
			this.references.push({ node, target: null })
			this.error(node, walked)
		} else {
			this.references.push({ node, target: { kind: 'node', ast: walked } })
		}
	}

	private error(ast: AST, message: string): void {
		this.diagnostics.push({
			level: 'error',
			message,
			source: { ast, env: this.env },
		})
	}

	private warn(ast: AST, message: string): void {
		this.diagnostics.push({
			level: 'warning',
			message,
			source: { ast, env: this.env },
		})
	}
}

function lookup(name: string, scope: Scope | null): Target | null {
	for (let s = scope; s !== null; s = s.parent) {
		const target = s.names?.get(name)
		if (target !== undefined) return target
	}
	return null
}

/** The parameters a call's head declares, if they can be read off it. */
function parametersOfHead(
	call: CallAST,
	scope: Scope | null,
	env: Env
): CallParameters | null {
	let head: AST = desugar(call.head)
	if (head.kind === 'sym') {
		const target = lookup(head.name, scope)
		if (target?.kind === 'env') return callParameters(call, env)
		if (target?.kind !== 'let') return null
		head = desugar(target.value)
	}
	while (head.kind === 'meta') head = head.expr
	if (head.kind !== 'fn') return null
	const variadic = head.params.find(p => p.variadic)
	return {
		names: head.params.filter(p => !p.variadic).map(p => p.name),
		...(variadic !== undefined ? { variadicName: variadic.name } : {}),
	}
}

/** A name in a path, on a call: its keyword argument or parameter's argument. */
function argumentByName(
	call: CallAST,
	name: string,
	scope: Scope | null,
	env: Env
): AST | null | typeof UNKNOWN {
	const keyword = call.kwargs?.get(name)
	if (keyword !== undefined) return keyword
	if (call.args.some(arg => arg.kind === 'spread')) return null
	const parameters = parametersOfHead(call, scope, env)
	return parameters === null ? UNKNOWN : argumentOf(call, name, parameters)
}

/** The scope of the outermost node that is written. See `rootFrame`. */
function rootScope(start: Scope | null): Scope | null {
	let root: Scope | null = null
	for (let scope = start; scope !== null; scope = scope.parent) {
		if (!isHostLevel(scope.ast, scope.names?.size ?? 0)) root = scope
	}
	return root
}

/** The head's signature cannot be read statically, so neither can the path. */
const UNKNOWN = Symbol('unknown')

/**
 * The node a path lands on, `UNKNOWN`, or the message for why it does not
 * resolve.
 */
function walkPath(
	path: PathAST,
	start: Scope | null,
	env: Env
): AST | string | typeof UNKNOWN {
	let scope = start
	let here: AST | null = scope?.ast ?? null
	let entered = true
	for (const segment of path.segments) {
		if (segment === '/') {
			scope = rootScope(start)
			if (scope === null) return NO_ROOT
			here = scope.ast
			entered = true
			continue
		}
		if (segment === '..') {
			if (entered) {
				if (scope === null) return 'path goes above top-level'
				scope = scope.parent
			}
			here = scope?.ast ?? null
			entered = true
			continue
		}
		if (here === null) return 'path descended below the root'
		here = withoutMeta(here)
		const child =
			here.kind === 'call' && isKeySegment(segment)
				? argumentByName(here, keyOfSegment(segment), scope, env)
				: childAt(here, segment, null)
		if (child === UNKNOWN) return UNKNOWN
		if (child === null) return `path segment not found: ${segment}`
		if (!entered) scope = { ast: here, parent: scope }
		here = child
		entered = false
	}
	return here ?? 'path goes above top-level'
}
