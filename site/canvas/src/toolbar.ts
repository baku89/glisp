/**
 * Where the tools are. They are on bars, one of which is always there and the others of which
 * come of tools being taken off of one, and can go into folders on those. What is on no bar
 * is put away behind the dots.
 */

export type Wall = 'top' | 'right' | 'bottom' | 'left'

/** Several tools in one place on a bar, which shows one of them. */
export interface Folder {
	readonly tools: readonly string[]
	readonly active: string
}

export type Slot = string | Folder

export interface Bar {
	readonly id: string
	readonly slots: readonly Slot[]
	/** Where its middle is, as a part of the window across and down. */
	readonly x: number
	readonly y: number
	/** The wall of the window that it is attached to. */
	readonly wall: Wall | null
	/** How many tools go across before going on to the next line, or `null` for all of them. */
	readonly columns: number | null
}

export interface Arrangement {
	readonly bars: readonly Bar[]
	readonly stowed: readonly string[]
}

/** What there is to start from. */
export interface FirstTools {
	readonly shown: readonly string[]
	readonly stowed: readonly string[]
}

/** The bar that is always there, which says what else there is. */
export const MAIN_BAR = 'main'

/** What the panels know a bar by, as one of them. */
export const barPanel = (id: string): string => `glisp.canvas.toolbar.${id}`

const MAIN_PLACE = { x: 0.5, y: 1, wall: 'bottom', columns: null } as const

export const toolsOf = (slot: Slot): readonly string[] => (typeof slot === 'string' ? [slot] : slot.tools)

const toolsOfBars = (bars: readonly Bar[]): readonly string[] =>
	bars.flatMap(({ slots }) => slots.flatMap(toolsOf))

/** The one that a place on a bar shows, which is the one in use if that is in it. */
export function shownOf(slot: Slot, inUse: string): string {
	if (typeof slot === 'string') return slot
	return slot.tools.includes(inUse) ? inUse : slot.active
}

/**
 * What was kept, for the tools there are now. A tool that has come since then goes where
 * it would first be, so that a new one does not push itself onto someone's bar.
 */
export function arranged(kept: unknown, first: FirstTools): Arrangement {
	const known = new Set([...first.shown, ...first.stowed])
	const seen = new Set<string>()
	const take = (name: unknown): name is string => {
		if (typeof name !== 'string' || !known.has(name) || seen.has(name)) return false
		seen.add(name)
		return true
	}
	const only = (names: unknown): string[] => (Array.isArray(names) ? (names as unknown[]) : []).filter(take)
	const record = (typeof kept === 'object' && kept !== null ? kept : {}) as Record<string, unknown>

	const slotsOf = (slots: unknown): Slot[] =>
		(Array.isArray(slots) ? (slots as unknown[]) : []).flatMap((slot): Slot[] => {
			if (typeof slot === 'string') return take(slot) ? [slot] : []
			const { tools, active } = (typeof slot === 'object' && slot !== null ? slot : {}) as Record<string, unknown>
			return folderOr(only(tools), active)
		})

	const bars: Bar[] = (Array.isArray(record.bars) ? (record.bars as unknown[]) : []).flatMap(value => {
		const bar = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
		if (typeof bar.id !== 'string') return []
		const slots = slotsOf(bar.slots)
		if (slots.length === 0 && bar.id !== MAIN_BAR) return []
		return [
			{
				id: bar.id,
				slots,
				x: fraction(bar.x, 0.5),
				y: fraction(bar.y, 0.5),
				wall: isWall(bar.wall) ? bar.wall : null,
				columns: typeof bar.columns === 'number' && bar.columns >= 1 ? Math.floor(bar.columns) : null,
			},
		]
	})

	// What was kept before there could be more than one bar.
	const main = bars.find(({ id }) => id === MAIN_BAR) ?? { id: MAIN_BAR, slots: only(record.shown), ...MAIN_PLACE }
	const others = bars.filter(bar => bar !== main)
	const stowed = only(record.stowed)
	const withNew = { ...main, slots: [...main.slots, ...first.shown.filter(name => !seen.has(name))] }
	first.shown.forEach(name => seen.add(name))
	return {
		bars: [withNew, ...others],
		stowed: [...stowed, ...first.stowed.filter(name => !seen.has(name))],
	}
}

const isWall = (wall: unknown): wall is Wall =>
	wall === 'top' || wall === 'right' || wall === 'bottom' || wall === 'left'

const fraction = (value: unknown, otherwise: number): number =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : otherwise

/** Which comes of what is left in a folder: nothing, the one tool itself, or still a folder. */
function folderOr(tools: readonly string[], active: unknown): Slot[] {
	const [first, second] = tools
	if (first === undefined) return []
	if (second === undefined) return [first]
	return [{ tools, active: typeof active === 'string' && tools.includes(active) ? active : first }]
}

/** With these tools off of every bar and out from behind the dots. */
function taken({ bars, stowed }: Arrangement, names: readonly string[]): Arrangement {
	return {
		stowed: stowed.filter(name => !names.includes(name)),
		bars: bars
			.map(bar => ({
				...bar,
				slots: bar.slots.flatMap(slot =>
					typeof slot === 'string'
						? names.includes(slot)
							? []
							: [slot]
						: folderOr(slot.tools.filter(name => !names.includes(name)), slot.active)
				),
			}))
			.filter(bar => bar.slots.length > 0 || bar.id === MAIN_BAR),
	}
}

const sameTools = (a: Slot, b: Slot): boolean => toolsOf(a).join() === toolsOf(b).join()

/** With what is in `slot` at `index` of the places on a bar, as they are before it is taken. */
export function placed(arrangement: Arrangement, slot: Slot, barId: string, index: number): Arrangement {
	const from = arrangement.bars.find(({ id }) => id === barId)
	if (from === undefined) return arrangement
	const before = from.slots.slice(0, index).filter(other => !sameTools(other, slot)).length
	const rest = taken(arrangement, toolsOf(slot))
	const target = rest.bars.find(({ id }) => id === barId)
	// It was the last on that bar, so that bar is gone along with it, and it stays as it was.
	if (target === undefined) return arrangement
	return {
		...rest,
		bars: rest.bars.map(bar =>
			bar === target ? { ...bar, slots: [...bar.slots.slice(0, before), slot, ...bar.slots.slice(before)] } : bar
		),
	}
}

/** With what is in `slot` in a folder with the tool `on`, which it makes if there is not one. */
export function foldered(arrangement: Arrangement, slot: Slot, on: string): Arrangement {
	const names = toolsOf(slot)
	if (names.includes(on)) return arrangement
	const rest = taken(arrangement, names)
	const shows = typeof slot === 'string' ? slot : slot.active
	return {
		...rest,
		bars: rest.bars.map(bar => ({
			...bar,
			slots: bar.slots.map(other =>
				toolsOf(other).includes(on) ? { tools: [...toolsOf(other), ...names], active: shows } : other
			),
		})),
	}
}

const nextBarId = (bars: readonly Bar[]): string => {
	const used = new Set(bars.map(({ id }) => id))
	let n = 1
	while (used.has(`bar${n}`)) n++
	return `bar${n}`
}

export interface BarPlace {
	readonly x: number
	readonly y: number
	readonly wall: Wall | null
}

/** With what is in `slot` on a bar of its own. */
export function separated(arrangement: Arrangement, slot: Slot, place: BarPlace): Arrangement {
	const rest = taken(arrangement, toolsOf(slot))
	const bar: Bar = {
		id: nextBarId(rest.bars),
		slots: [slot],
		...place,
		columns: columnsOn(place.wall, null),
	}
	return { ...rest, bars: [...rest.bars, bar] }
}

/** With what is in `slot` behind the dots, the latest of what is there. */
export function stowedAway(arrangement: Arrangement, slot: Slot): Arrangement {
	const names = toolsOf(slot)
	const rest = taken(arrangement, names)
	return { ...rest, stowed: [...rest.stowed, ...names] }
}

/** How many go across on a wall, standing up along one at the side and lying along one at the end. */
function columnsOn(wall: Wall | null, columns: number | null): number | null {
	if ((wall === 'left' || wall === 'right') && columns === null) return 1
	if ((wall === 'top' || wall === 'bottom') && columns === 1) return null
	return columns
}

export function movedBar(arrangement: Arrangement, id: string, place: BarPlace): Arrangement {
	return {
		...arrangement,
		bars: arrangement.bars.map(bar =>
			bar.id === id ? { ...bar, ...place, columns: columnsOn(place.wall, bar.columns) } : bar
		),
	}
}

/** With a bar's tools going on another, at `index` of its places. The main bar stays itself. */
export function mergedBars(arrangement: Arrangement, id: string, into: string, index: number): Arrangement {
	const from = arrangement.bars.find(bar => bar.id === id)
	if (from === undefined || id === into || id === MAIN_BAR) return arrangement
	return {
		...arrangement,
		bars: arrangement.bars
			.filter(bar => bar !== from)
			.map(bar =>
				bar.id === into
					? { ...bar, slots: [...bar.slots.slice(0, index), ...from.slots, ...bar.slots.slice(index)] }
					: bar
			),
	}
}

/** With a folder showing this tool, for when it is next not in use. */
export function shownInFolder(arrangement: Arrangement, name: string): Arrangement {
	return {
		...arrangement,
		bars: arrangement.bars.map(bar => ({
			...bar,
			slots: bar.slots.map(slot =>
				typeof slot !== 'string' && slot.tools.includes(name) ? { ...slot, active: name } : slot
			),
		})),
	}
}

export function withColumns(arrangement: Arrangement, id: string, columns: number): Arrangement {
	return {
		...arrangement,
		bars: arrangement.bars.map(bar =>
			bar.id === id ? { ...bar, columns: columns >= bar.slots.length ? null : Math.max(1, columns) } : bar
		),
	}
}

export interface Box {
	readonly left: number
	readonly top: number
	readonly right: number
	readonly bottom: number
}

/** How far a place is from a box, which is nothing inside it. */
export const distanceFrom = (x: number, y: number, box: Box): number =>
	Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom))

/** How near something has to come to a wall, to take it as meaning that wall. */
export const SNAP = 16

export interface Size {
	readonly width: number
	readonly height: number
}

/** Where a bar of this size goes, with its middle at `x` and `y` in the window. */
export function barPlaceAt(x: number, y: number, size: Size, stage: Size): BarPlace {
	const across = (at: number, own: number, whole: number) => Math.max(own / 2, Math.min(whole - own / 2, at))
	const cx = across(x, size.width, stage.width)
	const cy = across(y, size.height, stage.height)
	const offs: readonly (readonly [Wall, number])[] = [
		['left', cx - size.width / 2],
		['right', stage.width - cx - size.width / 2],
		['top', cy - size.height / 2],
		['bottom', stage.height - cy - size.height / 2],
	]
	const nearest = [...offs].sort((a, b) => a[1] - b[1])[0]!
	const wall = nearest[1] < SNAP ? nearest[0] : null
	return {
		x: wall === 'left' ? 0 : wall === 'right' ? 1 : cx / stage.width,
		y: wall === 'top' ? 0 : wall === 'bottom' ? 1 : cy / stage.height,
		wall,
	}
}

export type Drop =
	| { readonly kind: 'into'; readonly index: number }
	| { readonly kind: 'at'; readonly index: number }

/** How much of the middle of a place, each way, means going into it rather than beside it. */
const INTO = 0.3

/** What being let go of here does, among the places on a bar in the order they go. */
export function dropAmong(cells: readonly Box[], x: number, y: number, standing: boolean): Drop {
	const [first] = cells
	if (first === undefined) return { kind: 'at', index: 0 }
	const distances = cells.map(cell => distanceFrom(x, y, cell))
	const index = distances.indexOf(Math.min(...distances))
	const cell = cells[index]!
	const middle = [(cell.left + cell.right) / 2, (cell.top + cell.bottom) / 2] as const
	const offs = [x - middle[0], y - middle[1]] as const
	if (
		Math.abs(offs[0]) < (cell.right - cell.left) * INTO &&
		Math.abs(offs[1]) < (cell.bottom - cell.top) * INTO
	) {
		return { kind: 'into', index }
	}
	return { kind: 'at', index: (standing ? offs[1] : offs[0]) > 0 ? index + 1 : index }
}
