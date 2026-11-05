/**
 * Where the panels are, over the canvas. A panel is always in a group, of it alone or with
 * others as tabs, of which one shows. A group is always in a stack, of it alone or with others
 * joined one under another, and a stack goes together.
 */

export type Side = 'left' | 'right'

export interface Place {
	/** The side of the window that it is kept from, which is the nearer one. */
	readonly side: Side
	/** How far it is from there, and on that edge at 0. */
	readonly inset: number
	/** How far down it is, or that it is attached to the end of the window, growing up from there. */
	readonly y: number | 'bottom'
}

export interface Group {
	readonly tabs: readonly string[]
	/** The one of them that shows. */
	readonly active: string
}

export interface Stack extends Place {
	/** From the top down. */
	readonly groups: readonly Group[]
	/** It goes on as far as there is room, rather than ending where what is in it ends. */
	readonly full: boolean
	/** Which of them takes up the room that is left, when full, if not the last. */
	readonly filler?: string
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
/** Within a group, its header starts this far from the line above it. */
const INTO_HEADER = 6
/** How much of the top of a group is its header, where dropping something makes it a tab. */
export const HEADER_HEIGHT = 36
/** The least of a panel, for one above or below not to be pushed out of the window. */
export const MIN_HEIGHT = 64
/** How much of a stack stays in the window, at the least, to be taken hold of again. */
export const KEPT_IN_WINDOW = 40
/** What is on an edge stops this short of what is further along it. */
export const GAP = 8
/** A stack at the end of an edge leaves the rest of it to what starts from the top. */
const MOST_FROM_BOTTOM = 0.6

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

export function heightOfStack(heights: readonly number[]): number {
	return heights.reduce((sum, height) => sum + height, 0) - SHARED_LINE * Math.max(0, heights.length - 1)
}

/** Where something of this size at `x` and `y` in the window goes. */
export function placeAt(x: number, y: number, size: Size, stage: Size): Place {
	const left = Math.max(0, Math.min(x, stage.width - KEPT_IN_WINDOW))
	const right = Math.max(0, Math.min(stage.width - x - size.width, stage.width - KEPT_IN_WINDOW))
	const side: Side = x + size.width / 2 < stage.width / 2 ? 'left' : 'right'
	const off = side === 'left' ? left : right
	const inset = off < SNAP ? 0 : Math.round(off)

	const top = Math.max(0, Math.min(y, stage.height - KEPT_IN_WINDOW))
	if (top < SNAP) return { side, inset, y: 0 }
	// What fits in the window stays all in it, so that going past the end comes to rest at it.
	const fits = size.height <= stage.height
	if (fits && top + size.height > stage.height - SNAP) return { side, inset, y: 'bottom' }
	return { side, inset, y: Math.round(top) }
}

export interface PanelBox {
	readonly side: Side
	readonly inset: number
	/** From the top of the window, or else `bottom` holds it. Both, and it goes from one to the other. */
	readonly top: number | null
	readonly bottom: number | null
	readonly maxHeight: number
	/** The way it can grow, when dragged. */
	readonly grows: 'down' | 'up'
	/** It is the tab of its group that shows. */
	readonly shown: boolean
	/** What comes next to it within its stack. */
	readonly joinedAbove: boolean
	readonly joinedBelow: boolean
	/** It goes all the way to the end of the window, and so has no corners or line there. */
	readonly flushBottom: boolean
	/** How far it could reach, from where it starts, on the way that it grows. */
	readonly room: number
	/** A panel of what is next along the edge that way, which it joins on reaching it. */
	readonly neighbor: string | null
	/** How far up its top can go, and a panel of what is there to join on reaching that. */
	readonly ceiling: number
	readonly above: string | null
}

interface Measured {
	/** How wide and tall each panel is, as of when it last showed. */
	readonly sizes: ReadonlyMap<string, Size>
	readonly stage: Size
	/** What is being moved, which nothing else makes way for, as it is not there yet. */
	readonly held?: readonly string[]
}

const sizeOf = ({ sizes }: Measured, name: string): Size => sizes.get(name) ?? { width: 0, height: 0 }

const heightsOf = (stack: Stack, measured: Measured): number[] =>
	stack.groups.map(({ active }) => sizeOf(measured, active).height)

const widthOfStack = (stack: Stack, measured: Measured): number =>
	Math.max(0, ...stack.groups.map(({ active }) => sizeOf(measured, active).width))

/** Where it is along the edge, with the heights that the panels have now. */
function rangeOf(stack: Stack, measured: Measured): readonly [number, number] {
	const height = heightOfStack(heightsOf(stack, measured))
	if (stack.y === 'bottom') return [measured.stage.height - height, measured.stage.height]
	return [stack.y, stack.y + height]
}

const isHeld = (stack: Stack, { held }: Measured): boolean =>
	namesOf(stack.groups).some(name => held?.includes(name))

/** What else is on the same edge, that it would run into. */
function othersOnEdge(stack: Stack, layout: PanelLayout, measured: Measured): readonly Stack[] {
	if (stack.inset > 0 || isHeld(stack, measured)) return []
	return layout.filter(
		other =>
			other !== stack && other.side === stack.side && other.inset === 0 && !isHeld(other, measured)
	)
}

/** What is next further down the edge. */
function nextDown(stack: Stack, layout: PanelLayout, measured: Measured): Stack | undefined {
	const [top] = rangeOf(stack, measured)
	return othersOnEdge(stack, layout, measured)
		.filter(other => rangeOf(other, measured)[0] > top)
		.sort((a, b) => rangeOf(a, measured)[0] - rangeOf(b, measured)[0])[0]
}

/** What is next further up the edge. */
function nextUp(stack: Stack, layout: PanelLayout, measured: Measured): Stack | undefined {
	const [top] = rangeOf(stack, measured)
	return othersOnEdge(stack, layout, measured)
		.filter(other => rangeOf(other, measured)[0] < top)
		.sort((a, b) => rangeOf(b, measured)[1] - rangeOf(a, measured)[1])[0]
}

/** How far down it can go: to what starts further down that edge, or else to the end of it. */
function limitOf(stack: Stack, layout: PanelLayout, measured: Measured): number {
	const next = nextDown(stack, layout, measured)
	return next === undefined ? measured.stage.height : rangeOf(next, measured)[0] - GAP
}

/** Where each panel goes, for what they each measure now. Tabs of a group go to the same place. */
export function boxesOf(layout: PanelLayout, measured: Measured): ReadonlyMap<string, PanelBox> {
	const boxes = new Map<string, PanelBox>()
	const { height: stageHeight, width: stageWidth } = measured.stage
	const setAll = (group: Group, box: Omit<PanelBox, 'shown'>) => {
		for (const tab of group.tabs) boxes.set(tab, { ...box, shown: tab === group.active })
	}
	for (const stack of layout) {
		const count = stack.groups.length
		const width = widthOfStack(stack, measured)
		const inset = Math.max(0, Math.min(stack.inset, stageWidth - KEPT_IN_WINDOW))
		const atBoth = { side: stack.side, inset: inset === 0 ? 0 : Math.min(inset, Math.max(1, stageWidth - width)) }

		if (stack.y === 'bottom') {
			const sharesEdge = othersOnEdge(stack, layout, measured).some(other => other.y !== 'bottom')
			const above = nextUp(stack, layout, measured)
			const ceiling = above === undefined ? 0 : rangeOf(above, measured)[1] + GAP
			const most = sharesEdge ? stageHeight * MOST_FROM_BOTTOM : stageHeight
			let below = 0
			for (let i = count - 1; i >= 0; i--) {
				const group = stack.groups[i]!
				const rest = i * MIN_HEIGHT
				setAll(group, {
					...atBoth,
					top: null,
					bottom: below,
					maxHeight: Math.max(MIN_HEIGHT, most - below - rest),
					grows: 'up',
					joinedAbove: i > 0,
					joinedBelow: i < count - 1,
					flushBottom: i === count - 1,
					room: Math.max(MIN_HEIGHT, stageHeight - ceiling - below - rest),
					neighbor: above?.groups.at(-1)?.active ?? null,
					ceiling,
					above: above?.groups.at(-1)?.active ?? null,
				})
				below += sizeOf(measured, group.active).height - SHARED_LINE
			}
			continue
		}

		const { y } = stack
		const limit = limitOf(stack, layout, measured)
		const reachesEnd = stack.full && limit === stageHeight
		const fillsAt = stack.full ? fillerAt(stack) : count
		const neighbor = nextDown(stack, layout, measured)?.groups[0]?.active ?? null
		const above = nextUp(stack, layout, measured)
		const ceiling = above === undefined ? 0 : rangeOf(above, measured)[1] + GAP
		/** How far off the end of the window it stops, for the room that what follows it takes. */
		const offEnd = (i: number): number =>
			stack.groups
				.slice(i + 1)
				.reduce((sum, { active }) => sum + sizeOf(measured, active).height - SHARED_LINE, stageHeight - limit)
		let top = y
		stack.groups.forEach((group, i) => {
			const last = i === count - 1
			const rest = (count - 1 - i) * MIN_HEIGHT
			const afterFiller = i > fillsAt
			const most = Math.max(MIN_HEIGHT, limit - (afterFiller ? y + i * MIN_HEIGHT : top) - rest)
			setAll(group, {
				...atBoth,
				top: afterFiller ? null : top,
				bottom: i >= fillsAt ? offEnd(i) : null,
				maxHeight: most,
				grows: afterFiller ? 'up' : 'down',
				joinedAbove: i > 0,
				joinedBelow: !last,
				flushBottom: reachesEnd && last,
				room: most,
				neighbor,
				ceiling,
				above: above?.groups.at(-1)?.active ?? null,
			})
			top += sizeOf(measured, group.active).height - SHARED_LINE
		})
	}
	return boxes
}

/** Which of a stack's groups takes up the room that is left. */
function fillerAt(stack: Stack): number {
	const at = stack.groups.findIndex(({ tabs }) => stack.filler !== undefined && tabs.includes(stack.filler))
	return at < 0 ? stack.groups.length - 1 : at
}

/**
 * The stack that has a panel joined to the next along the edge, as one that goes as far as there
 * is room, with that panel taking up what is left.
 */
export function merged(layout: PanelLayout, name: string, neighbor: string): PanelLayout {
	const own = stackOf(layout, name)
	const next = stackOf(layout, neighbor)
	if (own === undefined || next === undefined || own === next) return layout
	const [upper, lower] = own.y === 'bottom' ? [next, own] : [own, next]
	const stack: Stack = {
		...upper,
		y: upper.y === 'bottom' ? 0 : upper.y,
		groups: [...upper.groups, ...lower.groups],
		full: true,
		filler: name,
	}
	return [...layout.filter(other => other !== own && other !== next), stack]
}

/**
 * The panel across the line that a panel's end moves, within its stack, whose height has to
 * give way, which what takes up the room left does by itself.
 */
export function acrossLine(layout: PanelLayout, name: string, grows: 'down' | 'up'): string | null {
	const stack = stackOf(layout, name)
	if (stack === undefined) return null
	const at = stack.groups.findIndex(({ tabs }) => tabs.includes(name))
	const across = at + (grows === 'down' ? 1 : -1)
	const group = stack.groups[across]
	if (group === undefined || (stack.full && across === fillerAt(stack))) return null
	return group.active
}

/** The stack that has a panel joined under what is above it, which stays where it is. */
export function joinedUnder(layout: PanelLayout, name: string, above: string): PanelLayout {
	const own = stackOf(layout, name)
	const next = stackOf(layout, above)
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
 * With what has just come to rest at the end of an edge joined to what goes on down that edge
 * toward it, rather than leaving a gap between.
 */
export function settled(layout: PanelLayout, name: string): PanelLayout {
	const stack = stackOf(layout, name)
	if (stack === undefined || stack.y !== 'bottom' || stack.inset > 0) return layout
	const above = layout.find(
		other => other !== stack && other.side === stack.side && other.inset === 0 && other.full && other.y !== 'bottom'
	)
	const filler = above?.groups[fillerAt(above)]?.active
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
	return [...without(layout, namesOf(groups)), { ...place, groups, full: false }]
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

/** With the stack that has the panel over the others. */
export function raised(layout: PanelLayout, name: string): PanelLayout {
	const stack = stackOf(layout, name)
	if (stack === undefined || stack === layout.at(-1)) return layout
	return [...layout.filter(other => other !== stack), stack]
}

/** Whether its stack goes on as far as there is room, starting from `y` if that is said. */
export function withFull(layout: PanelLayout, name: string, full: boolean, y?: Place['y']): PanelLayout {
	return layout.map(stack => {
		if (!namesOf(stack.groups).includes(name)) return stack
		// What reaches both ends of the window no longer sits at the one.
		const from = y ?? (full && stack.y === 'bottom' ? 0 : stack.y)
		return stack.full === full && stack.y === from ? stack : { ...stack, y: from, full }
	})
}

export type Join = {
	/** A panel of what it would join. */
	readonly to: string
	/** Where to show that it would, in the window. */
	readonly left: number
	readonly top: number
	readonly width: number
} & (
	| { readonly kind: 'stack'; readonly at: number }
	| { readonly kind: 'tab'; readonly height: number }
)

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
	held: readonly string[]
): Join | null {
	const rectOf = new Map(rects.map(rect => [rect.name, rect]))
	for (const stack of [...layout].reverse()) {
		if (namesOf(stack.groups).some(name => held.includes(name))) continue
		const inStack = stack.groups.flatMap(({ active }) => rectOf.get(active) ?? [])
		const [first] = inStack
		if (first === undefined || inStack.length !== stack.groups.length) continue
		const left = Math.min(...inStack.map(rect => rect.left))
		const right = Math.max(...inStack.map(rect => rect.right))
		if (x < left || x > right) continue

		const header = inStack.find(({ top }) => y >= top + INTO_HEADER && y < top + HEADER_HEIGHT)
		if (header !== undefined) {
			return { kind: 'tab', to: header.name, left, top: header.top, width: right - left, height: HEADER_HEIGHT }
		}
		const lines = [first.top, ...inStack.map(rect => rect.bottom)]
		const near = lines
			.map((top, at) => ({ top, at, distance: Math.abs(y - top) }))
			.filter(({ distance }) => distance < JOIN_DISTANCE)
			.sort((a, b) => a.distance - b.distance)[0]
		if (near !== undefined) {
			return { kind: 'stack', to: first.name, at: near.at, left, top: near.top, width: right - left }
		}
	}
	return null
}

/** What was kept, as far as it still holds, with what it does not say put where it goes by default. */
export function normalized(kept: unknown, defaults: PanelLayout): PanelLayout {
	const known = defaults.flatMap(({ groups }) => namesOf(groups))
	const seen = new Set<string>()
	const stacks: Stack[] = []
	for (const stack of Array.isArray(kept) ? (kept as unknown[]) : []) {
		if (!isStack(stack)) continue
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
	return [...without(defaults, [...seen]), ...stacks]
}

function isGroup(value: unknown): value is Group {
	if (typeof value !== 'object' || value === null) return false
	const { tabs, active } = value as Record<string, unknown>
	return Array.isArray(tabs) && tabs.every(name => typeof name === 'string') && typeof active === 'string'
}

function isStack(value: unknown): value is Stack {
	if (typeof value !== 'object' || value === null) return false
	const { groups, side, inset, y, full } = value as Record<string, unknown>
	return (
		Array.isArray(groups) &&
		groups.every(isGroup) &&
		(side === 'left' || side === 'right') &&
		typeof inset === 'number' &&
		Number.isFinite(inset) &&
		(y === 'bottom' || (typeof y === 'number' && Number.isFinite(y))) &&
		typeof full === 'boolean'
	)
}
