/** A float's height is a number once it has been set, and `null` for as tall as what is in it. */
export type Height = number | null

/** How near a drag has to come to where a float would fit, to take it as meaning that. */
export const SNAP_DISTANCE = 8

export interface Dragged {
	readonly height: Height
	/** It has come to where the float fits, and letting go here means that. */
	readonly snapped: boolean
	/** It has come to the end of the room there is, and letting go here means to stay there. */
	readonly reaches: boolean
}

/** Where a drag of a float's edge leaves it, with `most` as much room as there is. */
export function draggedHeight(wanted: number, most: number, natural: number, min: number): Dragged {
	if (wanted > most - SNAP_DISTANCE) return { height: most, snapped: false, reaches: true }
	const height = Math.max(Math.min(min, natural), wanted)
	return Math.abs(height - natural) < SNAP_DISTANCE
		? { height: null, snapped: true, reaches: false }
		: { height, snapped: false, reaches: false }
}

export interface DraggedTop {
	readonly y: number
	readonly height: Height
	readonly snapped: boolean
	/** It has come up to as far as it can go, and letting go here means to stay there. */
	readonly reaches: boolean
}

/** Where a drag of a float's top leaves it, with its bottom staying where it is. */
export function draggedTop(
	wanted: number,
	bottom: number,
	ceiling: number,
	natural: number,
	min: number
): DraggedTop {
	if (wanted < ceiling + SNAP_DISTANCE) {
		return { y: ceiling, height: bottom - ceiling, snapped: false, reaches: true }
	}
	const y = Math.min(wanted, bottom - min)
	return Math.abs(bottom - y - natural) < SNAP_DISTANCE
		? { y: bottom - natural, height: null, snapped: true, reaches: false }
		: { y, height: bottom - y, snapped: false, reaches: false }
}

export interface Split {
	readonly height: Height
	readonly other: Height
	/** One or the other has come to where it fits. */
	readonly snapped: boolean
}

/**
 * Where a drag of the line between two joined floats leaves them, whose heights come to `sum`
 * whatever happens: it only divides that between them.
 */
export function draggedSplit(
	wanted: number,
	sum: number,
	natural: number,
	naturalOther: number,
	min: number
): Split {
	const height = Math.max(min, Math.min(wanted, sum - min))
	if (Math.abs(height - natural) < SNAP_DISTANCE) return { height: null, other: sum - natural, snapped: true }
	if (Math.abs(sum - height - naturalOther) < SNAP_DISTANCE) {
		return { height: sum - naturalOther, other: null, snapped: true }
	}
	return { height, other: sum - height, snapped: false }
}
