/**
 * What can be done to rows at the top of a program, as a whole: their order, which is
 * the order they are drawn in, and groups, which are let-blocks with no Return.
 */

import { type AST, type Env, evaluate, isHidden, LetAST, readByName } from '@glisp/lang'
import { reach, withParent } from '@glisp/tweeq/rowsClipboard'
import { viewOf } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'

import type { Path, Vec } from './graphics'
import { gridCall, gridOf, gridRowsIn, isOutlined, sceneOf } from './scene'

const BINDING = 'binding:'

const namesOf = (rows: readonly string[]): Set<string> =>
	new Set(rows.filter(row => !row.includes('/')).map(row => row.slice(BINDING.length)))

export type Arrange = 'forward' | 'backward' | 'front' | 'back'

/** `root`, with the rows at its top in another order, the last being drawn last. */
export function arranged(root: LetAST, rows: readonly string[], how: Arrange): LetAST {
	const names = namesOf(rows)
	const moving = root.bindings.filter(([name]) => names.has(name))
	const staying = root.bindings.filter(([name]) => !names.has(name))
	if (moving.length === 0) return root
	if (how === 'front') return new LetAST([...staying, ...moving], root.body)
	if (how === 'back') return new LetAST([...moving, ...staying], root.body)

	const bindings = [...root.bindings]
	const order = how === 'forward' ? [...bindings.keys()].reverse() : [...bindings.keys()]
	const step = how === 'forward' ? 1 : -1
	for (const i of order) {
		const other = bindings[i + step]
		if (!names.has(bindings[i]![0]) || other === undefined || names.has(other[0])) continue
		bindings[i + step] = bindings[i]!
		bindings[i] = other
	}
	return new LetAST(bindings, root.body)
}

/** How much of the program cannot be worked out, going into groups, as they give nothing. */
const errorsIn = (root: AST, env: Env): number =>
	viewOf(root, env).slots.reduce((count, { key, ast, env: rowEnv }) => {
		if (!key.startsWith(BINDING)) return count
		const node = ast.kind === 'meta' ? ast.expr : ast
		return (
			count +
			(node.kind === 'let' && node.body === null
				? errorsIn(node, rowEnv)
				: evaluate(readByName(ast), rowEnv).diagnostics.filter(({ level }) => level === 'error')
						.length)
		)
	}, 0)

/** A name that `root` does not have yet. */
function freeName(root: LetAST, stem: string): string {
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
		: new LetAST([[freeName(root, 'grid'), gridCall(next)], ...root.bindings], root.body)
}

/**
 * `root`, with the rows in a group of their own, where the last of them was. Null with
 * nothing to group, or if that would leave anything not coming to what it did: a path
 * counts how far it goes, so one that goes in or out of the group no longer gets there.
 */
export function grouped(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; row: string } | null {
	const names = namesOf(rows)
	const members = root.bindings.filter(([name]) => names.has(name))
	if (members.length === 0) return null
	const name = freeName(root, 'group')
	const at = root.bindings.reduce((last, [bound], i) => (names.has(bound) ? i : last), 0)
	const bindings = root.bindings.flatMap((binding, i): (readonly [string, AST])[] => {
		if (i === at) return [[name, new LetAST(members, null)]]
		return names.has(binding[0]) ? [] : [binding]
	})
	const ast = new LetAST(bindings, root.body)
	return errorsIn(ast, env) > errorsIn(root, env) ? null : { ast, row: `${BINDING}${name}` }
}

/**
 * `root`, with the groups among the rows let go of, what was in them being where they
 * were. Null if none of them is one, or what is in one would no longer come to the same.
 */
export function ungrouped(
	root: LetAST,
	env: Env,
	rows: readonly string[]
): { ast: LetAST; rows: string[] } | null {
	const names = namesOf(rows)
	const isGroup = ([name, value]: readonly [string, AST]) =>
		names.has(name) && value.kind === 'let' && value.body === null
	if (!root.bindings.some(isGroup)) return null
	const taken = new Set(root.bindings.filter(b => !isGroup(b)).map(([name]) => name))
	const freed: string[] = []
	const bindings = root.bindings.flatMap((binding): (readonly [string, AST])[] => {
		if (!isGroup(binding)) return [binding]
		const members = (binding[1] as LetAST).bindings
		if (members.some(([name]) => taken.has(name))) return [binding]
		for (const [name] of members) {
			taken.add(name)
			freed.push(`${BINDING}${name}`)
		}
		return [...members]
	})
	const ast = new LetAST(bindings, root.body)
	return freed.length === 0 || errorsIn(ast, env) > errorsIn(root, env)
		? null
		: { ast, rows: freed }
}

/** The rows that draw anything, once each, in the order they are drawn. */
export const drawnRows = (root: AST, env: Env): string[] => [
	...new Set(sceneOf(root, env).map(({ row }) => row)),
]

/** The corners around what `rows` draw, or all there is. Null if that is nothing. */
export function boundsOfRows(
	root: AST,
	env: Env,
	rows?: readonly string[]
): readonly [Vec, Vec] | null {
	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
	for (const { row, draw, value } of sceneOf(root, env)) {
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

/** The name of the binding that a row is, if it is one. */
export function nameOfRow(row: string): string | null {
	const key = row.split('/').at(-1)!
	return key.startsWith(BINDING) ? key.slice(BINDING.length) : null
}

/** The row of the same binding, once it has been called `name`. */
export function rowCalled(row: string, name: string): string {
	return [...row.split('/').slice(0, -1), BINDING + name].join('/')
}
