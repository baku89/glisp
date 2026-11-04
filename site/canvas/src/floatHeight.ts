/** A float's height is a number once it has been set, and `null` for as tall as what is in it. */
export type Height = number | null

/** How near a drag has to come to where a float would fit, to take it as meaning that. */
export const SNAP_DISTANCE = 8

export interface Dragged {
	readonly height: Height
	/** It has come to where the float fits, and letting go here means that. */
	readonly snapped: boolean
}

/** Where a drag of a float's edge leaves it, with `most` as much room as there is. */
export function draggedHeight(wanted: number, most: number, natural: number, min: number): Dragged {
	const fit = Math.min(natural, most)
	const height = Math.max(Math.min(min, fit), Math.min(wanted, most))
	return Math.abs(height - fit) < SNAP_DISTANCE
		? { height: null, snapped: true }
		: { height, snapped: false }
}
