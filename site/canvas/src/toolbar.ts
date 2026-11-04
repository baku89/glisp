/**
 * Which tools are on the bar, in what order, and which are put away behind it.
 * A tool that is thrown off the bar is still there, behind the dots.
 */

export interface Arrangement {
	readonly shown: readonly string[]
	readonly stowed: readonly string[]
}

/**
 * What was kept, for the tools there are now. A tool that has come since then goes where
 * it would first be, so that a new one does not push itself onto someone's bar.
 */
export function arranged(
	kept: Partial<Arrangement> | null | undefined,
	first: Arrangement
): Arrangement {
	const known = new Set([...first.shown, ...first.stowed])
	const seen = new Set<string>()
	const only = (names: unknown): string[] =>
		(Array.isArray(names) ? (names as unknown[]) : []).filter((name): name is string => {
			if (typeof name !== 'string' || !known.has(name) || seen.has(name)) return false
			seen.add(name)
			return true
		})
	const shown = only(kept?.shown)
	const stowed = only(kept?.stowed)
	return {
		shown: [...shown, ...first.shown.filter(name => !seen.has(name))],
		stowed: [...stowed, ...first.stowed.filter(name => !seen.has(name))],
	}
}

const without = (names: readonly string[], name: string): string[] =>
	names.filter(other => other !== name)

/** With `name` on the bar, at `index` of what would be there with it. */
export function placed({ shown, stowed }: Arrangement, name: string, index: number): Arrangement {
	const rest = without(shown, name)
	const at = Math.max(0, Math.min(rest.length, index))
	return {
		shown: [...rest.slice(0, at), name, ...rest.slice(at)],
		stowed: without(stowed, name),
	}
}

/** With `name` behind the dots, the latest of what is there. */
export const stowedAway = ({ shown, stowed }: Arrangement, name: string): Arrangement => ({
	shown: without(shown, name),
	stowed: [...without(stowed, name), name],
})

/** Which of `count` places, `pitch` apart from `left`, something at `x` is over. */
export const slotAt = (x: number, left: number, pitch: number, count: number): number =>
	Math.max(0, Math.min(count - 1, Math.floor((x - left) / pitch)))

export interface Box {
	readonly left: number
	readonly top: number
	readonly right: number
	readonly bottom: number
}

/** How far a place is from a box, which is nothing inside it. */
export const distanceFrom = (x: number, y: number, box: Box): number =>
	Math.hypot(
		Math.max(box.left - x, 0, x - box.right),
		Math.max(box.top - y, 0, y - box.bottom)
	)

/** How far from the bar something is taken off it, just by being let go of there. */
const OFF_THE_BAR = 40
/** How little it has to have left the bar by, if it was going fast. */
const THROWN_FROM = 8
/** In pixels per millisecond. */
const THROWN_AT = 0.5

/** Whether what was let go of comes off the bar, from how far it is, and how fast it was leaving. */
export const isThrown = (distance: number, leaving: number): boolean =>
	distance >= OFF_THE_BAR || (distance >= THROWN_FROM && leaving >= THROWN_AT)
