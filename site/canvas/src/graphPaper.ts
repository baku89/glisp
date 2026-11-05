/**
 * What is laid over a canvas to see by. A program says which, by `graphPaper`, and it goes by the
 * program's coordinates so that it moves and zooms along with what is drawn. It is drawn in the
 * end too, as `svg.ts` has it, as it looks at full size: which is always `step` apart.
 */

export type GraphPaperKind = 'dots' | 'lines'

/** How far apart they are at full size, until it is said otherwise. */
export const PAPER_STEP = 20

/** How far under full size a step can come on screen, before it goes to the next. */
const LEAST_SCALE = 0.8

/** Closer than this on screen they are only a blur, and there would be too many to draw. */
const LEAST_GAP = 2

/**
 * The distance between them in the program's coordinates, at this zoom. Adaptive, it is `step`
 * at full size and a multiple of the one before it as zoom goes down, by 5 and by 2 in turn, so
 * that zooming only leaves some out and those left stay where they are.
 */
export function graphPaperStep(zoom: number, step = PAPER_STEP, adaptive = true): number {
	if (!adaptive) return step
	const tens = 10 ** Math.floor(Math.log10(LEAST_SCALE / zoom))
	const scale = tens * zoom >= LEAST_SCALE ? tens : tens * 5 * zoom >= LEAST_SCALE ? tens * 5 : tens * 10
	return step * scale
}

/** As many pixels as a tile goes up to. Dots further apart are few enough to draw, and stay sharper for it. */
const MOST_TILE_PIXELS = 32

/**
 * The tile that dots `gap` apart on screen repeat as, at `ratio` pixels to one on screen: a whole
 * number of pixels, and what scales that to exactly `gap`. Null, if they are too far apart for one.
 */
export function dotTile(gap: number, ratio: number): { readonly pixels: number; readonly scale: number } | null {
	const pixels = Math.max(1, Math.round(gap * ratio))
	return pixels > MOST_TILE_PIXELS ? null : { pixels, scale: gap / pixels }
}

/**
 * Where they are on screen, along an axis `length` long whose origin is at `offset`. Nothing,
 * if they would come too close to tell apart.
 */
export function graphPaperPositions(
	zoom: number,
	offset: number,
	length: number,
	step = PAPER_STEP,
	adaptive = true
): number[] {
	const gap = graphPaperStep(zoom, step, adaptive) * zoom
	if (gap < LEAST_GAP) return []
	const first = offset - Math.floor(offset / gap) * gap
	const count = Math.max(0, Math.ceil((length - first) / gap))
	return Array.from({ length: count }, (_, i) => first + i * gap)
}
