/**
 * Where the panels are, over the canvas. A panel is always in a group, of it alone or with
 * others as tabs, of which one shows. A group is always in a stack, of it alone or with others
 * joined one after another along the edge it is on, and a stack goes together.
 *
 * It is the same on each edge: what is said of going down an edge at the side is said of going
 * across one at the top or the bottom, as `along`, and how wide a panel is at the side is how
 * tall it is at the top, as how thick it is.
 */

export type Side = 'left' | 'right' | 'top' | 'bottom'

/** An edge at the side, which goes from the top of the window down. */
export const isUpright = (side: Side): boolean => side === 'left' || side === 'right'

export interface Place {
	/** The side of the window that it is kept from, which is the nearer one. */
	readonly side: Side
	/** How far it is from there, and on that edge at 0. */
	readonly inset: number
	/**
	 * How far along the edge it starts, from the top or the left of the window, or that it is
	 * attached to the end of the edge, growing back from there, or that it is in the middle.
	 */
	readonly along: number | 'end' | 'middle'
}

export interface Group {
	readonly tabs: readonly string[]
	/** The one of them that shows. */
	readonly active: string
}

export interface Stack extends Place {
	/** From the start of the edge on. */
	readonly groups: readonly Group[]
	/** It goes on as far as there is room, rather than ending where what is in it ends. */
	readonly full: boolean
	/** Which of them takes up the room that is left, when full, if not the last. */
	readonly filler?: string
	/** When it was put where it is, as what came later takes the corner it shares with another. */
	readonly since?: number
}

/** What is later is over what is earlier. */
export type PanelLayout = readonly Stack[]

export interface Size {
	readonly width: number
	readonly height: number
}

/** How near something has to come to an edge, to take it as meaning that edge. */
export const SNAP = 16
/** How near the pointer has to come to where a group could join, to take it as meaning that. */
export const JOIN_DISTANCE = 14
/** Within a group, its header starts this far from the line before it. */
const INTO_HEADER = 6
/** How much of the top of a group is its header, where dropping something makes it a tab. */
export const HEADER_HEIGHT = 36
/** The least of a panel, for one before or after it not to be pushed out of the window. */
export const MIN_HEIGHT = 64
/** How much of a stack stays in the window, at the least, to be taken hold of again. */
export const KEPT_IN_WINDOW = 40
/** What is on an edge stops this short of what is further along it, or across a corner. */
export const GAP = 8
/** A stack at the end of an edge leaves the rest of it to what starts from the start. */
const MOST_FROM_END = 0.6

/** Joined panels share the line between them. */
const SHARED_LINE = 1

export const alone = (name: string): Group => ({ tabs: [name], active: name })

export const namesOf = (groups: readonly Group[]): readonly string[] => groups.flatMap(({ tabs }) => tabs)

export function groupOf(layout: PanelLayout, name: string): Group | undefined {
	return layout.flatMap(({ groups }) => groups).find(({ tabs }) => tabs.includes(name))
}

export function stackOf(layout: PanelLayout, name: string): Stack | undefined {
	return layout.find(({ groups }) => namesOf(groups).includes(name))
}

/** How long panels joined along an edge come to, of the lengths each has. */
export function heightOfStack(lengths: readonly number[]): number {
	return lengths.reduce((sum, length) => sum + length, 0) - SHARED_LINE * Math.max(0, lengths.length - 1)
}

/** How long it is along an edge on `side`. */
export const lengthOf = (size: Size, side: Side): number => (isUpright(side) ? size.height : size.width)
/** How far it comes out from an edge on `side`. */
export const thicknessOf = (size: Size, side: Side): number => (isUpright(side) ? size.width : size.height)

/** The latest that anything has been put anywhere. */
const latest = (layout: PanelLayout): number => Math.max(0, ...layout.map(({ since }) => since ?? 0))

/** Where something of this size at `x` and `y` in the window goes. */
export function placeAt(x: number, y: number, size: Size, stage: Size): Place {
	const left = Math.max(0, Math.min(x, stage.width - KEPT_IN_WINDOW))
	const right = Math.max(0, Math.min(stage.width - x - size.width, stage.width - KEPT_IN_WINDOW))
	const top = Math.max(0, Math.min(y, stage.height - KEPT_IN_WINDOW))
	const bottom = Math.max(0, Math.min(stage.height - y - size.height, stage.height - KEPT_IN_WINDOW))
	const near = ([['left', left], ['right', right], ['top', top], ['bottom', bottom]] as const).filter(
		([, off]) => off < SNAP
	)
	// In a corner, it goes onto the edge that it lies along, as a toolbar lies along the top.
	// In a corner, it goes onto the edge it is nearer, or, as near both, the one it lies along, as
	// a toolbar lies along the top.
	const lying = size.width > size.height * 2
	const onEdge =
		[...near].sort(([a, offA], [b, offB]) => offA - offB || Number(isUpright(a) === lying) - Number(isUpright(b) === lying))[0]?.[0] ?? null

	if (onEdge === null) {
		const side: Side = x + size.width / 2 < stage.width / 2 ? 'left' : 'right'
		return { side, inset: Math.round(side === 'left' ? left : right), along: Math.round(top) }
	}
	const upright = isUpright(onEdge)
	const [start, length, edge] = upright ? [top, size.height, stage.height] : [left, size.width, stage.width]
	if (start < SNAP) return { side: onEdge, inset: 0, along: 0 }
	// What fits in the window stays all in it, so that going past the end comes to rest at it.
	const fits = length <= edge
	if (fits && start + length > edge - SNAP) return { side: onEdge, inset: 0, along: 'end' }
	if (fits && Math.abs(start + length / 2 - edge / 2) < SNAP) return { side: onEdge, inset: 0, along: 'middle' }
	return { side: onEdge, inset: 0, along: Math.round(start) }
}

export interface PanelBox {
	readonly side: Side
	readonly inset: number
	/**
	 * From the start of the edge, which is the top or the left of the window, or else `end` holds
	 * it from the end. Both, and it goes from one to the other.
	 */
	readonly start: number | null
	readonly end: number | null
	/** How long it can be along the edge. */
	readonly most: number
	/** The way along the edge that it can grow, when dragged. */
	readonly grows: 'forward' | 'back'
	/** It is the tab of its group that shows. */
	readonly shown: boolean
	/** What comes next to it within its stack. */
	readonly joinedBefore: boolean
	readonly joinedAfter: boolean
	/** It starts at the start of the edge, under the title bar at a side, and so has no corners or line there. */
	readonly flushStart: boolean
	/** It goes all the way to the end of the edge, and so has no corners or line there. */
	readonly flushEnd: boolean
	/** How far it could reach, from where it starts, on the way that it grows. */
	readonly room: number
	/** A panel of what is next along the edge that way, which it joins on reaching it. */
	readonly neighbor: string | null
	/** How far back its start can go, and a panel of what is there to join on reaching that. */
	readonly ceiling: number
	readonly before: string | null
	/** It is minimized among others that it is joined to, as no more than its header. */
	readonly folded: boolean
}

interface Measured {
	/** How wide and tall each panel is, as of when it last showed. */
	readonly sizes: ReadonlyMap<string, Size>
	readonly stage: Size
	/** What is being moved, which nothing else makes way for, as it is not there yet. */
	readonly held?: readonly string[]
	/** What is minimized. */
	readonly closed?: ReadonlySet<string>
	/** What is as large as what is in it says, as a toolbar is, and so takes up no room left. */
	readonly fixed?: ReadonlySet<string>
}

const sizeOf = ({ sizes }: Measured, name: string): Size => sizes.get(name) ?? { width: 0, height: 0 }

const lengthsOf = (stack: Stack, measured: Measured): number[] =>
	stack.groups.map(({ active }) => lengthOf(sizeOf(measured, active), stack.side))

const thicknessOfStack = (stack: Stack, measured: Measured): number =>
	Math.max(0, ...stack.groups.map(({ active }) => thicknessOf(sizeOf(measured, active), stack.side)))

const edgeLength = (side: Side, { stage }: Measured): number => lengthOf(stage, side)

/** Minimized among others it is joined to, which leaves the rest to them, rather than going to the wall. */
const isFolded = (stack: Stack, group: Group, { closed }: Measured): boolean =>
	stack.groups.length > 1 && (closed?.has(group.active) ?? false)

const isHeld = (stack: Stack, { held }: Measured): boolean =>
	namesOf(stack.groups).some(name => held?.includes(name))

const isDocked = (stack: Stack, measured: Measured): boolean => stack.inset === 0 && !isHeld(stack, measured)

/** What goes before the other in taking a corner: what was put where it is later. */
function comesFirst(layout: PanelLayout, a: Stack, b: Stack): boolean {
	const [sa, sb] = [a.since ?? 0, b.since ?? 0]
	return sa !== sb ? sa > sb : layout.indexOf(a) > layout.indexOf(b)
}

/** The edges that start and end an edge on `side`, as the top and the bottom do one at the side. */
const endsOf = (side: Side): readonly [Side, Side] => (isUpright(side) ? ['top', 'bottom'] : ['left', 'right'])

/** Works out where each stack is along its edge, with the corners going to what came later. */
function layoutOf(layout: PanelLayout, measured: Measured) {
	const bounds = new Map<Stack, readonly [number, number]>()
	const ranges = new Map<Stack, readonly [number, number]>()

	/** Where it is along the edge, with the lengths that the panels have now. */
	function rangeOf(stack: Stack): readonly [number, number] {
		const known = ranges.get(stack)
		if (known !== undefined) return known
		const length = heightOfStack(lengthsOf(stack, measured))
		const [lo, hi] = boundsOf(stack)
		const start =
			stack.along === 'end'
				? hi - length
				: stack.along === 'middle'
					? Math.max(lo, (edgeLength(stack.side, measured) - length) / 2)
					: Math.max(lo, stack.along)
		const range: readonly [number, number] = [start, start + length]
		ranges.set(stack, range)
		return range
	}

	/** How far along its edge it can be, for what across a corner has taken it. */
	function boundsOf(stack: Stack): readonly [number, number] {
		const known = bounds.get(stack)
		if (known !== undefined) return known
		const length = edgeLength(stack.side, measured)
		let [lo, hi] = [0, length]
		if (isDocked(stack, measured)) {
			const [startSide, endSide] = endsOf(stack.side)
			const thick = thicknessOfStack(stack, measured)
			for (const other of layout) {
				if (other === stack || !isDocked(other, measured) || !comesFirst(layout, other, stack)) continue
				if (other.side !== startSide && other.side !== endSide) continue
				// Where this one is, along the other's edge, which is across this one.
				const across = edgeLength(other.side, measured)
				const strip: readonly [number, number] =
					stack.side === endsOf(other.side)[0] ? [0, thick] : [across - thick, across]
				const [from, to] = rangeOf(other)
				if (to <= strip[0] || from >= strip[1]) continue
				const taken = thicknessOfStack(other, measured) + GAP
				if (other.side === startSide) lo = Math.max(lo, taken)
				else hi = Math.min(hi, length - taken)
			}
		}
		const done: readonly [number, number] = [lo, Math.max(lo, hi)]
		bounds.set(stack, done)
		return done
	}

	/** What else is on the same edge, that it would run into. */
	const othersOnEdge = (stack: Stack): readonly Stack[] =>
		!isDocked(stack, measured)
			? []
			: layout.filter(other => other !== stack && other.side === stack.side && isDocked(other, measured))

	/** What is next further along the edge. */
	const nextOn = (stack: Stack): Stack | undefined => {
		const [start] = rangeOf(stack)
		return othersOnEdge(stack)
			.filter(other => rangeOf(other)[0] > start)
			.sort((a, b) => rangeOf(a)[0] - rangeOf(b)[0])[0]
	}

	/** What is next further back along the edge. */
	const nextBack = (stack: Stack): Stack | undefined => {
		const [start] = rangeOf(stack)
		return othersOnEdge(stack)
			.filter(other => rangeOf(other)[0] < start)
			.sort((a, b) => rangeOf(b)[1] - rangeOf(a)[1])[0]
	}

	/** How far along it can go: to what starts further along the edge, or else to the end of it. */
	const limitOf = (stack: Stack): number => {
		const next = nextOn(stack)
		return next === undefined ? boundsOf(stack)[1] : rangeOf(next)[0] - GAP
	}

	return { rangeOf, boundsOf, othersOnEdge, nextOn, nextBack, limitOf }
}

/** Where each panel goes, for what they each measure now. Tabs of a group go to the same place. */
export function boxesOf(layout: PanelLayout, measured: Measured): ReadonlyMap<string, PanelBox> {
	const boxes = new Map<string, PanelBox>()
	const { rangeOf, boundsOf, othersOnEdge, nextOn, nextBack, limitOf } = layoutOf(layout, measured)
	const setAll = (stack: Stack, group: Group, box: Omit<PanelBox, 'shown' | 'folded'>) => {
		const folded = isFolded(stack, group, measured)
		for (const tab of group.tabs) boxes.set(tab, { ...box, shown: tab === group.active, folded })
	}
	for (const stack of layout) {
		const count = stack.groups.length
		const edge = edgeLength(stack.side, measured)
		const across = lengthOf(measured.stage, isUpright(stack.side) ? 'top' : 'left')
		const thick = thicknessOfStack(stack, measured)
		const inset = Math.max(0, Math.min(stack.inset, across - KEPT_IN_WINDOW))
		const atBoth = { side: stack.side, inset: inset === 0 ? 0 : Math.min(inset, Math.max(1, across - thick)) }
		const [lo, hi] = boundsOf(stack)
		const lengthOfGroup = (group: Group) => lengthOf(sizeOf(measured, group.active), stack.side)
		const before = nextBack(stack)
		const ceiling = before === undefined ? lo : rangeOf(before)[1] + GAP
		const beforeName = before?.groups.at(-1)?.active ?? null

		if (stack.along === 'end') {
			const sharesEdge = othersOnEdge(stack).some(other => other.along !== 'end')
			const most = sharesEdge ? (hi - lo) * MOST_FROM_END : hi - lo
			let after = edge - hi
			for (let i = count - 1; i >= 0; i--) {
				const group = stack.groups[i]!
				const rest = i * MIN_HEIGHT
				const fromEnd = after - (edge - hi)
				setAll(stack, group, {
					...atBoth,
					start: null,
					end: after,
					most: Math.max(MIN_HEIGHT, most - fromEnd - rest),
					grows: 'back',
					joinedBefore: i > 0,
					joinedAfter: i < count - 1,
					flushStart: i === 0 && after + lengthOfGroup(group) >= edge,
					flushEnd: i === count - 1 && hi === edge,
					room: Math.max(MIN_HEIGHT, hi - ceiling - fromEnd - rest),
					neighbor: beforeName,
					ceiling,
					before: beforeName,
				})
				after += lengthOfGroup(group) - SHARED_LINE
			}
			continue
		}

		const [from] = rangeOf(stack)
		const limit = limitOf(stack)
		const reachesEnd = stack.full && limit === edge
		const fillsAt = stack.full ? fillerAt(stack, measured) : count
		const neighbor = nextOn(stack)?.groups[0]?.active ?? null
		/** How far off the end of the edge it stops, for the room that what follows it takes. */
		const offEnd = (i: number): number =>
			stack.groups.slice(i + 1).reduce((sum, group) => sum + lengthOfGroup(group) - SHARED_LINE, edge - limit)
		let at = from
		stack.groups.forEach((group, i) => {
			const last = i === count - 1
			const rest = (count - 1 - i) * MIN_HEIGHT
			const afterFiller = i > fillsAt
			const most = Math.max(MIN_HEIGHT, limit - (afterFiller ? from + i * MIN_HEIGHT : at) - rest)
			setAll(stack, group, {
				...atBoth,
				start: afterFiller ? null : at,
				end: i >= fillsAt ? offEnd(i) : null,
				most,
				grows: afterFiller ? 'back' : 'forward',
				joinedBefore: i > 0,
				joinedAfter: !last,
				flushStart: i === 0 && from === 0,
				flushEnd: reachesEnd && last,
				room: most,
				neighbor,
				ceiling,
				before: beforeName,
			})
			at += lengthOfGroup(group) - SHARED_LINE
		})
	}
	return boxes
}

/** How long the stack that has `name` can be along its edge, from where it starts to what stops it. */
export function roomOf(layout: PanelLayout, measured: Measured, name: string): number | null {
	const stack = stackOf(layout, name)
	if (stack === undefined) return null
	const { rangeOf, boundsOf, nextBack, limitOf } = layoutOf(layout, measured)
	if (stack.along !== 'end') return limitOf(stack) - rangeOf(stack)[0]
	const before = nextBack(stack)
	const [lo, hi] = boundsOf(stack)
	return hi - (before === undefined ? lo : rangeOf(before)[1] + GAP)
}

/**
 * The lengths of panels joined one after another, made to come to no more than `room` between
 * them: what is over is taken from each that can give, as much as each has over the least that a
 * panel is, and none from what is `kept` as it is.
 */
export function fitted(lengths: readonly number[], room: number, kept: readonly boolean[]): number[] {
	const over = heightOfStack(lengths) - room
	if (over <= 0) return [...lengths]
	const spare = lengths.map((length, i) => (kept[i] ? 0 : Math.max(0, length - MIN_HEIGHT)))
	const all = spare.reduce((sum, n) => sum + n, 0)
	if (all <= 0) return [...lengths]
	const taken = Math.min(over, all)
	return lengths.map((length, i) => Math.round(length - (taken * spare[i]!) / all))
}

/**
 * Which of a stack's groups takes up the room that is left: the one it says, or the last, but
 * not one that is minimized, or as large as what is in it, which leaves that to the nearest other.
 */
function fillerAt(stack: Stack, measured?: Measured): number {
	const said = stack.groups.findIndex(({ tabs }) => stack.filler !== undefined && tabs.includes(stack.filler))
	const at = said < 0 ? stack.groups.length - 1 : said
	const cannot = (group: Group) => isFolded(stack, group, measured!) || (measured!.fixed?.has(group.active) ?? false)
	if (measured === undefined || !cannot(stack.groups[at]!)) return at
	const open = stack.groups
		.map((group, i) => ({ i, folded: cannot(group) }))
		.filter(({ folded }) => !folded)
		.sort((a, b) => Math.abs(a.i - at) - Math.abs(b.i - at) || b.i - a.i)[0]
	return open?.i ?? at
}

/** Which of a stack's groups takes up the room that is left, if it goes as far as there is room. */
export const fillerOf = (stack: Stack, measured: Measured): number | null =>
	stack.full ? fillerAt(stack, measured) : null

/**
 * The stack that has a panel joined to the next along the edge, as one that goes as far as there
 * is room, with that panel taking up what is left.
 */
export function merged(layout: PanelLayout, name: string, neighbor: string): PanelLayout {
	const own = stackOf(layout, name)
	const next = stackOf(layout, neighbor)
	if (own === undefined || next === undefined || own === next) return layout
	const [first, second] = own.along === 'end' ? [next, own] : [own, next]
	const stack: Stack = {
		...first,
		along: first.along === 'end' ? 0 : first.along,
		groups: [...first.groups, ...second.groups],
		full: true,
		filler: name,
	}
	return [...layout.filter(other => other !== own && other !== next), stack]
}

/**
 * The panel across the line that a panel's end moves, within its stack, whose length has to
 * give way, which what takes up the room left does by itself.
 */
export function acrossLine(layout: PanelLayout, name: string, grows: PanelBox['grows']): string | null {
	const stack = stackOf(layout, name)
	if (stack === undefined) return null
	const at = stack.groups.findIndex(({ tabs }) => tabs.includes(name))
	const across = at + (grows === 'forward' ? 1 : -1)
	const group = stack.groups[across]
	if (group === undefined || (stack.full && across === fillerAt(stack))) return null
	return group.active
}

/** The stack that has a panel joined after what is before it, which stays where it is. */
export function joinedUnder(layout: PanelLayout, name: string, before: string): PanelLayout {
	const own = stackOf(layout, name)
	const next = stackOf(layout, before)
	if (own === undefined || next === undefined || own === next) return layout
	const { filler: _, ...place } = next
	const stack: Stack = {
		...place,
		groups: [...next.groups, ...own.groups],
		full: own.full,
		...(own.full ? { filler: own.groups[fillerAt(own)]!.active } : {}),
	}
	return [...layout.filter(other => other !== own && other !== next), stack]
}

/**
 * With what has just come to rest at the end of an edge joined to what goes on along that edge
 * toward it, rather than leaving a gap between.
 */
export function settled(layout: PanelLayout, name: string): PanelLayout {
	const stack = stackOf(layout, name)
	if (stack === undefined || stack.along !== 'end' || stack.inset > 0) return layout
	const before = layout.find(
		other => other !== stack && other.side === stack.side && other.inset === 0 && other.full && other.along !== 'end'
	)
	const filler = before?.groups[fillerAt(before)]?.active
	return filler === undefined ? layout : merged(layout, filler, name)
}

const withoutIn = (group: Group, names: readonly string[]): Group | null => {
	const tabs = group.tabs.filter(name => !names.includes(name))
	const [first] = tabs
	if (first === undefined) return null
	return { tabs, active: tabs.includes(group.active) ? group.active : first }
}

const without = (layout: PanelLayout, names: readonly string[]): PanelLayout =>
	layout
		.map(stack => ({ ...stack, groups: stack.groups.flatMap(group => withoutIn(group, names) ?? []) }))
		.filter(stack => stack.groups.length > 0)

/** The groups taken out of where they are, and put at a place as a stack of their own, on top. */
export function placed(layout: PanelLayout, groups: readonly Group[], place: Place): PanelLayout {
	const was = stackOf(layout, groups[0]?.active ?? '')
	// Still being moved, it stays as late as it was once it was moved.
	const since = was !== undefined && namesOf(was.groups).join() === namesOf(groups).join() ? was.since : undefined
	return [...without(layout, namesOf(groups)), { ...place, groups, full: false, since: since ?? latest(layout) + 1 }]
}

/** The groups joined to the stack that has `to`, so that the first of them is at `at` in it. */
export function joined(layout: PanelLayout, groups: readonly Group[], to: string, at: number): PanelLayout {
	const target = stackOf(layout, to)
	if (target === undefined) return layout
	const names = namesOf(groups)
	const rest = (from: readonly Group[]) => from.flatMap(group => withoutIn(group, names) ?? [])
	const stack: Stack = {
		...target,
		// What took up the room goes on doing so, with what is joined taking only what it needs.
		...(target.full ? { filler: target.groups[fillerAt(target)]!.active } : {}),
		groups: [...rest(target.groups.slice(0, at)), ...groups, ...rest(target.groups.slice(at))],
	}
	return [...without(layout, [...names, ...namesOf(target.groups)]), stack]
}

/** What is in the groups made tabs of the group that has `to`, with what was showing still showing. */
export function tabbed(layout: PanelLayout, groups: readonly Group[], to: string): PanelLayout {
	const names = namesOf(groups)
	const [first] = groups
	if (first === undefined || names.includes(to)) return layout
	return without(layout, names).map(stack => ({
		...stack,
		groups: stack.groups.map(group =>
			group.tabs.includes(to) ? { tabs: [...group.tabs, ...names], active: first.active } : group
		),
	}))
}

/** With the panel being the tab of its group that shows. */
export function activated(layout: PanelLayout, name: string): PanelLayout {
	if (groupOf(layout, name)?.active === name) return layout
	return layout.map(stack => ({
		...stack,
		groups: stack.groups.map(group => (group.tabs.includes(name) ? { ...group, active: name } : group)),
	}))
}

/** With the stack that has the panel as the latest put where it is, as it is being moved. */
export function stamped(layout: PanelLayout, name: string): PanelLayout {
	const stack = stackOf(layout, name)
	if (stack === undefined) return layout
	return layout.map(other => (other === stack ? { ...stack, since: latest(layout) + 1 } : other))
}

/** With the stack that has the panel over the others. */
export function raised(layout: PanelLayout, name: string): PanelLayout {
	const stack = stackOf(layout, name)
	if (stack === undefined || stack === layout.at(-1)) return layout
	return [...layout.filter(other => other !== stack), stack]
}

/** Whether its stack goes on as far as there is room, starting from `along` if that is said. */
export function withFull(layout: PanelLayout, name: string, full: boolean, along?: Place['along']): PanelLayout {
	return layout.map(stack => {
		if (!namesOf(stack.groups).includes(name)) return stack
		// What reaches both ends of the edge no longer sits at the one, or in the middle.
		const from = along ?? (full && typeof stack.along !== 'number' ? 0 : stack.along)
		return stack.full === full && stack.along === from ? stack : { ...stack, along: from, full }
	})
}

export type Join = {
	/** A panel of what it would join. */
	readonly to: string
	/** Where to show that it would, in the window. */
	readonly left: number
	readonly top: number
	readonly width: number
	readonly height: number
} & ({ readonly kind: 'stack'; readonly at: number } | { readonly kind: 'tab' })

export interface PanelRect {
	readonly name: string
	readonly left: number
	readonly top: number
	readonly right: number
	readonly bottom: number
}

/** What a panel let go of here would join, among stacks that are not the one being held. */
export function joinAt(
	x: number,
	y: number,
	layout: PanelLayout,
	rects: readonly PanelRect[],
	held: readonly string[],
	/** What is not to be a tab of anything, or have anything be a tab of it. */
	untabbed: (name: string) => boolean = () => false
): Join | null {
	const rectOf = new Map(rects.map(rect => [rect.name, rect]))
	const tabs = !held.some(untabbed)
	for (const stack of [...layout].reverse()) {
		if (namesOf(stack.groups).some(name => held.includes(name))) continue
		const inStack = stack.groups.flatMap(({ active }) => rectOf.get(active) ?? [])
		const [first] = inStack
		if (first === undefined || inStack.length !== stack.groups.length) continue
		const left = Math.min(...inStack.map(rect => rect.left))
		const right = Math.max(...inStack.map(rect => rect.right))
		const top = Math.min(...inStack.map(rect => rect.top))
		const bottom = Math.max(...inStack.map(rect => rect.bottom))
		const upright = isUpright(stack.side)
		if (upright ? x < left || x > right : y < top || y > bottom) continue

		const header = inStack.find(
			rect =>
				tabs &&
				!untabbed(rect.name) &&
				x >= rect.left &&
				x <= rect.right &&
				y >= rect.top + INTO_HEADER &&
				y < rect.top + HEADER_HEIGHT
		)
		if (header !== undefined) {
			const width = upright ? right - left : header.right - header.left
			return { kind: 'tab', to: header.name, left: upright ? left : header.left, top: header.top, width, height: HEADER_HEIGHT }
		}
		// Joined one after another, down an edge at the side and across one at the top or bottom.
		const lines = upright ? [first.top, ...inStack.map(rect => rect.bottom)] : [first.left, ...inStack.map(rect => rect.right)]
		const near = lines
			.map((line, at) => ({ line, at, distance: Math.abs((upright ? y : x) - line) }))
			.filter(({ distance }) => distance < JOIN_DISTANCE)
			.sort((a, b) => a.distance - b.distance)[0]
		if (near !== undefined) {
			return upright
				? { kind: 'stack', to: first.name, at: near.at, left, top: near.line, width: right - left, height: 0 }
				: { kind: 'stack', to: first.name, at: near.at, left: near.line, top, width: 0, height: bottom - top }
		}
	}
	return null
}

/**
 * What was kept, as far as it still holds, with what it does not say put where it goes by default.
 * `others` are what can be there besides what the defaults have, as a toolbar taken apart is,
 * each with where it goes if nothing says.
 */
export function normalized(
	kept: unknown,
	defaults: PanelLayout,
	others: ReadonlyMap<string, Place> = new Map()
): PanelLayout {
	const known = [...defaults.flatMap(({ groups }) => namesOf(groups)), ...others.keys()]
	const seen = new Set<string>()
	const stacks: Stack[] = []
	for (const raw of Array.isArray(kept) ? (kept as unknown[]) : []) {
		const stack = asStack(raw)
		if (stack === null) continue
		const groups = stack.groups.flatMap(group => {
			const tabs = group.tabs.filter(name => {
				if (!known.includes(name) || seen.has(name)) return false
				seen.add(name)
				return true
			})
			const [first] = tabs
			if (first === undefined) return []
			return [{ tabs, active: tabs.includes(group.active) ? group.active : first }]
		})
		if (groups.length > 0) stacks.push({ ...stack, groups })
	}
	const missing = [...others].flatMap(([name, place]): Stack[] =>
		seen.has(name) ? [] : [{ ...place, groups: [alone(name)], full: false }]
	)
	return [...without(defaults, [...seen]), ...missing, ...stacks]
}

function isGroup(value: unknown): value is Group {
	if (typeof value !== 'object' || value === null) return false
	const { tabs, active } = value as Record<string, unknown>
	return Array.isArray(tabs) && tabs.every(name => typeof name === 'string') && typeof active === 'string'
}

const isSide = (side: unknown): side is Side => side === 'left' || side === 'right' || side === 'top' || side === 'bottom'

/** A stack as it was kept, as one went by how far down it was before it went by how far along. */
function asStack(value: unknown): Stack | null {
	if (typeof value !== 'object' || value === null) return null
	const { groups, side, inset, along, y, full, filler, since } = value as Record<string, unknown>
	const at = along ?? (y === 'bottom' ? 'end' : y)
	const fine =
		Array.isArray(groups) &&
		groups.every(isGroup) &&
		isSide(side) &&
		typeof inset === 'number' &&
		Number.isFinite(inset) &&
		(at === 'end' || at === 'middle' || (typeof at === 'number' && Number.isFinite(at))) &&
		typeof full === 'boolean'
	if (!fine) return null
	return {
		groups: groups as Group[],
		side,
		inset,
		along: at as Place['along'],
		full,
		...(typeof filler === 'string' ? { filler } : {}),
		...(typeof since === 'number' && Number.isFinite(since) ? { since } : {}),
	}
}
