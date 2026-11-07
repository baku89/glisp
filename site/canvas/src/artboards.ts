/**
 * Artboards on the canvas: pages that hold what is on them, measured from their corner. What is
 * here says where one is, makes one, and has a layer go onto one or off of it, staying where it
 * is on the canvas, as only the numbers it is written in change.
 */

import { type AST, type Env, type LetAST, parse } from '@glisp/lang'
import { moveBinding, withLayerAdded } from '@glisp/tweeq/structure'

import { ARTBOARD_LAYERS, type ArtboardValue, type Change, type Vec } from './graphics'
import {
	artboardOfRow,
	boundsOfRows,
	changed,
	gripAt,
	holdsRows,
	nameOfKind,
	roundedTo,
	rowsPaintedBy,
	sceneOf,
} from './scene'

/** A size an artboard can start as, for what it is to be seen on. */
export interface ArtboardPreset {
	readonly name: string
	readonly label: string
	readonly size: Vec
	readonly icon: string
}

/** What there is to start an artboard from, as Figma has, by what each is for. */
export const ARTBOARD_PRESETS: readonly ArtboardPreset[] = [
	{ name: 'square', label: 'Square', size: [100, 100], icon: 'ph:square' },
	{
		name: 'iphone16',
		label: 'iPhone 16',
		size: [393, 852],
		icon: 'ph:device-mobile',
	},
	{
		name: 'iphone16ProMax',
		label: 'iPhone 16 Pro Max',
		size: [440, 956],
		icon: 'ph:device-mobile',
	},
	{
		name: 'android',
		label: 'Android Compact',
		size: [412, 917],
		icon: 'ph:device-mobile',
	},
	{
		name: 'ipadPro11',
		label: 'iPad Pro 11"',
		size: [834, 1194],
		icon: 'ph:device-tablet',
	},
	{
		name: 'macbookAir',
		label: 'MacBook Air',
		size: [1280, 832],
		icon: 'ph:laptop',
	},
	{ name: 'desktop', label: 'Desktop', size: [1440, 1024], icon: 'ph:desktop' },
	{ name: 'hd', label: 'HD 1080p', size: [1920, 1080], icon: 'ph:monitor' },
	{ name: 'a4', label: 'A4', size: [595, 842], icon: 'ph:file' },
	{ name: 'letter', label: 'Letter', size: [612, 792], icon: 'ph:file' },
	{
		name: 'instagramPost',
		label: 'Instagram Post',
		size: [1080, 1350],
		icon: 'ph:image-square',
	},
	{
		name: 'instagramStory',
		label: 'Instagram Story',
		size: [1080, 1920],
		icon: 'ph:device-mobile-camera',
	},
	{
		name: 'xPost',
		label: 'X Post',
		size: [1200, 675],
		icon: 'ph:chat-circle-text',
	},
	{
		name: 'slide',
		label: 'Slide 16:9',
		size: [1920, 1080],
		icon: 'ph:presentation',
	},
]

export const presetNamed = (name: string): ArtboardPreset =>
	ARTBOARD_PRESETS.find(preset => preset.name === name) ?? ARTBOARD_PRESETS[0]!

/** The size of `preset`, the other way around if it is to be `landscape` and is not, or is and is not to be. */
export function sizeOf(preset: ArtboardPreset, landscape: boolean): Vec {
	const [w, h] = preset.size
	return w > h === landscape || w === h ? [w, h] : [h, w]
}

/** An artboard there is on the canvas: its row and its area there. */
export interface Board {
	readonly row: string
	readonly value: ArtboardValue
}

/** The artboards in `root`, those in front first, of those on the canvas as it is. */
export function boardsIn(root: AST, env: Env): Board[] {
	return sceneOf(root, env)
		.filter(({ draw }) => draw === 'artboard')
		.reverse()
		.flatMap(({ row }) => {
			const value = artboardOfRow(root, env, row)
			return value === null ? [] : [{ row, value }]
		})
}

const isInside = ({ value: { area } }: Board, [x, y]: Vec): boolean =>
	x >= area.origin[0] && y >= area.origin[1] && x <= area.origin[0] + area.size[0] && y <= area.origin[1] + area.size[1]

/** The artboard in front that `at` is on, if any, other than what is at `except` or in it. */
export function boardAt(root: AST, env: Env, at: Vec, except: readonly string[] = []): Board | null {
	return (
		boardsIn(root, env).find(
			board => isInside(board, at) && !except.some(row => board.row === row || board.row.startsWith(`${row}/`))
		) ?? null
	)
}

/** The artboard that holds the row at `row`, the nearest around it, if any. */
export function boardOf(root: AST, env: Env, row: string): Board | null {
	const boards = boardsIn(root, env).filter(board => row.startsWith(`${board.row}/`))
	return boards.sort((a, b) => b.row.length - a.row.length)[0] ?? null
}

/** The row an artboard holds what is on it at. */
export const layersRowOf = (board: string): string => `${board}/arg${ARTBOARD_LAYERS}`

/** `root` with a new artboard named `name` in front, over the area between `from` and `to`. */
export function artboardDrawn(root: LetAST, name: string, from: Vec, to: Vec, step: number): LetAST {
	const rounded = (n: number) => roundedTo(n, step)
	const corner: Vec = [Math.min(from[0], to[0]), Math.min(from[1], to[1])]
	const size: Vec = [Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])]
	return withArtboardAdded(root, name, [rounded(corner[0]), rounded(corner[1])], [rounded(size[0]), rounded(size[1])])
}

/** `root` with a new artboard named `name` in front, at `origin`, as large as `size`. */
export const withArtboardAdded = (root: LetAST, name: string, origin: Vec, size: Vec): LetAST =>
	withLayerAdded(root, name, parse(`(artboard (rect [${origin[0]} ${origin[1]}] [${size[0]} ${size[1]}]) [])`))

/** The name for a new artboard, the first of `artboard1`, `artboard2`, … not taken. */
export const nameForArtboard = (root: LetAST): string => nameOfKind(root, 'artboard')

/** Where what is at `board` is measured from, or the canvas's own corner, for none. */
const originOf = (root: AST, env: Env, board: string | null): Vec =>
	board === null ? [0, 0] : (artboardOfRow(root, env, board)?.area.origin ?? [0, 0])

/** The row of what holds the row at `row`. */
const holderOf = (row: string): string => row.split('/').slice(0, -1).join('/')

/**
 * `root` with the layer at `row` put onto the artboard at `board`, in front of what is on it, or
 * off of any onto the canvas, for `null`, where it was on the canvas still: its numbers are what
 * change, by how far apart the corners are that they are measured from. Its row there is
 * `row` of the result. Null if it cannot go there, or is there already.
 */
export function withLayerOnto(
	root: AST,
	env: Env,
	row: string,
	board: string | null
): { readonly ast: AST; readonly row: string } | null {
	const from = boardOf(root, env, row)
	if ((from?.row ?? null) === board) return null
	if (board !== null && (board === row || board.startsWith(`${row}/`))) return null
	const key = row.split('/').at(-1)!
	// Only what is in the program's own layers, or on an artboard, goes from one to the other.
	if (from === null ? holderOf(row) !== '' : holderOf(row) !== layersRowOf(from.row)) return null
	const moved =
		board === null ? moveToCanvas(root, env, row, from!.row) : moveBinding(root, env, row, layersRowOf(board), 'inside')
	if (moved === null) return null
	const next = board === null ? key : `${layersRowOf(board)}/${key}`
	const [ax, ay] = originOf(root, env, from?.row ?? null)
	const [bx, by] = originOf(moved, env, board)
	const delta: Vec = [ax - bx, ay - by]
	if (delta[0] === 0 && delta[1] === 0) return { ast: moved, row: next }
	const shifted = shiftedBy(moved, env, next, delta)
	return shifted === null ? null : { ast: shifted, row: next }
}

/** `root` with what is at `row` moved to the canvas's own layers, just in front of the artboard it was on. */
const moveToCanvas = (root: AST, env: Env, row: string, board: string): AST | null =>
	moveBinding(root, env, row, board, 'before')

/** `root` with what is drawn at `row`, or in it, all moved by `delta`. Null if any of it cannot be. */
function shiftedBy(root: AST, env: Env, row: string, delta: Vec): AST | null {
	const parts = holdsRows(root, env, row) ? rowsPaintedBy(root, env, row) : [row]
	let next: AST | null = root
	for (const part of parts) {
		if (next === null) return null
		const move: ((delta: Vec) => readonly Change[]) | undefined = gripAt(next, env, part)?.move
		if (move === undefined) return null
		next = changed(next, env, part, move(delta)).ast
	}
	return next
}

/**
 * `root` with each of `rows` that is wholly within the area of the artboard at `board` put onto
 * it, as drawing an artboard around things takes them in. Those not put on it stay as they are.
 */
export function withLayersTakenIn(root: AST, env: Env, rows: readonly string[], board: string): AST {
	const value = artboardOfRow(root, env, board)
	if (value === null) return root
	const [[left, top], [right, bottom]] = [
		value.area.origin,
		[value.area.origin[0] + value.area.size[0], value.area.origin[1] + value.area.size[1]],
	]
	let next = root
	// What is at the back goes on first, so that what is in front stays so.
	for (const row of [...rows].reverse()) {
		if (row === board) continue
		const box = boundsOfRows(sceneOf(next, env), [row])
		if (box === null) continue
		const [[x0, y0], [x1, y1]] = box
		if (x0 < left || y0 < top || x1 > right || y1 > bottom) continue
		next = withLayerOnto(next, env, row, board)?.ast ?? next
	}
	return next
}

/** The rows of the canvas's own layers, not artboards, in front first. */
export function canvasLayersOf(root: AST, env: Env): string[] {
	const seen = new Set<string>()
	for (const { row, draw } of [...sceneOf(root, env)].reverse()) {
		const top = row.split('/')[0]!
		if (draw === 'artboard' && row === top) continue
		if (boardsIn(root, env).some(board => board.row === top)) continue
		seen.add(top)
	}
	return [...seen]
}

/**
 * `root` with the layer at `row` on the artboard `at` is on, or off of any if it is on none,
 * as what is dragged goes where it is let go. Its row is `row` of the result, or as it was.
 */
export function withLayerWhere(root: AST, env: Env, row: string, at: Vec): { readonly ast: AST; readonly row: string } {
	const board = boardAt(root, env, at, [row])
	return withLayerOnto(root, env, row, board?.row ?? null) ?? { ast: root, row }
}
