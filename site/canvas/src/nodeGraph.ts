/**
 * A let-block as a graph of nodes: each of what it binds is a node, what one refers to of the
 * others is a wire into it, and what the block comes to, which is its last, is where the graph
 * ends. Where a node is on screen is said by `^{at: [x y]}` on what it is bound to, which says
 * nothing to its value. What is here is only what there is to show and what an edit comes to.
 * Drawing it is elsewhere.
 */

import {
	type AST,
	type Env,
	evaluate,
	freeRefs,
	infer,
	LetAST,
	LitAST,
	MetaAST,
	print,
	pushLetFrame,
	RecordAST,
	SymAST,
	toAst,
	type TypeValue,
	VecAST,
} from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { defaultFor, titleOf, viewOf } from '@glisp/tweeq/structure'

export type Vec = readonly [number, number]

const BINDING = 'binding:'
/** What a block ends with, if that has no name. */
export const BODY = 'body'
/** The metadata that says where a node is. */
const AT = 'at'

export const NODE_WIDTH = 200
export const HEADER_HEIGHT = 30
export const ROW_HEIGHT = 24
const PADDING = 6
const COLUMN_GAP = 80
const ROW_GAP = 24
/** Nearer than this, a node shows what goes into it, each on a line. Further, only what it is. */
export const DETAIL_FROM = 0.6

export interface GraphInput {
	/** The slot of the node's value that it is, as a path goes by it. */
	readonly key: string
	readonly label: string
	/** The node that it is, by referring to it and nothing more. */
	readonly from: string | null
	/** As it is written, where it is not only another node. */
	readonly text: string | null
	/** What it wants, or what is there if nothing says what it wants. A host colors its port by it. */
	readonly type: TypeValue | null
}

export interface GraphNode {
	/** As a path goes by it: `binding:` and its name, or `body`. */
	readonly key: string
	/** What it is bound as. What a block ends with may have none. */
	readonly name: string | null
	/** What it calls, as that is called on screen. */
	readonly title: string | null
	/** What it calls, as that is written, for a host to find an icon by. */
	readonly fn: string | null
	readonly icon: string | null
	readonly inputs: readonly GraphInput[]
	/** As it is written, where it has nothing going into it to show instead. */
	readonly text: string | null
	readonly at: Vec
	/** Where it is has been said, rather than worked out from what it is wired to. */
	readonly placed: boolean
	/** It is what the block comes to. */
	readonly result: boolean
	/** What it comes to, as far as can be told without working it out. */
	readonly type: TypeValue | null
}

export interface GraphEdge {
	readonly from: string
	readonly to: string
	/** The input of `to` that it goes into, or null for the node as a whole. */
	readonly input: string | null
}

export interface Graph {
	readonly nodes: readonly GraphNode[]
	readonly edges: readonly GraphEdge[]
}

/** Not known, or gone wrong, which would fit anything: nothing to go by. */
const isTold = (type: TypeValue | null): type is TypeValue =>
	type !== null && type.typeName !== '_' && type.typeName !== '!'

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)
const keyOf = (name: string): string => `${BINDING}${name}`
const nameOfKey = (key: string): string | null => (key.startsWith(BINDING) ? key.slice(BINDING.length) : null)

/** What a block holds, each with the key a path goes by, its last being what it comes to. */
function entriesOf(block: LetAST): readonly (readonly [key: string, name: string | null, value: AST])[] {
	return [
		...block.bindings.map(([name, value]) => [keyOf(name), name, value] as const),
		...(block.body === null ? [] : [[BODY, null, block.body] as const]),
	]
}

/** Where `ast` says it is, if it does. */
export function placeOf(ast: AST): Vec | null {
	if (ast.kind !== 'meta') return null
	const said = ast.metadata.get(AT)
	if (said?.kind !== 'vec' || said.elements.length !== 2) return null
	const [x, y] = said.elements.map(element => (element.kind === 'lit' && typeof element.value === 'number' ? element.value : null))
	return x == null || y == null ? null : [x, y]
}

/** `ast`, saying that it is at `at`, or saying nothing of where, with null. */
export function withPlace(ast: AST, at: Vec | null): AST {
	const others = ast.kind === 'meta' ? ast.metadata.fields.filter(field => 'kind' in field || field[0] !== AT) : []
	const fields = at === null ? others : [...others, [AT, new VecAST(at.map(n => new LitAST(Math.round(n))))] as const]
	const expr = bare(ast)
	if (fields.length === 0) return expr
	return new MetaAST(new RecordAST(fields, ast.kind === 'meta' ? ast.metadata.optional : undefined), expr)
}

/** How tall a node is, with what goes into it showing or not. */
export function heightOf(node: Pick<GraphNode, 'inputs' | 'text'>, detailed: boolean): number {
	const rows = node.inputs.length + (node.text === null ? 0 : 1)
	return !detailed || rows === 0 ? HEADER_HEIGHT : HEADER_HEIGHT + rows * ROW_HEIGHT + PADDING
}

/** Where a wire comes into a node: at the input it is for, where that shows, or else at its top. */
export function inputPort(node: GraphNode, input: string | null, detailed: boolean): Vec {
	const [x, y] = node.at
	const index = input === null ? -1 : node.inputs.findIndex(({ key }) => key === input)
	if (!detailed || index < 0) return [x, y + HEADER_HEIGHT / 2]
	return [x, y + HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2]
}

/** Where a wire goes out of a node. */
export const outputPort = (node: GraphNode): Vec => [node.at[0] + NODE_WIDTH, node.at[1] + HEADER_HEIGHT / 2]

/** A short way of writing what is too long to show whole. */
const TEXT_LIMIT = 40
const shortened = (text: string): string => (text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 1)}…` : text)

/**
 * The graph of `block`, which is in `env`. A node that does not say where it is goes in a column
 * by how far it is from what refers to nothing, after those that it is made from.
 */
export function graphOf(block: LetAST, env: Env): Graph {
	const inside = pushLetFrame(block, env)
	const entries = entriesOf(block)
	const names = new Set(block.bindings.map(([name]) => name))
	const last = entries.at(-1)?.[0]
	const edges: GraphEdge[] = []

	const unplaced = entries.map(([key, name, value]) => {
		const view = viewOf(value, inside)
		const whole = bare(value)
		const found = new Set<string>()
		const wire = (from: string, input: string | null): void => {
			if (from === name) return
			found.add(from)
			edges.push({ from: keyOf(from), to: key, input })
		}
		const inputs = view.slots
			.filter(slot => !slot.absent)
			.map((slot): GraphInput => {
				const written = bare(slot.ast)
				const direct = written.kind === 'sym' && names.has(written.name) && written.name !== name ? written.name : null
				if (direct !== null) wire(direct, slot.key)
				else for (const other of freeRefs(slot.ast).names) if (names.has(other)) wire(other, slot.key)
				return {
					key: slot.key,
					label: titleOf(slot),
					from: direct === null ? null : keyOf(direct),
					text: direct === null ? shortened(print(written)) : null,
					type: isTold(slot.expected) ? slot.expected : infer(slot.ast, slot.env),
				}
			})
		// What it refers to that is in none of what goes into it, as what it calls, or itself.
		for (const other of freeRefs(value).names) if (names.has(other) && !found.has(other)) wire(other, null)
		return {
			key,
			name,
			title: view.title,
			fn: view.head === null ? null : print(view.head.ast),
			icon: view.icon,
			inputs,
			text: inputs.length === 0 ? shortened(print(whole)) : null,
			said: placeOf(value),
			result: key === last,
			type: infer(value, inside),
		}
	})

	// How far each is from what is made from nothing, going along the wires.
	const depths = new Map<string, number>()
	const depthOf = (key: string, going: ReadonlySet<string>): number => {
		const known = depths.get(key)
		if (known !== undefined) return known
		if (going.has(key)) return 0
		const within = new Set([...going, key])
		const depth = Math.max(-1, ...edges.filter(({ to }) => to === key).map(({ from }) => depthOf(from, within))) + 1
		depths.set(key, depth)
		return depth
	}
	const fallen = new Map<number, number>()
	const nodes = unplaced.map(({ said, ...node }): GraphNode => {
		const depth = depthOf(node.key, new Set())
		const top = fallen.get(depth) ?? 0
		fallen.set(depth, top + heightOf(node, true) + ROW_GAP)
		return { ...node, at: said ?? [depth * (NODE_WIDTH + COLUMN_GAP), top], placed: said !== null }
	})
	return { nodes, edges }
}

/** `block` with what it holds at `key` now `value`. */
function withEntry(block: LetAST, key: string, value: AST): LetAST {
	if (key === BODY) return new LetAST(block.bindings, value)
	const name = nameOfKey(key)
	return new LetAST(
		block.bindings.map(binding => (binding[0] === name ? ([binding[0], value] as const) : binding)),
		block.body
	)
}

const entryOf = (block: LetAST, key: string): AST | undefined => entriesOf(block).find(([other]) => other === key)?.[2]

/** `block`, with each node of `places` saying that it is there. */
export function withNodesAt(block: LetAST, places: ReadonlyMap<string, Vec>): LetAST {
	return [...places].reduce((next, [key, at]) => {
		const value = entryOf(next, key)
		return value === undefined ? next : withEntry(next, key, withPlace(value, at))
	}, block)
}

/** Whether what is at `key` is made from what is at `from`, however far back. */
function dependsOn(graph: Graph, key: string, from: string, seen = new Set<string>()): boolean {
	if (key === from) return true
	if (seen.has(key)) return false
	seen.add(key)
	return graph.edges.some(edge => edge.to === key && dependsOn(graph, edge.from, from, seen))
}

/** `value` with what is in its slot `input` now `child`, or all of it with null, keeping what it says of itself. */
function withInput(value: AST, inside: Env, input: string | null, child: (was: AST, env: Env) => AST): AST | null {
	if (input === null) {
		const next = child(bare(value), inside)
		return value.kind === 'meta' ? new MetaAST(value.metadata, next) : next
	}
	const slot = viewOf(value, inside).slots.find(({ key }) => key === input)
	if (slot === undefined) return null
	const next = child(bare(slot.ast), slot.env)
	return slot.replace(slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, next) : next)
}

/**
 * `block` with the node `from` wired into the input `input` of the node `to`, or into it as a
 * whole with null: it refers to that by name. Null if it cannot be, as a node cannot be made
 * from what is made from it.
 */
export function connected(block: LetAST, env: Env, from: string, to: string, input: string | null): LetAST | null {
	const name = nameOfKey(from)
	const value = entryOf(block, to)
	if (name === null || value === undefined || dependsOn(graphOf(block, env), from, to)) return null
	const next = withInput(value, pushLetFrame(block, env), input, () => new SymAST(name))
	return next === null ? null : withEntry(block, to, next)
}

const isPlain = (value: unknown): boolean =>
	typeof value === 'number' ||
	typeof value === 'string' ||
	typeof value === 'boolean' ||
	(Array.isArray(value) && value.every(isPlain))

/**
 * `block` with nothing wired into the input `input` of the node `to`: it is what it came to,
 * written out, where that can be written, or else what is there when nothing is given.
 */
export function disconnected(block: LetAST, env: Env, to: string, input: string | null): LetAST | null {
	const value = entryOf(block, to)
	if (value === undefined) return null
	const expected = input === null ? null : (viewOf(value, pushLetFrame(block, env)).slots.find(({ key }) => key === input)?.expected ?? null)
	const next = withInput(value, pushLetFrame(block, env), input, (was, at) => {
		const came = evaluate(was, at).value
		return isPlain(came) ? toAst(came, at) : defaultFor(expected, at)
	})
	return next === null ? null : withEntry(block, to, next)
}

/**
 * `block` coming to the node at `key`, which is its being last. What it ended with that had no
 * name is called `called`, to go on being there.
 */
export function withResult(block: LetAST, key: string, called: string): LetAST {
	const name = nameOfKey(key)
	const binding = block.bindings.find(([other]) => other === name)
	if (binding === undefined) return block
	const others = block.bindings.filter(other => other !== binding)
	const ended = block.body === null ? [] : [[called, block.body] as const]
	return new LetAST([...others, ...ended, binding], null)
}

/** `block` with `value` bound as `name` at `at`, before what it comes to, which stays that. */
export function withNode(block: LetAST, name: string, value: AST, at: Vec): LetAST {
	const placed = withPlace(value, at)
	if (block.body !== null || block.bindings.length === 0) return new LetAST([...block.bindings, [name, placed]], block.body)
	return new LetAST([...block.bindings.slice(0, -1), [name, placed], block.bindings.at(-1)!], null)
}

/**
 * `block` without the nodes at `keys`. What it comes to stays, as a block comes to something. An
 * input that one of them was wired into is left as taking a wire off leaves it, so that the node
 * it is of goes on being what it is, with what came into it written there.
 */
export function withoutNodes(block: LetAST, env: Env, keys: readonly string[]): LetAST {
	const last = entriesOf(block).at(-1)?.[0]
	const going = new Set(keys.filter(key => key !== last && nameOfKey(key) !== null))
	const cut = graphOf(block, env)
		.nodes.filter(({ key }) => !going.has(key))
		.flatMap(({ key, inputs }) => inputs.filter(({ from }) => from !== null && going.has(from)).map(input => [key, input.key] as const))
		.reduce((next, [to, input]) => disconnected(next, env, to, input) ?? next, block)
	const gone = new Set([...going].map(nameOfKey))
	return new LetAST(cut.bindings.filter(([name]) => !gone.has(name)), cut.body)
}

/** The block at `path` in `root`, with the env it is in, if a block is what is there. `''` is `root`. */
export function blockAt(root: AST, env: Env, path: string): { readonly block: LetAST; readonly env: Env } | null {
	if (path === '') return root.kind === 'let' ? { block: root, env } : null
	const slot = reach(root, env, path)?.chain.at(-1)
	const block = slot === undefined ? null : bare(slot.ast)
	return slot !== undefined && block instanceof LetAST ? { block, env: slot.env } : null
}

/** `root` with the block at `path` now `next`. */
export function withBlockAt(root: AST, env: Env, path: string, next: LetAST): AST | null {
	if (path === '') return next
	const chain = reach(root, env, path)?.chain
	const slot = chain?.at(-1)
	if (chain === undefined || slot === undefined) return null
	return withParent(chain, slot.replace(slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, next) : next))
}

/**
 * `root` with what is at `path` in a block of its own, bound as `name` and so what the block
 * comes to: a place for nodes, around what was there. Null if a block is there already.
 */
export function withBlockAround(root: AST, env: Env, path: string, name: string): AST | null {
	const chain = reach(root, env, path)?.chain
	const slot = chain?.at(-1)
	if (chain === undefined || slot === undefined || bare(slot.ast).kind === 'let') return null
	const block = new LetAST([[name, bare(slot.ast)]], null)
	return withParent(chain, slot.replace(slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, block) : block))
}

/** The row of the node at `key` of the block at `path`. */
export const rowOfNode = (path: string, key: string): string => (path === '' ? key : `${path}/${key}`)
