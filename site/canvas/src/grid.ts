/**
 * What is laid over a canvas to see by. It is none of the program, and goes by the
 * program's coordinates only so that it moves and zooms along with what is drawn.
 */

export type GridKind = 'none' | 'dots' | 'lines'

/** The closest two of them come on screen, before some of them go. */
const LEAST_GAP = 16

/** Near enough to be the same place on screen, whatever is left of adding up gaps. */
const ON_AXIS = 1e-6

/**
 * The distance between them in the program's coordinates, at this zoom. One step is a
 * multiple of the one before, as 1, 2, 10, 20, 100 are, so that zooming only leaves some
 * out and those left stay where they are.
 */
export function gridStep(zoom: number): number {
	const power = 10 ** Math.floor(Math.log10(LEAST_GAP / zoom))
	return power * zoom >= LEAST_GAP ? power : power * 2 * zoom >= LEAST_GAP ? power * 2 : power * 10
}

/** Where they are on screen, along an axis `length` long whose origin is at `offset`. */
export function gridPositions(zoom: number, offset: number, length: number): number[] {
	const gap = gridStep(zoom) * zoom
	const first = offset - Math.floor(offset / gap) * gap
	const count = Math.max(0, Math.ceil((length - first) / gap))
	return Array.from({ length: count }, (_, i) => first + i * gap)
}

/** Those that are not on the axis at `axis`, which has a line of its own there. */
export const offAxis = (positions: readonly number[], axis: number): number[] =>
	positions.filter(position => Math.abs(position - axis) > ON_AXIS)
