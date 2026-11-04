/**
 * What is on a canvas, from a program: no drawing in here. A shape's address is the
 * row it comes from, and where it is in that row's value. What moves it goes back
 * from there with `solve`.
 */

import {
	type AST,
	type CallAST,
	enterNode,
	type Env,
	evaluate,
	infer,
	isHidden,
	LetAST,
	lookupBareName,
	parse,
	readByName,
	solve,
	type TypeValue,
	unwrapLazy,
} from '@glisp/lang'
import { type Slot, textOf, viewOf } from '@glisp/tweeq/structure'

import { mat2d } from 'linearly'
import { bounds } from 'pave/path/metrics'

import {
	type Change,
	type Grip,
	gripOf,
	gripOfPoint,
	isPath,
	type Mat,
	NO_GRIP,
	type Path,
	under,
	type Vec,
	withinArg,
} from './graphics'

export interface Shape {
	/** The row it comes from. */
	readonly row: string
	readonly draw: string
	readonly value: unknown
}

/** The rows of what is at all within the corners `a` and `b`, once each. */
export function rowsWithin(scene: readonly Shape[], a: Vec, b: Vec): string[] {
	const [left, right] = a[0] < b[0] ? [a[0], b[0]] : [b[0], a[0]]
	const [top, bottom] = a[1] < b[1] ? [a[1], b[1]] : [b[1], a[1]]
	const rows = scene.flatMap(({ row, draw, value }) => {
		const [[l, t], [r, d]] =
			draw === 'path' ? bounds(value as Path) : [value as Vec, value as Vec]
		return l <= right && r >= left && t <= bottom && d >= top ? [row] : []
	})
	return [...new Set(rows)]
}

export type ShapeTool = 'rect' | 'ellipse'

const rounded = (n: number): number => Math.round(n * 100) / 100
const written = ([x, y]: Vec): string => `[${rounded(x)} ${rounded(y)}]`

/** The name a shape drawn with `tool` gets for what it is, that `root` does not have yet. */
export function nameFor(root: LetAST, tool: ShapeTool, even: boolean): string {
	const taken = new Set(root.bindings.map(([name]) => name))
	const kind = tool === 'ellipse' && even ? 'circle' : tool
	let n = 1
	while (taken.has(`${kind}${n}`)) n++
	return `${kind}${n}`
}

/**
 * `root` with a shape drawn from corner to corner, under `name`. As even as it can
 * be, it is what that is called: a square is a rect, and an even ellipse a circle.
 */
export function drawn(
	root: LetAST,
	name: string,
	tool: ShapeTool,
	from: Vec,
	to: Vec,
	even: boolean
): LetAST {
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const side = Math.max(Math.abs(dx), Math.abs(dy))
	const end: Vec = even
		? [from[0] + Math.sign(dx || 1) * side, from[1] + Math.sign(dy || 1) * side]
		: to
	const center: Vec = [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2]
	const source =
		tool === 'rect'
			? `(path.rect ${written(from)} ${written(end)})`
			: even
				? `(path.circle ${written(center)} ${rounded(side / 2)})`
				: `(path.ellipse ${written(center)} ${written([Math.abs(dx) / 2, Math.abs(dy) / 2])})`
	return new LetAST([...root.bindings, [name, parse(source)]], root.body)
}

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

const drawOf = (type: TypeValue | null): string | null =>
	textOf(type?.meta?.get('draw'))

/** What in `value` is to be drawn, by what `type` says of it and what it holds. */
function shapesIn(type: TypeValue | null, value: unknown, row: string): Shape[] {
	const draw = drawOf(type)
	// What is drawn of a path is what is in it, which only a canvas needs to know.
	if (draw !== null) return [{ row, draw, value: isPath(value) ? value.path : value }]
	if (type === null || !Array.isArray(value)) return []
	const { shape } = unwrapLazy(type)
	const elementType = (i: number): TypeValue | null =>
		shape.kind === 'vector'
			? shape.element
			: shape.kind === 'tuple'
				? (shape.elements[i] ?? shape.rest ?? null)
				: null
	return value.flatMap((element, i) => shapesIn(elementType(i), element, row))
}

export function sceneOf(root: AST, env: Env): Shape[] {
	const visit = (slots: readonly Slot[], parent: string): Shape[] =>
		slots.flatMap(slot => {
			if (!slot.key.startsWith('binding:') || isHidden(slot.ast)) return []
			const row = parent === '' ? slot.key : `${parent}/${slot.key}`
			const node = bare(slot.ast)
			// A block with nothing to return is a group, and one with a Return gives
			// only that.
			if (node.kind === 'let' && node.body === null) {
				return visit(viewOf(node, slot.env).slots, row)
			}
			const value = evaluate(readByName(slot.ast), slot.env).value
			return shapesIn(infer(readByName(slot.ast), slot.env), value, row)
		})
	return visit(viewOf(root, env).slots, '')
}

/** What a name comes to, in the program, however many names away. */
function follow(start: AST, startEnv: Env): { node: AST; env: Env } | null {
	let node = start
	let env = startEnv
	for (let reached = bare(node); reached.kind === 'sym'; reached = bare(node)) {
		const target = lookupBareName(reached.name, env)
		if (target === null || target.ast === node) return null
		node = target.ast
		env = target.env
	}
	return { node, env }
}

const argsOf = (call: CallAST, env: Env) => {
	const inside = enterNode(call, env)
	return {
		inside,
		head: evaluate(call.head, inside).value,
		args: call.args.map(arg => evaluate(arg, inside).value),
	}
}

/** How `start` can be taken hold of, or null if it is nothing of the kind. */
function gripAtNode(start: AST, startEnv: Env): Grip | null {
	const found = follow(start, startEnv)
	if (found === null) return null
	const { node, env } = found
	const call = bare(node)
	if (call.kind === 'call') {
		const { inside, head, args } = argsOf(call, env)
		const grip = gripOf(head, args, i => {
			const arg = call.args[i]
			const inner = arg === undefined ? null : gripAtNode(arg, inside)
			return inner === null ? null : under(i, inner)
		})
		if (grip !== null) return grip
	}
	const value = evaluate(readByName(node), env).value
	if (drawOf(infer(readByName(node), env)) === 'point') return gripOfPoint(value as Vec)
	return call.kind === 'call' ? NO_GRIP : null
}

/** The node of a row, and where the program's coordinates are for it. */
function rowAt(
	root: AST,
	env: Env,
	row: string
): { node: AST; env: Env; transform: Mat } | null {
	let node = root
	let nodeEnv = env
	let transform: Mat = IDENTITY
	for (const key of row.split('/').filter(part => part !== '')) {
		const call = bare(node)
		const arg = /^arg(\d+)$/.exec(key)?.[1]
		if (call.kind === 'call' && arg !== undefined) {
			const { head, args } = argsOf(call, nodeEnv)
			const within = withinArg(head, Number(arg), args)
			if (within !== null) transform = mat2d.mul(transform, within) as unknown as Mat
		}
		const slot = viewOf(node, nodeEnv).slots.find(s => s.key === key)
		if (slot === undefined) return null
		node = slot.ast
		nodeEnv = slot.env
	}
	return { node, env: nodeEnv, transform }
}

/**
 * How the row at `row` can be taken hold of. A row that only refers to another has
 * the handles of that one, as moving it can only mean moving that.
 */
export function gripAt(
	root: AST,
	env: Env,
	row: string
): (Grip & { readonly transform: Mat }) | null {
	const found = rowAt(root, env, row)
	if (found === null) return null
	const grip = gripAtNode(found.node, found.env)
	return grip === null ? null : { ...grip, transform: found.transform }
}

/** What `route` goes down to from `start`, through the calls on the way. */
function nodeAt(start: AST, startEnv: Env, route: readonly number[]): AST | null {
	let node = start
	let env = startEnv
	for (const arg of route) {
		const found = follow(node, env)
		if (found === null) return null
		const call = bare(found.node)
		if (call.kind !== 'call') return null
		const next = call.args[arg]
		if (next === undefined) return null
		env = enterNode(call, found.env)
		node = next
	}
	return node
}

/**
 * `root` with `changes` made to the row at `row`, each in turn, as each edit makes a
 * new program for the next. Null, with why, if one of them cannot be.
 */
export function changed(
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[]
): { ast: AST | null; problem: string | null } {
	let next = root
	for (const { route, value } of changes) {
		const found = rowAt(next, env, row)
		const node = found && nodeAt(found.node, found.env, route)
		if (!node) return { ast: null, problem: 'that is no longer there' }
		const { ast, diagnostics } = solve(next, env, node, value)
		if (ast === null) {
			return { ast: null, problem: diagnostics[0]?.message ?? 'cannot be moved' }
		}
		next = ast
	}
	return { ast: next, problem: null }
}
