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
	print,
	readByName,
	solve,
	type TypeValue,
	UNSET,
	unwrapLazy,
} from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { referenceAt, type Slot, textOf, viewOf } from '@glisp/tweeq/structure'

import { mat2d } from 'linearly'
import { bounds } from 'pave/path/metrics'

import {
	type Change,
	type Grip,
	gripOf,
	gripOfPoint,
	isPath,
	type Mat,
	type PlaceCode,
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

export type ShapeTool = 'rect' | 'ellipse' | 'ngon'

/** How many sides a polygon starts with. */
const NGON_SIDES = 5

/**
 * As finely as a pointer can say anything, at this zoom and on this screen: a power of
 * ten, so that it reads well, no coarser than one pixel of it.
 */
export function dragStep(zoom: number, pixelRatio: number): number {
	return 10 ** Math.floor(Math.log10(1 / (zoom * pixelRatio)))
}

const FINEST = 0.01

export function roundedTo(n: number, step: number): number {
	if (step >= 1) return Math.round(n / step) * step
	return Number(n.toFixed(Math.round(-Math.log10(step))))
}

/** `value`, with every number in it no finer than `step`, in the data of a path as well. */
function roundedValue(value: unknown, step: number): unknown {
	if (typeof value === 'number') return roundedTo(value, step)
	if (Array.isArray(value)) return value.map(element => roundedValue(element, step))
	if (typeof value === 'string') {
		return value.replace(/-?\d+\.\d+(?:e-?\d+)?/g, n => String(roundedTo(Number(n), step)))
	}
	return value
}

/** What is to change, no finer than `step`. */
export const roundedChanges = (changes: readonly Change[], step: number): Change[] =>
	changes.map(({ route, value }) => ({ route, value: roundedValue(value, step) }))

/** A place on a canvas to snap to, and the row that says where it is, if one does. */
export interface SnapPoint {
	readonly at: Vec
	readonly target: string | null
	/** What it is, to say so: whose it is, and what on it. */
	readonly label: string
	/** How it is worked out from the row at `of`, if no one thing there says where it is. */
	readonly code?: { readonly of: string; readonly make: PlaceCode }
	/** It is a line, from `at` to here, that snaps anywhere along it. */
	readonly to?: Vec
	/** What was snapped to along, with `at` being where on it. */
	readonly line?: readonly [Vec, Vec]
}

/** Everywhere on what is drawn that something can snap to. */
export function snapPointsOf(
	root: AST,
	env: Env,
	shapes: readonly Shape[],
	except?: string
): SnapPoint[] {
	return [...new Set(shapes.map(({ row }) => row))].flatMap(row => {
		if (row === except) return []
		const grip = gripAt(root, env, row)
		// In the coordinates of what is drawn, as a row inside a matrix is not.
		if (grip === null || grip.transform.join() !== IDENTITY.join()) return []
		const whose = row.split('/').at(-1)!.replace(/^binding:/, '')
		const called = (name: string) => `${whose} ${name}`
		const handles = grip.handles.flatMap(({ at, place, name, code }) =>
			at === undefined
				? []
				: [
						{
							at,
							...(code === undefined ? {} : { code: { of: row, make: code } }),
							label: name === undefined ? whose : called(name),
							target:
								place === 'self' ? row : place === undefined ? null : `${row}/arg${place}`,
						},
					]
		)
		return [
			...handles,
			...(grip.snaps?.points ?? []).map(({ at, name, code }) => ({
				at,
				...(code === undefined ? {} : { code: { of: row, make: code } }),
				label: called(name),
				target: null,
			})),
			...(grip.snaps?.lines ?? []).map(({ from, to, name }) => ({
				at: from,
				to,
				label: called(name),
				target: null,
			})),
		]
	})
}

/** The nearest place to `at` along a line, from `from` to `to`. */
function along(from: Vec, to: Vec, at: Vec): Vec {
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const length = dx * dx + dy * dy
	const t =
		length === 0
			? 0
			: Math.min(1, Math.max(0, ((at[0] - from[0]) * dx + (at[1] - from[1]) * dy) / length))
	return [from[0] + dx * t, from[1] + dy * t]
}

/** The nearest of `points` to `at`, within `tolerance`, one with a row before one without. */
export function nearestSnap(
	points: readonly SnapPoint[],
	at: Vec,
	tolerance: number
): SnapPoint | null {
	let best: SnapPoint | null = null
	let bestDistance = tolerance
	for (const point of points) {
		if (point.to !== undefined) continue
		const distance = Math.hypot(point.at[0] - at[0], point.at[1] - at[1])
		if (distance < bestDistance || (distance === bestDistance && best?.target === null)) {
			best = point
			bestDistance = distance
		}
	}
	if (best !== null) return best
	// Only with no place in reach, as a place is more of a place than a line is.
	for (const { at: from, to, label } of points) {
		if (to === undefined) continue
		const on = along(from, to, at)
		const distance = Math.hypot(on[0] - at[0], on[1] - at[1])
		if (distance < bestDistance) {
			best = { at: on, target: null, label, line: [from, to] }
			bestDistance = distance
		}
	}
	return best
}

/**
 * `drawn`, with where it starts referring to what it snapped to, which is then its top
 * left, or its center: a rect goes whichever way it was drawn, and an ellipse out from it.
 */
export function drawnFrom(
	root: LetAST,
	env: Env,
	name: string,
	tool: ShapeTool,
	snap: SnapPoint,
	to: Vec,
	even: boolean,
	step = FINEST
): LetAST {
	const anchored = canRefer(snap)
	const next = drawn(root, name, tool, snap.at, to, even, step, anchored)
	if (!anchored) return next
	const source = `binding:${name}/arg0`
	const result = referred(next, env, source, snap)
	return result?.kind === 'let' ? result : drawn(root, name, tool, snap.at, to, even, step)
}

/** Whether it can be referred to, by anything that is somewhere it can be seen from. */
export const canRefer = (snap: SnapPoint): boolean => snap.target !== null || snap.code !== undefined

/**
 * Code with references in place of where it says `\0n\0`, each going out as many more
 * levels as it is inside of, as a path is relative to where it is.
 */
function withinCode(written: string, parts: readonly string[]): string {
	let depth = 0
	return written.replace(/[([]|[)\]]|\0(\d+)\0/g, (token, part: string | undefined) => {
		if (part !== undefined) return `${'../'.repeat(depth)}${parts[Number(part)]}`
		depth += token === '(' || token === '[' ? 1 : -1
		return token
	})
}

/** `root`, with what is at `source` referring to what `snap` is, one way or the other. */
function referred(root: AST, env: Env, source: string, snap: SnapPoint): AST | null {
	if (snap.target !== null) return referenceAt(root, env, source, snap.target)
	if (snap.code === undefined) return null
	const { of, make } = snap.code
	try {
		const parts: string[] = []
		const written = make(path => {
			const next = referenceAt(root, env, source, `${of}/${path}`)
			const reference = next && reach(next, env, source)?.chain.at(-1)?.ast
			if (!reference) throw new Error('out of reach')
			parts.push(print(reference))
			return `\0${parts.length - 1}\0`
		})
		const reached = reach(root, env, source)
		const last = reached?.chain.at(-1)
		return reached && last
			? withParent(reached.chain, last.replace(parse(withinCode(written, parts))))
			: null
	} catch {
		return null
	}
}

/**
 * `root`, with the argument at `place` of the row at `row` referring to what `snap` is
 * the place of. Null if it cannot, or if that would not come to where it is: something
 * that itself refers to this row, for one.
 */
export function linked(
	root: AST,
	env: Env,
	row: string,
	place: number,
	snap: SnapPoint
): AST | null {
	const next = referred(root, env, `${row}/arg${place}`, snap)
	if (next === null) return null
	const reached = gripAt(next, env, row)?.handles.find(handle => handle.place === place)?.at
	return reached?.[0] === snap.at[0] && reached[1] === snap.at[1] ? next : null
}

/** The name a shape drawn with `tool` gets for what it is, that `root` does not have yet. */
export function nameFor(root: LetAST, tool: ShapeTool | 'pen', even: boolean): string {
	const taken = new Set(root.bindings.map(([name]) => name))
	const kind = tool === 'pen' ? 'path' : tool === 'ellipse' && even ? 'circle' : tool
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
	even: boolean,
	step = FINEST,
	anchored = false
): LetAST {
	const rounded = (n: number) => roundedTo(n, step)
	const written = ([x, y]: Vec): string => `[${rounded(x)} ${rounded(y)}]`
	const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
	const side = Math.max(Math.abs(dx), Math.abs(dy))
	const end: Vec = even
		? [from[0] + Math.sign(dx || 1) * side, from[1] + Math.sign(dy || 1) * side]
		: to
	const center: Vec = [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2]
	const corner: Vec = [Math.min(from[0], end[0]), Math.min(from[1], end[1])]
	const size: Vec = [Math.abs(end[0] - from[0]), Math.abs(end[1] - from[1])]
	const size2: Vec = [end[0] - from[0], end[1] - from[1]]
	const out = Math.max(Math.abs(dx), Math.abs(dy))
	const source =
		tool === 'ngon'
			? `(path.ngon ${written(from)} ${rounded(Math.hypot(dx, dy))} ${NGON_SIDES})`
			: anchored && tool === 'rect'
			? `(path.rect ${written(from)} ${written(size2)})`
			: anchored && even
			? `(path.circle ${written(from)} ${rounded(out)})`
			: anchored
			? `(path.ellipse ${written(from)} ${written([Math.abs(dx), Math.abs(dy)])})`
			: tool === 'rect'
			? `(path.rect ${written(corner)} ${written(size)})`
			: even
				? `(path.circle ${written(center)} ${rounded(side / 2)})`
				: `(path.ellipse ${written(center)} ${written([Math.abs(dx) / 2, Math.abs(dy) / 2])})`
	return new LetAST([...root.bindings, [name, parse(source)]], root.body)
}

/** A place a pen has been, and where it was pulled to, if it was. */
export interface Anchor {
	readonly at: Vec
	readonly out?: Vec
}

/** What a curve comes into `anchor` by: the other way from what it goes out by. */
const inOf = ({ at, out }: Anchor): Vec | undefined =>
	out && [at[0] * 2 - out[0], at[1] * 2 - out[1]]

const place = ([x, y]: Vec): string => `${roundedTo(x, FINEST)},${roundedTo(y, FINEST)}`

/** An SVG path's data, through `anchors` in turn. */
export function dOfAnchors(anchors: readonly Anchor[], closed: boolean): string {
	const [first] = anchors
	if (first === undefined) return ''
	const stops = closed ? [...anchors.slice(1), first] : anchors.slice(1)
	let from = first
	const parts = [`M ${place(first.at)}`]
	for (const to of stops) {
		const into = inOf(to)
		parts.push(
			from.out === undefined && into === undefined
				? `L ${place(to.at)}`
				: `C ${place(from.out ?? from.at)} ${place(into ?? to.at)} ${place(to.at)}`
		)
		from = to
	}
	if (closed) parts.push('Z')
	return parts.join(' ')
}

/** `root` with a path through `anchors`, under `name`. */
export function penned(
	root: LetAST,
	name: string,
	anchors: readonly Anchor[],
	closed: boolean
): LetAST {
	const source = `(path.d "${dOfAnchors(anchors, closed)}")`
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

const shown = (n: number): string => String(Math.round(n * 1000) / 1000)

const isNumbers = (value: unknown): value is number[] =>
	Array.isArray(value) && value.every(element => typeof element === 'number')

/**
 * What `changes` have made of the row at `row`, a line to each thing that changed: what
 * it is called, and what it is now. What cannot be told as numbers is left out.
 */
export function readoutOf(
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[],
	before?: AST
): string[] {
	const lines = linesOf(root, env, row, changes)
	if (before === undefined) return lines
	// What is not any different goes unsaid, unless nothing is yet.
	const was = new Set(linesOf(before, env, row, changes))
	const different = lines.filter(line => !was.has(line))
	return different.length > 0 ? different : lines
}

function linesOf(root: AST, env: Env, row: string, changes: readonly Change[]): string[] {
	const found = rowAt(root, env, row)
	if (found === null) return []
	const lines = changes.flatMap(({ route, value: wanted }) => {
		let label = row.split('/').at(-1)!.replace(/^binding:/, '')
		let expected: TypeValue | null = null
		let at = follow(found.node, found.env)
		for (const arg of route) {
			if (at === null) return []
			const slot = viewOf(bare(at.node), at.env).slots.find(s => s.key === `arg${arg}`)
			if (slot === undefined) return []
			label = slot.label
			expected = slot.expected
			at = route.at(-1) === arg ? { node: slot.ast, env: slot.env } : follow(slot.ast, slot.env)
		}
		if (at === null) return []
		const { value } = evaluate(readByName(at.node), at.env)
		if (typeof value === 'number') return [`${label} ${shown(value)}`]
		if (!isNumbers(value)) return []
		// Of a vector, only what was asked of it, as what it is called on its own.
		if (Array.isArray(wanted) && wanted.includes(UNSET)) {
			const shape = expected === null ? null : unwrapLazy(expected).shape
			return value.flatMap((element, i) => {
				if (wanted[i] === UNSET) return []
				const title =
					shape?.kind === 'tuple' ? textOf(shape.elements[i]?.meta?.get('title')) : null
				return [`${title ?? `${label} ${i}`} ${shown(element)}`]
			})
		}
		return [`${label} ${value.map(shown).join(', ')}`]
	})
	return [...new Set(lines)]
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
