/**
 * What is on a canvas, from a program: no drawing in here. A shape's address is the
 * row it comes from, and where it is in that row's value. What moves it goes back
 * from there with `solve`.
 */

import {
	type AST,
	CallAST,
	coerceTo,
	enterNode,
	type Env,
	evaluate,
	infer,
	isHidden,
	isTypedHostFn,
	LetAST,
	lit,
	lookupBareName,
	MetaAST,
	parse,
	print,
	readByName,
	solve,
	type TypedHostFn,
	type TypeValue,
	UNSET,
	unwrapLazy,
} from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import {
	elementOptionsOf,
	type NumberOptions,
	numberOptionsAt,
	referenceAt,
	type Slot,
	textOf,
	titleOf,
	viewOf,
} from '@glisp/tweeq/structure'

import { mat2d } from 'linearly'
import { bounds } from 'pave/path/metrics'

import {
	type Change,
	type Grip,
	gripOf,
	gripOfPoint,
	isPath,
	isStyled,
	type Mat,
	type PlaceCode,
	NO_GRIP,
	NO_PAINT,
	type Paint,
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
	/** How it is drawn, if it says. */
	readonly paint?: Paint
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

const STYLE = 'style'

const isStyle = (ast: AST): ast is CallAST =>
	ast.kind === 'call' && print(ast.head) === STYLE

/** How the row at `row` is drawn, if it draws anything. */
export function paintAt(root: AST, env: Env, row: string): Paint | null {
	const shape = sceneOf(root, env).find(s => s.row === row)
	return shape === undefined ? null : (shape.paint ?? NO_PAINT)
}

/** The row to inspect for what the row at `row` is, past the style it is only given. */
export function paintedRow(root: AST, env: Env, row: string): string {
	const node = rowAt(root, env, row)?.node
	return node && isStyle(bare(node)) ? `${row}/arg0` : row
}

/**
 * `root`, with the row at `row` drawn differently, being wrapped in a style if it is not
 * in one, and let out of it once there is nothing to it.
 */
export function withPaint(root: AST, env: Env, row: string, part: Partial<Paint>): AST {
	const reached = reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (!reached || !last) return root
	const node = bare(last.ast)
	const styled = isStyle(node)
	const path = styled ? node.args[0]! : node
	const old = paintAt(root, env, row) ?? NO_PAINT
	const arg = (i: number, key: keyof Paint): AST =>
		part[key] !== undefined ? lit(part[key]!) : styled && node.args[i] ? node.args[i]! : lit(old[key])
	const nothing = { ...old, ...part }
	const next =
		nothing.fill === 'none' && nothing.stroke === 'none'
			? path
			: new CallAST(parse(STYLE), [path, arg(1, 'fill'), arg(2, 'stroke'), arg(3, 'width')])
	const kept = last.ast.kind === 'meta' ? new MetaAST(last.ast.metadata, next) : next
	return withParent(reached.chain, last.replace(kept))
}

/**
 * The rows of what comes out differently in `after`, whatever it is that does it: what
 * refers to what changed goes with it, so that where it was is no longer anywhere.
 */
export function rowsChanged(before: AST, after: AST, env: Env): Set<string> {
	const drawnBy = (root: AST): Map<string, string> => {
		const drawn = new Map<string, string>()
		for (const { row, value } of sceneOf(root, env)) {
			drawn.set(row, (drawn.get(row) ?? '') + JSON.stringify(value))
		}
		return drawn
	}
	const was = drawnBy(before)
	return new Set([...drawnBy(after)].flatMap(([row, now]) => (was.get(row) === now ? [] : [row])))
}

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
	except: ReadonlySet<string> = new Set()
): SnapPoint[] {
	return [...new Set(shapes.map(({ row }) => row))].flatMap(row => {
		if (except.has(row)) return []
		const grip = gripAt(root, env, row)
		// In the coordinates of what is drawn, as a row inside a matrix is not.
		if (grip === null || grip.transform.join() !== IDENTITY.join()) return []
		const whose = row.split('/').at(-1)!.replace(/^binding:/, '')
		const inside = grip.within === undefined ? row : `${row}/${grip.within}`
		const called = (name: string) => `${whose} ${name}`
		const handles = grip.handles.flatMap(({ at, place, name, code }) =>
			at === undefined
				? []
				: [
						{
							at,
							...(code === undefined ? {} : { code: { of: inside, make: code } }),
							label: name === undefined ? whose : called(name),
							target:
								place === 'self'
									? inside
									: place === undefined
										? null
										: `${inside}/arg${place}`,
						},
					]
		)
		return [
			...handles,
			...(grip.snaps?.points ?? []).map(({ at, name, code }) => ({
				at,
				...(code === undefined ? {} : { code: { of: inside, make: code } }),
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

/** How much of the program cannot be worked out, row by row. */
const errorsIn = (root: AST, env: Env): number =>
	viewOf(root, env).slots.reduce(
		(count, { ast, env: rowEnv }) =>
			count +
			evaluate(readByName(ast), rowEnv).diagnostics.filter(({ level }) => level === 'error').length,
		0
	)

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
	const within = gripAt(root, env, row)?.within
	const inside = within === undefined ? row : `${row}/${within}`
	const next = referred(root, env, `${inside}/arg${place}`, snap)
	if (next === null) return null
	// Going round in a circle comes to the default, which can be just where it was.
	if (errorsIn(next, env) > errorsIn(root, env)) return null
	const reached = gripAt(next, env, row)?.handles.find(handle => handle.place === place)?.at
	return reached?.[0] === snap.at[0] && reached[1] === snap.at[1] ? next : null
}

/** The name a shape drawn with `tool` gets for what it is, that `root` does not have yet. */
export function nameFor(root: LetAST, tool: ShapeTool, even: boolean): string {
	return nameOfKind(root, tool === 'ellipse' && even ? 'circle' : tool)
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
	/** What it was put down on, to refer to if it can. */
	readonly snap?: SnapPoint
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

/**
 * What a pen has drawn comes to, as the most it can be said to be: the fewer things
 * were done, the more it is one of the shapes that has a name.
 */
export type PenKind = 'line' | 'polyline' | 'polygon' | 'cubic' | 'path'

export function penKind(anchors: readonly Anchor[], closed: boolean): PenKind {
	const curved = anchors.some(anchor => anchor.out !== undefined)
	if (curved) return anchors.length === 2 && !closed ? 'cubic' : 'path'
	if (closed) return anchors.length >= 3 ? 'polygon' : 'path'
	if (anchors.length === 2) return 'line'
	return anchors.length > 2 ? 'polyline' : 'path'
}

/** `kind` with the first number that `root` has not got yet. */
function nameOfKind(root: LetAST, kind: string): string {
	const taken = new Set(root.bindings.map(([name]) => name))
	let n = 1
	while (taken.has(`${kind}${n}`)) n++
	return `${kind}${n}`
}

const asPoint = ([x, y]: Vec): string => `[${roundedTo(x, FINEST)} ${roundedTo(y, FINEST)}]`

/** The code for what a pen has drawn, and which argument each place on it is, if any. */
function penSource(anchors: readonly Anchor[], closed: boolean, kind: PenKind): string {
	const points = anchors.map(({ at }) => asPoint(at))
	switch (kind) {
		case 'line':
		case 'polyline':
		case 'polygon':
			return `(path.${kind} ${points.join(' ')})`
		case 'cubic': {
			const [from, to] = anchors as [Anchor, Anchor]
			const out = asPoint(from.out ?? from.at)
			const into = asPoint(inOf(to) ?? to.at)
			return `(path.cubic ${points[0]} ${out} ${into} ${points[1]})`
		}
		case 'path':
			return `(path.d "${dOfAnchors(anchors, closed)}")`
	}
}

/** Which argument of what a pen has drawn the anchor at `index` is, if it is one. */
function argOfAnchor(kind: PenKind, index: number): number | null {
	if (kind === 'path') return null
	return kind === 'cubic' ? index * 3 : index
}

/**
 * `root` with what a pen has drawn through `anchors`, as what it comes to, and each place
 * that snapped to something referring to that, where it is an argument.
 */
export function penned(
	root: LetAST,
	env: Env,
	anchors: readonly Anchor[],
	closed: boolean
): { ast: LetAST; name: string } {
	const kind = penKind(anchors, closed)
	const name = nameOfKind(root, kind)
	let ast: AST = new LetAST(
		[...root.bindings, [name, parse(penSource(anchors, closed, kind))]],
		root.body
	)
	anchors.forEach(({ snap }, i) => {
		const arg = argOfAnchor(kind, i)
		if (snap === undefined || arg === null) return
		ast = referred(ast, env, `binding:${name}/arg${arg}`, snap) ?? ast
	})
	return { ast: ast as LetAST, name }
}

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

const bare = (ast: AST): AST => (ast.kind === 'meta' ? ast.expr : ast)

const drawOf = (type: TypeValue | null): string | null =>
	textOf(type?.meta?.get('draw'))

/** What in `value` is to be drawn, by what `type` says of it and what it holds. */
function shapesIn(type: TypeValue | null, value: unknown, row: string): Shape[] {
	const draw = drawOf(type)
	// What is drawn of a path is what is in it, which only a canvas needs to know.
	if (draw !== null) {
		return [
			isStyled(value)
				? { row, draw, value: value.path.path, paint: value.paint }
				: isPath(value)
					? { row, draw, value: value.path }
					: { row, draw, value },
		]
	}
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

/**
 * What a call is given, as what it takes: what failed to come to anything is the default,
 * in each place, as it is for the call itself, so that there is always something to hold.
 */
const argsOf = (call: CallAST, env: Env) => {
	const inside = enterNode(call, env)
	const head = evaluate(call.head, inside).value
	const { paramTypes = [], variadicTail } = (isTypedHostFn(head) ? head : {}) as Partial<TypedHostFn>
	return {
		inside,
		head,
		args: call.args.map((arg, i) => {
			const { value } = evaluate(arg, inside)
			const type = paramTypes[i] ?? variadicTail
			return type === undefined ? value : coerceTo(type, value)
		}),
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

/** What `route` comes to in the row at `row`: what it is called, wants, and is now. */
function readAt(
	root: AST,
	env: Env,
	row: string,
	route: readonly number[]
): { label: string; expected: TypeValue | null; options: NumberOptions; value: unknown } | null {
	const found = rowAt(root, env, row)
	if (found === null) return null
	let label = row.split('/').at(-1)!.replace(/^binding:/, '')
	let expected: TypeValue | null = null
	let options: NumberOptions = {}
	let at = follow(found.node, found.env)
	for (const [i, arg] of route.entries()) {
		if (at === null) return null
		const slot = viewOf(bare(at.node), at.env).slots.find(s => s.key === `arg${arg}`)
		if (slot === undefined) return null
		label = titleOf(slot)
		expected = slot.expected
		options = numberOptionsAt(slot)
		at = i === route.length - 1 ? { node: slot.ast, env: slot.env } : follow(slot.ast, slot.env)
	}
	if (at === null) return null
	return { label, expected, options, value: evaluate(readByName(at.node), at.env).value }
}

/** Where one number is in a row: an argument, and which of it, if it is a vector. */
export interface DimensionPlace {
	readonly route: readonly number[]
	readonly index?: number
}

/** A number a program says, to read and to type, wherever it is that says it. */
export interface Dimension extends DimensionPlace {
	readonly label: string
	readonly value: number
	readonly options: NumberOptions
}

/** The number at a place in the row at `row`, as it is in `root`. */
export function dimensionAt(
	root: AST,
	env: Env,
	row: string,
	{ route, index }: DimensionPlace
): Dimension | null {
	const read = readAt(root, env, row, route)
	if (read === null) return null
	const { label, expected, options, value } = read
	const place = { route, ...(index === undefined ? {} : { index }) }
	if (index === undefined) {
		return typeof value === 'number' ? { ...place, label, value, options } : null
	}
	const element = isNumbers(value) ? value[index] : undefined
	if (element === undefined) return null
	const shape = expected === null ? null : unwrapLazy(expected).shape
	const title = shape?.kind === 'tuple' ? textOf(shape.elements[index]?.meta?.get('title')) : null
	return {
		...place,
		label: title ?? `${label} ${index}`,
		value: element,
		options: elementOptionsOf(expected, index),
	}
}

/** Where the numbers are in what is at `route`, leaving out what `wanted` leaves alone. */
function placesAt(
	root: AST,
	env: Env,
	row: string,
	route: readonly number[],
	wanted?: unknown
): DimensionPlace[] {
	const value = readAt(root, env, row, route)?.value
	if (typeof value === 'number') return [{ route }]
	if (!isNumbers(value)) return []
	return value.flatMap((_, index) =>
		Array.isArray(wanted) && wanted[index] === UNSET ? [] : [{ route, index }]
	)
}

const inOrder = (a: DimensionPlace, b: DimensionPlace): number =>
	a.route.join() === b.route.join()
		? (a.index ?? 0) - (b.index ?? 0)
		: a.route.join().localeCompare(b.route.join(), undefined, { numeric: true })

/**
 * The numbers that `changes` have got hold of, in the order the call has them, each
 * once. What is no different from `before` is left out, unless nothing is yet.
 */
export function dimensionsOf(
	root: AST,
	env: Env,
	row: string,
	changes: readonly Change[],
	before?: AST
): Dimension[] {
	const seen = new Set<string>()
	const all = changes
		.flatMap(({ route, value }) => placesAt(root, env, row, route, value))
		.filter(({ route, index }) => {
			const key = `${route.join()}/${index}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
		.sort(inOrder)
		.flatMap(place => dimensionAt(root, env, row, place) ?? [])
	if (before === undefined) return all
	const different = all.filter(
		dimension => dimensionAt(before, env, row, dimension)?.value !== dimension.value
	)
	return different.length > 0 ? different : all
}

/**
 * The numbers of a shape just drawn: what is written as numbers, as what it starts from
 * may be something else's, which is not for typing over here. Which to go to first is
 * what the drag said, which is the argument after where it started.
 */
export function dimensionsDrawn(
	root: AST,
	env: Env,
	row: string
): { dimensions: Dimension[]; first: number } {
	const found = rowAt(root, env, row)
	const call = found && bare(found.node)
	if (call?.kind !== 'call') return { dimensions: [], first: 0 }
	const dimensions = call.args
		.flatMap((arg, i) =>
			arg.kind === 'vec' || arg.kind === 'lit' ? placesAt(root, env, row, [i]) : []
		)
		.flatMap(place => dimensionAt(root, env, row, place) ?? [])
	return { dimensions, first: Math.max(0, dimensions.findIndex(({ route }) => route[0] === 1)) }
}

/** What has to change, for the number at a place to be `value`. */
export function dimensionChange({ route, index }: DimensionPlace, value: number): Change {
	if (index === undefined) return { route, value }
	return {
		route,
		value: Array.from({ length: index + 1 }, (_, i) => (i === index ? value : UNSET)),
	}
}

function linesOf(root: AST, env: Env, row: string, changes: readonly Change[]): string[] {
	const lines = changes.flatMap(({ route, value: wanted }) => {
		const read = readAt(root, env, row, route)
		if (read === null) return []
		const { label, expected, value } = read
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
