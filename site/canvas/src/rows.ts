/**
 * What can be done to rows at the top of a program, as a whole: their order, which is
 * that of the vector the program comes to, and groups, which are vectors of their own.
 */

import { type AST, type Env, CallAST, enterNode, evaluate, infer, isHidden, LetAST, MetaAST, print, readByName, SymAST, unhide, VecAST, withPathsMoved } from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { isGroup, layersOf, slotAlong, viewOf, withLayerAdded, withLayersOrdered } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'

import type { Path, Vec } from './graphics'
import { drawOf, isVecOfDrawn, labelOfRow, rowWorkedOn, backgroundCall, backgroundOf, backgroundRowsIn, gridCall, gridOf, gridRowsIn, isOutlined, paintedIn, sceneOf } from './scene'

const BINDING = 'binding:'

const namesOf = (rows: readonly string[]): Set<string> =>
	new Set(rows.filter(row => !row.includes('/')).map(row => row.slice(BINDING.length)))

/** How a click picks a row: it alone, one more or one less, or all the way from the last one. */
export type Pick = 'only' | 'toggle' | 'range'

/** The rows beside `row` in what holds it, in order, itself among them. */
function siblingsOf(root: AST, env: Env, row: string): readonly string[] {
	const keys = row.split('/')
	const last = keys.pop()!
	let node = root
	let at = env
	for (const key of keys) {
		const slot = viewOf(node, at).slots.find(({ key: other }) => other === key)
		if (slot === undefined) return [row]
		node = slot.ast
		at = slot.env
	}
	const inside = viewOf(node, at).slots.map(({ key }) => key)
	const prefix = keys.length > 0 ? `${keys.join('/')}/` : ''
	return inside.includes(last) ? inside.map(key => `${prefix}${key}`) : [row]
}

/** What is selected, once `row` is picked. Only rows side by side have any range between them. */
export function pickedRows(
	root: AST,
	env: Env,
	selected: readonly string[],
	row: string,
	how: Pick
): readonly string[] {
	if (how === 'only') return [row]
	if (how === 'toggle') {
		return selected.includes(row) ? selected.filter(other => other !== row) : [...selected, row]
	}
	const others = selected.filter(other => other !== row)
	const from = selected.at(-1)
	const siblings = siblingsOf(root, env, row)
	const [start, end] = [from === undefined ? -1 : siblings.indexOf(from), siblings.indexOf(row)]
	if (start < 0) return [...others, row]
	const between = siblings.slice(Math.min(start, end), Math.max(start, end) + 1)
	return [...new Set([...others, ...between.filter(other => other !== row), row])]
}

export type Arrange = 'forward' | 'backward' | 'front' | 'back'

/** `root`, with the rows at its top in another order, the first being in front. */
export function arranged(root: LetAST, rows: readonly string[], how: Arrange): LetAST {
	const names = namesOf(rows)
	const layers = layersOf(root)
	const moving = layers.filter(name => names.has(name))
	const staying = layers.filter(name => !names.has(name))
	if (moving.length === 0) return root
	if (how === 'front') return withLayersOrdered(root, [...moving, ...staying])
	if (how === 'back') return withLayersOrdered(root, [...staying, ...moving])

	// What comes first is in front, so what goes forward goes toward the start.
	const order = how === 'forward' ? [...layers.keys()] : [...layers.keys()].reverse()
	const step = how === 'forward' ? -1 : 1
	for (const i of order) {
		const other = layers[i + step]
		if (!names.has(layers[i]!) || other === undefined || names.has(other)) continue
		layers[i + step] = layers[i]!
		layers[i] = other
	}
	return withLayersOrdered(root, layers)
}

/** How much of the program cannot be worked out, going into groups, as they give nothing. */
const errorsIn = (root: AST, env: Env): number =>
	viewOf(root, env).slots.reduce((count, { key, ast, env: rowEnv }) => {
		if (!key.startsWith(BINDING)) return count
		const node = ast.kind === 'meta' ? ast.expr : ast
		return (
			count +
			(isGroup(node)
				? errorsIn(node, rowEnv)
				: evaluate(readByName(ast), rowEnv).diagnostics.filter(({ level }) => level === 'error')
						.length)
		)
	}, 0)

/** A name that `root` does not have yet. */
export function freeName(root: LetAST, stem: string): string {
	const taken = new Set(root.bindings.map(([name]) => name))
	let n = 1
	while (taken.has(`${stem}${n}`)) n++
	return `${stem}${n}`
}

/**
 * The row that says something of the canvas: the last that shows, or else the last that is
 * hidden itself, as a row in something hidden as a whole would say it to no effect.
 */
function rowSaying(
	root: LetAST,
	env: Env,
	rowsIn: (root: AST, env: Env, hidden: boolean) => readonly { row: string }[]
): string | undefined {
	return (
		rowsIn(root, env, false).at(-1)?.row ??
		rowsIn(root, env, true)
			.filter(({ row }) =>
				reach(root, env, row)
					?.chain.slice(0, -1)
					.every(({ ast }) => !isHidden(ast))
			)
			.at(-1)?.row
	)
}

const elementCount = (root: LetAST): number =>
	root.body?.kind === 'vec' ? root.body.elements.length : 0

/** The place right in front of the background, which is behind all else, or else the very back. */
function inFrontOfBackground(root: LetAST, env: Env): number {
	if (root.body?.kind !== 'vec') return 0
	const behind = new Set(backgroundRowsIn(root, env, false).map(({ row }) => row))
	const found = root.body.elements.findIndex(e => e.kind === 'sym' && behind.has(`${BINDING}${e.name}`))
	return found < 0 ? root.body.elements.length : found
}

/**
 * `root` with a background to choose the color of, and the row that says it: the row that says
 * so already, which comes out of being hidden, and a new one at the top of `color` if there is
 * none. One that says there is none comes to say `color` too, or there would be nothing to see.
 */
export function withBackground(
	root: LetAST,
	env: Env,
	color: string
): { ast: LetAST; row: string } {
	const row = rowSaying(root, env, backgroundRowsIn)
	const reached = row === undefined ? null : reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (row === undefined || !reached || !last) {
		const name = freeName(root, 'background')
		return {
			ast: withLayerAdded(root, name, backgroundCall(color), elementCount(root)),
			row: `${BINDING}${name}`,
		}
	}
	const shown = unhide(last.ast)
	const next = backgroundOf(withParent(reached.chain, last.replace(shown)), env) === null
		? backgroundCall(color)
		: shown
	return { ast: withParent(reached.chain, last.replace(next)) as LetAST, row }
}

/**
 * `root`, showing `kind` of a grid, or none if that is what it shows. It is said by the row
 * that says so already, which comes out of being hidden, and by a new one at the top if
 * there is none. A row in something hidden as a whole would say it to no effect.
 */
export function withGridToggled(root: LetAST, env: Env, kind: 'dots' | 'lines'): LetAST {
	const next = gridOf(root, env) === kind ? 'none' : kind
	const row = rowSaying(root, env, gridRowsIn)
	const reached = row === undefined ? null : reach(root, env, row)
	const last = reached?.chain.at(-1)
	return reached && last
		? (withParent(reached.chain, last.replace(gridCall(next))) as LetAST)
		: withLayerAdded(root, freeName(root, 'grid'), gridCall(next), inFrontOfBackground(root, env))
}

/**
 * `root` with a grid that can be seen, and the row that says it: the row that says so
 * already, as there is only the one to see, and a new one at the top if there is none.
 */
export function withGrid(root: LetAST, env: Env, kind: 'dots' | 'lines' = 'dots'): { ast: LetAST; row: string } {
	const row = rowSaying(root, env, gridRowsIn)
	const reached = row === undefined ? null : reach(root, env, row)
	const last = reached?.chain.at(-1)
	if (row === undefined || !reached || !last) {
		const name = freeName(root, 'grid')
		return {
			ast: withLayerAdded(root, name, gridCall(kind), inFrontOfBackground(root, env)),
			row: `${BINDING}${name}`,
		}
	}
	const shown = unhide(last.ast)
	const next = gridOf(withParent(reached.chain, last.replace(shown)), env) === 'none' ? gridCall(kind) : shown
	return { ast: withParent(reached.chain, last.replace(next)) as LetAST, row }
}

/**
 * `root`, with the rows in a group of their own, where the last of them was. Null with
 * nothing to group, or if that would leave anything not coming to what it did: a path
 * counts how far it goes, so one that goes in or out of the group no longer gets there.
 */
function groupedIn(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; row: string } | null {
	const names = namesOf(rows)
	const members = root.bindings.filter(([name]) => names.has(name))
	if (members.length === 0) return null
	const name = freeName(root, 'group')
	const layers = layersOf(root).filter(layer => names.has(layer))
	const inGroup = [...layers, ...members.map(([member]) => member).filter(member => !layers.includes(member))]
	const group = new LetAST(members, new VecAST(inGroup.map(member => new SymAST(member))))
	const bindings = [...root.bindings.filter(([bound]) => !names.has(bound)), [name, group] as const]
	const elements = root.body?.kind === 'vec' ? root.body.elements : []
	const isMember = (element: AST) => element.kind === 'sym' && names.has(element.name)
	const first = elements.findIndex(isMember)
	// Where the frontmost of them was, and in front of all if none of them was anywhere.
	const held = elements.flatMap((element, i) =>
		i === first ? [new SymAST(name)] : isMember(element) ? [] : [element]
	)
	const ast = members.reduce<AST>(
		(moved, [member]) => withPathsMoved(moved, env, [member], [name, member]),
		new LetAST(bindings, new VecAST(first < 0 ? [new SymAST(name), ...held] : held))
	) as LetAST
	return errorsIn(ast, env) > errorsIn(root, env) ? null : { ast, row: `${BINDING}${name}` }
}

/**
 * `root`, with the groups among the rows let go of, what was in them being where they
 * were. Null if none of them is one, or what is in one would no longer come to the same.
 */
/**
 * What a call that comes to a path is made from, among what it is given, without the call: each
 * under the style that was around it, which is what it was drawn by, as what is in it goes for
 * nothing there. Null if it is made from no path, or is nothing of the kind.
 */
function madeFrom(value: AST, env: Env): readonly AST[] | null {
	const outer = value.kind === 'meta' ? value.expr : value
	const styled = outer.kind === 'call' && print(outer.head) === 'style' ? outer : null
	const wrapped = styled === null ? outer : styled.args[0]
	const call = wrapped?.kind === 'meta' ? wrapped.expr : wrapped
	if (call?.kind !== 'call' || print(call.head) === 'style') return null
	const inside = enterNode(call, env)
	if (drawOf(infer(call, env)) !== 'path') return null
	const given = [...call.args, ...(call.kwargs?.values() ?? [])]
	const paths = given.filter(arg => drawOf(infer(arg, inside)) === 'path')
	if (paths.length === 0) return null
	return paths.map(path => {
		if (styled === null) return path
		const bare = path.kind === 'meta' ? path.expr : path
		const within = bare.kind === 'call' && print(bare.head) === 'style' ? bare.args[0]! : path
		return new CallAST(styled.head, [within, ...styled.args.slice(1)], styled.kwargs)
	})
}

/** Whether what is at `row` is made from a path, which ungrouping it would leave of it. */
export function isMadeFromPaths(root: AST, env: Env, row: string): boolean {
	const slot = slotAlong(root, env, row.split('/'))
	return slot !== null && slot !== undefined && madeFrom(slot.ast, slot.env) !== null
}

/** What a row of `value` goes by, as what it is made by. */
const stemOf = (value: AST): string => {
	const call = value.kind === 'meta' ? value.expr : value
	if (call.kind !== 'call') return 'path'
	const head = print(call.head) === 'style' ? stemOf(call.args[0]!) : print(call.head)
	return head.slice(head.lastIndexOf('.') + 1)
}

function ungroupedIn(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; rows: string[] } | null {
	const names = namesOf(rows)
	const { slots } = viewOf(root, env)
	const envOf = (key: string): Env => slots.find(slot => slot.key === key)?.env ?? env
	const elements = root.body?.kind === 'vec' ? root.body.elements : []
	// What has no names goes where it is held, and what is not held has nowhere to go.
	const isVecLetGo = (name: string, value: AST): boolean =>
		elements.some(element => element.kind === 'sym' && element.name === name) &&
		isVecOfDrawn(value, envOf(`${BINDING}${name}`))
	const isFreed = ([name, value]: readonly [string, AST]) =>
		names.has(name) && ((value.kind === 'let' && isGroup(value)) || isVecLetGo(name, value))
	const isElementFreed = (element: AST, i: number): element is VecAST =>
		rows.includes(`element:${i}`) && isVecOfDrawn(element, envOf(`element:${i}`))
	const unwrapped = (name: string, value: AST): readonly AST[] | null =>
		names.has(name) ? madeFrom(value, envOf(`${BINDING}${name}`)) : null
	const isElementUnwrapped = (element: AST, i: number): boolean =>
		rows.includes(`element:${i}`) && madeFrom(element, envOf(`element:${i}`)) !== null
	if (
		!root.bindings.some(isFreed) &&
		!elements.some(isElementFreed) &&
		!root.bindings.some(([name, value]) => unwrapped(name, value) !== null) &&
		!elements.some(isElementUnwrapped)
	) {
		return null
	}
	const taken = new Set(root.bindings.filter(b => !isFreed(b)).map(([name]) => name))
	const freed: string[] = []
	const moves: (readonly [readonly string[], readonly string[]])[] = []
	const heldBy = new Map<string, readonly AST[]>()
	const bindings = root.bindings.flatMap((binding): (readonly [string, AST])[] => {
		const inner = isFreed(binding) ? null : unwrapped(binding[0], binding[1])
		if (inner !== null) {
			// One of them goes on being what it was, for all that refers to it by name.
			if (inner.length === 1) {
				const [only] = inner
				freed.push(`${BINDING}${binding[0]}`)
				return [[binding[0], binding[1].kind === 'meta' ? new MetaAST(binding[1].metadata, only!) : only!]]
			}
			const bound: (readonly [string, AST])[] = []
			const held = inner.map(path => {
				// What is another row is already that row, and has only to be drawn.
				if (path.kind === 'sym' && root.bindings.some(([name]) => name === path.name)) {
					freed.push(`${BINDING}${path.name}`)
					return new SymAST(path.name)
				}
				const stem = path.kind === 'sym' ? path.name : stemOf(path)
				let n = 1
				while (taken.has(`${stem}${n}`)) n++
				const name = `${stem}${n}`
				taken.add(name)
				freed.push(`${BINDING}${name}`)
				bound.push([name, path])
				return new SymAST(name)
			})
			heldBy.set(binding[0], held)
			return bound
		}
		if (!isFreed(binding)) return [binding]
		if (binding[1].kind === 'vec') {
			heldBy.set(binding[0], binding[1].elements)
			return []
		}
		const group = binding[1] as LetAST
		const members = group.bindings
		if (members.some(([name]) => taken.has(name))) return [binding]
		heldBy.set(binding[0], group.body?.kind === 'vec' ? group.body.elements : [])
		for (const [name] of members) {
			taken.add(name)
			freed.push(`${BINDING}${name}`)
			moves.push([[binding[0], name], [name]])
		}
		return [...members]
	})
	const held: AST[] = []
	elements.forEach((element, i) => {
		const made = isElementFreed(element, i) ? null : isElementUnwrapped(element, i) ? madeFrom(element, envOf(`element:${i}`)) : null
		if (made !== null) {
			freed.push(...made.map((_, at) => `element:${held.length + at}`))
			held.push(...made)
			return
		}
		const inside = isElementFreed(element, i)
			? element.elements
			: element.kind === 'sym'
				? heldBy.get(element.name)
				: undefined
		for (const each of inside ?? [element]) {
			// What is being drawn already is not to be drawn twice for having been made into this.
			const isDrawn =
				inside !== undefined &&
				each.kind === 'sym' &&
				(held.some(other => other.kind === 'sym' && other.name === each.name) ||
					elements.some(other => other !== element && other.kind === 'sym' && other.name === each.name))
			if (isDrawn) continue
			if (inside !== undefined && each.kind !== 'sym') freed.push(`element:${held.length}`)
			held.push(each)
		}
	})
	const ast = moves.reduce<AST>(
		(moved, [from, to]) => withPathsMoved(moved, env, from, to),
		new LetAST(bindings, root.body?.kind === 'vec' ? new VecAST(held) : root.body)
	) as LetAST
	return freed.length === 0 || errorsIn(ast, env) > errorsIn(root, env)
		? null
		: { ast, rows: freed }
}

const parentOf = (row: string): string => row.slice(0, Math.max(0, row.lastIndexOf('/')))
const keyOf = (row: string): string => row.slice(row.lastIndexOf('/') + 1)
const inParent = (parent: string, row: string): string => (parent === '' ? row : `${parent}/${row}`)

/**
 * `root`, with `act` done to the block at the row `parent`, wherever that is, and what else it
 * says. Null if there is no block there, or nothing comes of it.
 */
function inBlock<R extends { readonly ast: LetAST }>(
	root: LetAST,
	env: Env,
	parent: string,
	act: (block: LetAST, blockEnv: Env) => R | null
): R | null {
	if (parent === '') return act(root, env)
	const slot = slotAlong(root, env, parent.split('/'))
	const block = slot?.ast.kind === 'meta' ? slot.ast.expr : slot?.ast
	if (!slot || !(block instanceof LetAST)) return null
	const result = act(block, slot.env)
	if (result === null) return null
	const next = slot.ast.kind === 'meta' ? new MetaAST(slot.ast.metadata, result.ast) : result.ast
	return { ...result, ast: slot.replace(next) as LetAST }
}

/** `rows`, all in the one block, in a group of their own there. Null if they are not in one. */
export function grouped(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; row: string } | null {
	const parent = parentOf(rows[0] ?? '')
	if (rows.some(row => parentOf(row) !== parent)) return null
	const result = inBlock(root, env, parent, (block, blockEnv) => groupedIn(block, blockEnv, rows.map(keyOf)))
	if (result === null || errorsIn(result.ast, env) > errorsIn(root, env)) return null
	return { ast: result.ast, row: inParent(parent, result.row) }
}

/** `root`, with the groups among `rows` let go of, in whatever block each of them is. */
export function ungrouped(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; rows: string[] } | null {
	// From the deepest, for there still being the way to what is further out.
	const parents = [...new Set(rows.map(parentOf))].sort((a, b) => b.length - a.length)
	let ast = root
	const freed: string[] = []
	for (const parent of parents) {
		const keys = rows.filter(row => parentOf(row) === parent).map(keyOf)
		const result = inBlock(ast, env, parent, (block, blockEnv) => ungroupedIn(block, blockEnv, keys))
		if (result === null) continue
		ast = result.ast
		freed.push(...result.rows.map(row => inParent(parent, row)))
	}
	return freed.length === 0 || errorsIn(ast, env) > errorsIn(root, env) ? null : { ast, rows: freed }
}

/** The rows that draw anything, once each, in the order they are drawn. */
export const drawnRows = (root: AST, env: Env): string[] => [
	...new Set(sceneOf(root, env).map(({ row }) => row)),
]

/** The rows of all that is drawn in the end, the background and the grid too. */
export const allPaintedRows = (root: AST, env: Env): string[] => [
	...new Set(paintedIn(root, env).map(({ row }) => row)),
]

/**
 * What an export of `drawings` has in it, with what is in front first as in a vector: them, and
 * what is behind everything, as it is on the canvas. With no drawings, it is all there is.
 */
export function exportedRows(root: AST, env: Env, drawings: readonly string[]): string[] {
	const painted = [...paintedIn(root, env)].reverse()
	const asked = drawings.length > 0 ? drawings : painted.filter(({ draw }) => draw === 'path').map(({ row }) => row)
	const behind = painted.filter(({ draw }) => draw !== 'path').map(({ row }) => row)
	return [...new Set([...asked, ...behind])]
}

/** The corners around what `rows` draw, or all there is. Null if that is nothing. */
export function boundsOfRows(
	root: AST,
	env: Env,
	rows?: readonly string[]
): readonly [Vec, Vec] | null {
	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
	for (const { row, draw, value } of sceneOf(root, env)) {
		// A line goes on for ever, so it has no size to go by.
		if (draw === 'line') continue
		if (rows && !rows.some(path => row === path || row.startsWith(`${path}/`))) continue
		const [[l, t], [r, b]] =
			isOutlined(draw) ? bounds(value as Path) : [value as Vec, value as Vec]
		left = Math.min(left, l)
		top = Math.min(top, t)
		right = Math.max(right, r)
		bottom = Math.max(bottom, b)
	}
	return Number.isFinite(left) ? [[left, top], [right, bottom]] : null
}

/** What is free of the panels on a screen, as `[left, top, right, bottom]`. */
export type Area = readonly [number, number, number, number]

/** How the program is on a screen, as a `mat2d`, which only goes in and across. */
export type View = readonly [number, number, number, number, number, number]

const MAX_FIT_ZOOM = 8

/** The view that has `box` as large as it can be in `area`, in the middle of it. */
export function viewToFit(
	[[left, top], [right, bottom]]: readonly [Vec, Vec],
	[areaLeft, areaTop, areaRight, areaBottom]: Area
): [number, number, number, number, number, number] {
	const [width, height] = [right - left, bottom - top]
	const [areaWidth, areaHeight] = [areaRight - areaLeft, areaBottom - areaTop]
	const zoom = Math.min(
		width > 0 ? areaWidth / width : MAX_FIT_ZOOM,
		height > 0 ? areaHeight / height : MAX_FIT_ZOOM,
		MAX_FIT_ZOOM
	)
	return [
		zoom,
		0,
		0,
		zoom,
		areaLeft + areaWidth / 2 - (zoom * (left + right)) / 2,
		areaTop + areaHeight / 2 - (zoom * (top + bottom)) / 2,
	]
}

/**
 * The view `t` of the way from one to another. How far in goes by ratio, so that each doubling
 * takes as long, and what is on screen goes straight, as it does around one point when zooming.
 */
export function viewBetween(
	[zoomA, , , , ax, ay]: View,
	[zoomB, , , , bx, by]: View,
	t: number
): View {
	const zoom = zoomA * (zoomB / zoomA) ** t
	const along = Math.abs(zoomB - zoomA) < 1e-9 ? t : (zoom - zoomA) / (zoomB - zoomA)
	return [zoom, 0, 0, zoom, ax + (bx - ax) * along, ay + (by - ay) * along]
}

/**
 * What `selected` is about: the row kept hold of, with only parts of that selected, which are
 * then what is picked out of it.
 */
export const rowsAbout = (selected: readonly string[], kept: string | null): readonly string[] =>
	kept !== null && selected.length > 0 && selected.every(row => row.startsWith(`${kept}/`))
		? [kept]
		: selected

/** The name of the binding that a row is, if it is one. */
export function nameOfRow(row: string): string | null {
	const key = row.split('/').at(-1)!
	return key.startsWith(BINDING) ? key.slice(BINDING.length) : null
}

/** One level of what has been gone into, to be told of and gone back to. */
export interface Crumb {
	readonly row: string
	readonly label: string
	/** The rows gone through by the time this is what is isolated. */
	readonly through: readonly string[]
}

/**
 * The levels that the rows gone through come to. A row and what it only stands for, as a style
 * stands for what it is given and a name for what it refers to, are one and the same level.
 */
export function crumbsOf(root: AST, env: Env, gone: readonly string[]): Crumb[] {
	const crumbs: Crumb[] = []
	gone.forEach((row, i) => {
		const last = crumbs.at(-1)
		if (last !== undefined && rowWorkedOn(root, env, last.through.at(-1)!) === row) {
			crumbs[crumbs.length - 1] = { ...last, through: gone.slice(0, i + 1) }
		} else {
			const label = nameOfRow(row) ?? labelOfRow(root, env, row) ?? row
			crumbs.push({ row, label, through: gone.slice(0, i + 1) })
		}
	})
	return crumbs
}

/** The row of the same binding, once it has been called `name`. */
export function rowCalled(row: string, name: string): string {
	return [...row.split('/').slice(0, -1), BINDING + name].join('/')
}
