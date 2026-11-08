/**
 * The dash of a line as a kind, which is what there is to choose from, and as the
 * lengths themselves. A kind is in terms of the line's width, which a dash is seen
 * against: three widths on and two off reads as dashed at any width.
 */

export const DASH_KINDS = ['solid', 'dashed', 'dotted', 'dashDot', 'custom'] as const
export type DashKind = (typeof DASH_KINDS)[number]

/** Each kind as on and off lengths, in widths. */
const PATTERNS: Readonly<Record<Exclude<DashKind, 'custom'>, readonly number[]>> = {
	solid: [],
	dashed: [3, 2],
	dotted: [1, 1],
	dashDot: [3, 1, 1, 1],
}

export const DASH_ICONS: Readonly<Record<DashKind, string>> = {
	solid: 'fill:M2 11h20v2H2z',
	dashed: 'fill:M2 11h6v2H2zM10 11h6v2h-6zM18 11h4v2h-4z',
	dotted: 'fill:M2 11h2v2H2zM6 11h2v2H6zM10 11h2v2h-2zM14 11h2v2h-2zM18 11h2v2h-2z',
	dashDot: 'fill:M2 11h6v2H2zM10 11h2v2h-2zM14 11h6v2h-6z',
	custom: 'mdi:tune-variant',
}

const rounded = (n: number): number => Math.round(n * 10) / 10

/** The lengths of `kind` on a line `width` wide. For `custom`, what is there, or a dash to start from. */
export function dashOf(kind: DashKind, width: number, current: readonly number[] = []): number[] {
	if (kind === 'custom') return current.length > 0 ? [...current] : dashOf('dashed', width)
	return PATTERNS[kind].map(times => rounded(times * Math.max(width, 1)))
}

/** Which kind `dash` is, on a line `width` wide, which is `custom` if it is none of the others. */
export function dashKindOf(dash: readonly number[], width: number): DashKind {
	if (dash.length === 0) return 'solid'
	const written = dash.map(rounded).join()
	for (const kind of DASH_KINDS) {
		if (kind !== 'custom' && kind !== 'solid' && dashOf(kind, width).join() === written) return kind
	}
	return 'custom'
}
