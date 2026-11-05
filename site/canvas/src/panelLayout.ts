/**
 * Where the panels are, over the canvas. A panel is always in a stack, of it alone or with
 * others joined to it, and a stack goes together.
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

export interface Stack extends Place {
	/** From the top down. */
	readonly panels: readonly string[]
	/** It goes on as far as there is room, rather than ending where what is in it ends. */
	readonly full: boolean
}

/** What is later is over what is earlier. */
export type PanelLayout = readonly Stack[]

export interface Size {
	readonly width: number
	readonly height: number
}

/** How near something has to come to an edge, to take it as meaning that edge. */
export const SNAP = 16
/** How near the pointer has to come to where a panel could join, to take it as meaning that. */
export const JOIN_DISTANCE = 14
/** How far from the end of the window what is on an edge stops, for its curve into the edge. */
export const END = 14
/** The least of a panel, for one above or below not to be pushed out of the window. */
export const MIN_HEIGHT = 64
/** How much of a stack stays in the window, at the least, to be taken hold of again. */
export const KEPT_IN_WINDOW = 40
/** What is on an edge stops this short of what is further along it. */
const GAP = 8
/** A stack at the end of an edge leaves the rest of it to what starts from the top. */
const MOST_FROM_BOTTOM = 0.6

/** Joined panels share the line between them. */
const SHARED_LINE = 1

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
	const fits = size.height <= stage.height - END
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
	/** What comes next to it within its stack. */
	readonly joinedAbove: boolean
	readonly joinedBelow: boolean
	/** It goes all the way to the end of the window, with no curve into the edge there. */
	readonly flushBottom: boolean
	/** How far it could reach, from where it starts, on the way that it grows. */
	readonly room: number
}

interface Measured {
	/** How wide and tall each panel is now. */
	readonly sizes: ReadonlyMap<string, Size>
	readonly stage: Size
}

const sizeOf = ({ sizes }: Measured, name: string): Size => sizes.get(name) ?? { width: 0, height: 0 }

const heightsOf = (stack: Stack, measured: Measured): number[] =>
	stack.panels.map(name => sizeOf(measured, name).height)

const widthOfStack = (stack: Stack, measured: Measured): number =>
	Math.max(0, ...stack.panels.map(name => sizeOf(measured, name).width))

/** Where it is along the edge, with the heights that the panels have now. */
function rangeOf(stack: Stack, measured: Measured): readonly [number, number] {
	const height = heightOfStack(heightsOf(stack, measured))
	if (stack.y === 'bottom') return [measured.stage.height - height, measured.stage.height]
	const top = stack.y === 0 ? END : stack.y
	return [top, top + height]
}

/** How far down it can go: to what starts further down that edge, or else to the end of it. */
function limitOf(stack: Stack, layout: PanelLayout, measured: Measured): number {
	const end = measured.stage.height
	if (stack.inset > 0) return end
	const [top] = rangeOf(stack, measured)
	const starts = layout
		.filter(other => other !== stack && other.side === stack.side && other.inset === 0)
		.map(other => (other.y === 'bottom' ? rangeOf(other, measured)[0] : other.y === 0 ? END : other.y))
		.filter(start => start > top)
	return starts.length === 0 ? end : Math.min(...starts) - GAP
}

/** Where each panel goes, for what they each measure now. */
export function boxesOf(layout: PanelLayout, measured: Measured): ReadonlyMap<string, PanelBox> {
	const boxes = new Map<string, PanelBox>()
	const { height: stageHeight, width: stageWidth } = measured.stage
	for (const stack of layout) {
		const count = stack.panels.length
		const width = widthOfStack(stack, measured)
		const inset = Math.max(0, Math.min(stack.inset, stageWidth - KEPT_IN_WINDOW))
		const atBoth = { side: stack.side, inset: inset === 0 ? 0 : Math.min(inset, Math.max(1, stageWidth - width)) }

		if (stack.y === 'bottom') {
			const sharesEdge = stack.inset === 0 && layout.some(other =>
				other !== stack && other.side === stack.side && other.inset === 0 && other.y !== 'bottom')
			const most = sharesEdge ? stageHeight * MOST_FROM_BOTTOM : stageHeight - END
			let below = 0
			for (let i = count - 1; i >= 0; i--) {
				const name = stack.panels[i]!
				const rest = i * MIN_HEIGHT
				boxes.set(name, {
					...atBoth,
					top: null,
					bottom: below,
					maxHeight: Math.max(MIN_HEIGHT, most - below - rest),
					grows: 'up',
					joinedAbove: i > 0,
					joinedBelow: i < count - 1,
					flushBottom: i === count - 1,
					room: Math.max(MIN_HEIGHT, stageHeight - below - rest),
				})
				below += sizeOf(measured, name).height - SHARED_LINE
			}
			continue
		}

		const limit = limitOf(stack, layout, measured)
		const reachesEnd = stack.full && limit === stageHeight
		let top = stack.y === 0 ? END : stack.y
		stack.panels.forEach((name, i) => {
			const last = i === count - 1
			const end = reachesEnd ? stageHeight : stack.inset > 0 || limit === stageHeight ? stageHeight - END : limit
			const rest = (count - 1 - i) * MIN_HEIGHT
			boxes.set(name, {
				...atBoth,
				top,
				bottom: last && stack.full ? stageHeight - (reachesEnd ? stageHeight : limit) : null,
				maxHeight: Math.max(MIN_HEIGHT, end - top - rest),
				grows: 'down',
				joinedAbove: i > 0,
				joinedBelow: !last,
				flushBottom: reachesEnd && last,
				room: Math.max(MIN_HEIGHT, limit - top - rest),
			})
			top += sizeOf(measured, name).height - SHARED_LINE
		})
	}
	return boxes
}

const without = (layout: PanelLayout, names: readonly string[]): PanelLayout =>
	layout
		.map(stack => ({ ...stack, panels: stack.panels.filter(name => !names.includes(name)) }))
		.filter(stack => stack.panels.length > 0)

/** The panels taken out of where they are, and put at a place as a stack of their own, on top. */
export function placed(layout: PanelLayout, names: readonly string[], place: Place): PanelLayout {
	return [...without(layout, names), { ...place, panels: names, full: false }]
}

/** The panels joined to the stack that has `to`, so that the first of them is at `at` in it. */
export function joined(layout: PanelLayout, names: readonly string[], to: string, at: number): PanelLayout {
	const target = layout.find(stack => stack.panels.includes(to))
	if (target === undefined) return layout
	const before = target.panels.slice(0, at).filter(name => !names.includes(name))
	const after = target.panels.slice(at).filter(name => !names.includes(name))
	const stack: Stack = { ...target, panels: [...before, ...names, ...after] }
	return [...without(layout, [...names, ...target.panels]), stack]
}

/** With the stack that has the panel over the others. */
export function raised(layout: PanelLayout, name: string): PanelLayout {
	const stack = layout.find(({ panels }) => panels.includes(name))
	if (stack === undefined || stack === layout.at(-1)) return layout
	return [...layout.filter(other => other !== stack), stack]
}

/** Whether its stack goes on as far as there is room, starting from `y` if that is said. */
export function withFull(layout: PanelLayout, name: string, full: boolean, y?: Place['y']): PanelLayout {
	return layout.map(stack => {
		if (!stack.panels.includes(name)) return stack
		// What reaches both ends of the window no longer sits at the one.
		const from = y ?? (full && stack.y === 'bottom' ? 0 : stack.y)
		return stack.full === full && stack.y === from ? stack : { ...stack, y: from, full }
	})
}

export interface Join {
	/** A panel of the stack that it would join. */
	readonly to: string
	readonly at: number
	/** Where the line goes that says so, in the window. */
	readonly left: number
	readonly top: number
	readonly width: number
}

export interface PanelRect {
	readonly name: string
	readonly left: number
	readonly top: number
	readonly right: number
	readonly bottom: number
}

/** Where a panel let go of here would join, among stacks that are not the one being held. */
export function joinAt(
	x: number,
	y: number,
	layout: PanelLayout,
	rects: readonly PanelRect[],
	held: readonly string[]
): Join | null {
	const rectOf = new Map(rects.map(rect => [rect.name, rect]))
	let best: (Join & { readonly distance: number }) | null = null
	for (const stack of [...layout].reverse()) {
		if (stack.panels.some(name => held.includes(name))) continue
		const inStack = stack.panels.flatMap(name => rectOf.get(name) ?? [])
		const [first] = inStack
		if (first === undefined || inStack.length !== stack.panels.length) continue
		const left = Math.min(...inStack.map(rect => rect.left))
		const right = Math.max(...inStack.map(rect => rect.right))
		if (x < left || x > right) continue
		const lines = [first.top, ...inStack.map(rect => rect.bottom)]
		lines.forEach((top, at) => {
			const distance = Math.abs(y - top)
			if (distance < JOIN_DISTANCE && (best === null || distance < best.distance)) {
				best = { to: first.name, at, left, top, width: right - left, distance }
			}
		})
	}
	if (best === null) return null
	const { distance: _, ...join } = best as Join & { readonly distance: number }
	return join
}

/** What was kept, as far as it still holds, with what it does not say put where it goes by default. */
export function normalized(kept: unknown, defaults: PanelLayout): PanelLayout {
	const known = defaults.flatMap(({ panels }) => panels)
	const seen = new Set<string>()
	const stacks: Stack[] = []
	for (const stack of Array.isArray(kept) ? (kept as unknown[]) : []) {
		if (!isStack(stack)) continue
		const panels = stack.panels.filter(name => {
			if (!known.includes(name) || seen.has(name)) return false
			seen.add(name)
			return true
		})
		if (panels.length > 0) stacks.push({ ...stack, panels })
	}
	const missing = defaults
		.map(stack => ({ ...stack, panels: stack.panels.filter(name => !seen.has(name)) }))
		.filter(({ panels }) => panels.length > 0)
	return [...missing, ...stacks]
}

function isStack(value: unknown): value is Stack {
	if (typeof value !== 'object' || value === null) return false
	const { panels, side, inset, y, full } = value as Record<string, unknown>
	return (
		Array.isArray(panels) &&
		panels.every(name => typeof name === 'string') &&
		(side === 'left' || side === 'right') &&
		typeof inset === 'number' &&
		Number.isFinite(inset) &&
		(y === 'bottom' || (typeof y === 'number' && Number.isFinite(y))) &&
		typeof full === 'boolean'
	)
}
