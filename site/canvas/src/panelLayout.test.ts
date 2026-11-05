import { describe, expect, it } from 'vitest'

import {
	acrossLine,
	activated,
	alone,
	boxesOf,
	joinAt,
	joined,
	joinedUnder,
	merged,
	normalized,
	type PanelLayout,
	placeAt,
	placed,
	raised,
	settled,
	type Stack,
	tabbed,
	withFull,
} from './panelLayout'

const STAGE = { width: 1000, height: 800 }
const SIZE = { width: 300, height: 200 }

const stack = (panels: readonly string[], rest: Partial<Stack> = {}): Stack => ({
	groups: panels.map(alone),
	side: 'right',
	inset: 0,
	y: 0,
	full: false,
	...rest,
})

const names = (layout: PanelLayout) => layout.map(({ groups }) => groups.flatMap(({ tabs }) => tabs))

const measured = (sizes: Record<string, number>) => ({
	stage: STAGE,
	sizes: new Map(Object.entries(sizes).map(([name, height]) => [name, { width: 300, height }])),
})

describe('placeAt', () => {
	it('keeps from the nearer side', () => {
		expect(placeAt(100, 100, SIZE, STAGE)).toEqual({ side: 'left', inset: 100, y: 100 })
		expect(placeAt(600, 100, SIZE, STAGE)).toEqual({ side: 'right', inset: 100, y: 100 })
	})

	it('comes onto an edge near it, and off of it further away', () => {
		expect(placeAt(10, 100, SIZE, STAGE).inset).toBe(0)
		expect(placeAt(20, 100, SIZE, STAGE).inset).toBe(20)
		expect(placeAt(690, 100, SIZE, STAGE)).toMatchObject({ side: 'right', inset: 0 })
	})

	it('comes to the top and to the end of the window near them', () => {
		expect(placeAt(0, 10, SIZE, STAGE).y).toBe(0)
		expect(placeAt(0, 595, SIZE, STAGE).y).toBe('bottom')
		expect(placeAt(0, 500, SIZE, STAGE).y).toBe(500)
	})

	it('does not take what is too tall for the window as sitting at its end', () => {
		expect(placeAt(0, 100, { width: 300, height: 810 }, STAGE).y).toBe(100)
	})

	it('stays where it can be taken hold of', () => {
		expect(placeAt(-500, -500, SIZE, STAGE)).toEqual({ side: 'left', inset: 0, y: 0 })
		expect(placeAt(5000, 5000, SIZE, STAGE)).toMatchObject({ side: 'right', y: 'bottom' })
		expect(placeAt(0, 5000, { width: 300, height: 810 }, STAGE).y).toBe(760)
	})
})

describe('boxesOf', () => {
	it('starts from the top of the edge', () => {
		const box = boxesOf([stack(['a'])], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ top: 0, bottom: null, grows: 'down', flushBottom: false })
	})

	it('goes to the end of the window when full', () => {
		const box = boxesOf([stack(['a'], { full: true })], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ top: 0, bottom: 0, flushBottom: true })
	})

	it('stays where it starts when full from further down', () => {
		const box = boxesOf([stack(['a'], { y: 100, full: true })], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ top: 100, bottom: 0, flushBottom: true })
	})

	it('goes one under the other when joined, sharing the line between', () => {
		const boxes = boxesOf([stack(['a', 'b'])], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')).toMatchObject({ top: 0, joinedBelow: true, joinedAbove: false })
		expect(boxes.get('b')).toMatchObject({ top: 199, joinedAbove: true, joinedBelow: false })
	})

	it('has only the last of a stack go on to the end', () => {
		const boxes = boxesOf([stack(['a', 'b'], { full: true })], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')!.bottom).toBeNull()
		expect(boxes.get('b')).toMatchObject({ top: 199, bottom: 0 })
	})

	it('builds up from the end of the window', () => {
		const boxes = boxesOf([stack(['a', 'b'], { y: 'bottom' })], measured({ a: 200, b: 100 }))
		expect(boxes.get('b')).toMatchObject({ top: null, bottom: 0, grows: 'up', flushBottom: true })
		expect(boxes.get('a')).toMatchObject({ top: null, bottom: 99, flushBottom: false })
	})

	it('stops short of what is further down the same edge', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'left', full: true }),
			stack(['b'], { side: 'left', y: 'bottom' }),
		]
		const box = boxesOf(layout, measured({ a: 100, b: 200 })).get('a')!
		expect(box.bottom).toBe(200 + 8)
		expect(box.flushBottom).toBe(false)
	})

	it('pays no mind to what is on the other edge, or floating', () => {
		const layout: PanelLayout = [
			stack(['a'], { full: true }),
			stack(['b'], { side: 'left', y: 'bottom' }),
			stack(['c'], { inset: 40, y: 400 }),
		]
		expect(boxesOf(layout, measured({ a: 100, b: 200, c: 200 })).get('a')!.bottom).toBe(0)
	})

	it('makes no way for what is being held', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'left', full: true }),
			stack(['b'], { side: 'left', y: 'bottom' }),
		]
		const box = boxesOf(layout, { ...measured({ a: 100, b: 200 }), held: ['b'] }).get('a')!
		expect(box.bottom).toBe(0)
	})

	it('says what is next along the edge', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'left' }),
			stack(['b'], { side: 'left', y: 'bottom' }),
			stack(['c']),
		]
		const boxes = boxesOf(layout, measured({ a: 100, b: 200, c: 100 }))
		expect(boxes.get('a')).toMatchObject({ neighbor: 'b', room: 592 })
		expect(boxes.get('b')).toMatchObject({ neighbor: 'a', room: 692 })
		expect(boxes.get('c')!.neighbor).toBeNull()
	})

	it('says how far up its top can go', () => {
		const layout: PanelLayout = [stack(['a'], { side: 'left' }), stack(['b'], { side: 'left', y: 400 }), stack(['c'], { y: 50 })]
		const boxes = boxesOf(layout, measured({ a: 100, b: 100, c: 100 }))
		expect(boxes.get('b')).toMatchObject({ ceiling: 108, above: 'a' })
		expect(boxes.get('c')).toMatchObject({ ceiling: 0, above: null })
	})

	it('has what is under the one that fills sit at the end', () => {
		const layout: PanelLayout = [{ ...stack(['a', 'b'], { full: true }), filler: 'a' }]
		const boxes = boxesOf(layout, measured({ a: 100, b: 200 }))
		expect(boxes.get('a')).toMatchObject({ top: 0, bottom: 199, grows: 'down' })
		expect(boxes.get('b')).toMatchObject({ top: null, bottom: 0, grows: 'up', flushBottom: true })
	})

	it('keeps room for what is joined under it', () => {
		const boxes = boxesOf([stack(['a', 'b'])], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')!.maxHeight).toBe(736)
	})

	it('puts the tabs of a group in the same place, with only the one showing', () => {
		const group = { tabs: ['a', 'b'], active: 'b' }
		const boxes = boxesOf([{ ...stack([]), groups: [group] }], measured({ a: 500, b: 100 }))
		expect(boxes.get('a')).toMatchObject({ top: 0, shown: false })
		expect(boxes.get('b')).toMatchObject({ top: 0, shown: true })
	})

	it('goes by the height of the tab that shows', () => {
		const group = { tabs: ['a', 'b'], active: 'b' }
		const boxes = boxesOf([{ ...stack([]), groups: [group, alone('c')] }], measured({ a: 500, b: 100, c: 50 }))
		expect(boxes.get('c')!.top).toBe(99)
	})
})

describe('changing the layout', () => {
	const layout: PanelLayout = [stack(['a', 'b']), stack(['c'], { side: 'left' })]

	it('takes a panel out of a stack to a place of its own', () => {
		const next = placed(layout, [alone('b')], { side: 'left', inset: 50, y: 50 })
		expect(names(next)).toEqual([['a'], ['c'], ['b']])
		expect(next[2]).toMatchObject({ side: 'left', inset: 50, y: 50, full: false })
	})

	it('removes a stack that nothing is left in', () => {
		expect(names(placed(layout, [alone('c')], { side: 'right', inset: 9, y: 9 }))).toEqual([
			['a', 'b'],
			['c'],
		])
	})

	const onEdge: PanelLayout = [
		stack(['a'], { side: 'left', y: 40 }),
		stack(['b'], { side: 'left', y: 'bottom' }),
	]

	it('merges with the next along the edge, the one that reached it taking up the room', () => {
		const down = merged(onEdge, 'a', 'b')
		expect(names(down)).toEqual([['a', 'b']])
		expect(down[0]).toMatchObject({ y: 40, full: true, filler: 'a' })
		const up = merged(onEdge, 'b', 'a')
		expect(names(up)).toEqual([['a', 'b']])
		expect(up[0]).toMatchObject({ y: 40, full: true, filler: 'b' })
	})

	it('joins under what is above, which stays where it is', () => {
		const apart: PanelLayout = [stack(['a'], { side: 'left', y: 20 }), stack(['b'], { side: 'left', y: 300 })]
		const next = joinedUnder(apart, 'b', 'a')
		expect(names(next)).toEqual([['a', 'b']])
		expect(next[0]).toMatchObject({ y: 20, full: false })
		const full: PanelLayout = [stack(['a'], { side: 'left' }), stack(['b'], { side: 'left', y: 300, full: true })]
		expect(joinedUnder(full, 'b', 'a')[0]).toMatchObject({ y: 0, full: true, filler: 'b' })
	})

	it('finds what gives way across a line, unless that takes up the room by itself', () => {
		const three: PanelLayout = [stack(['a', 'b', 'c'])]
		expect(acrossLine(three, 'a', 'down')).toBe('b')
		expect(acrossLine(three, 'c', 'up')).toBe('b')
		expect(acrossLine(three, 'c', 'down')).toBeNull()
		expect(acrossLine(three, 'a', 'up')).toBeNull()
		const filling: PanelLayout = [{ ...stack(['a', 'b', 'c'], { full: true }), filler: 'b' }]
		expect(acrossLine(filling, 'a', 'down')).toBeNull()
		expect(acrossLine(filling, 'c', 'up')).toBeNull()
	})

	it('settles what comes to the end of an edge onto what goes on toward it', () => {
		const full: PanelLayout = [
			stack(['a'], { side: 'left', full: true }),
			stack(['b'], { side: 'left', y: 'bottom' }),
		]
		expect(settled(full, 'b')[0]).toMatchObject({ full: true, filler: 'a' })
		expect(names(settled(full, 'b'))).toEqual([['a', 'b']])
		expect(settled(onEdge, 'b')).toBe(onEdge)
	})

	it('joins a panel at a place in a stack, which keeps its place', () => {
		const next = joined(layout, [alone('c')], 'a', 1)
		expect(names(next)).toEqual([['a', 'c', 'b']])
		expect(next[0]!.side).toBe('right')
	})

	it('leaves what takes up the room doing so, when something joins after it', () => {
		const next = joined([stack(['a'], { full: true }), stack(['b'], { side: 'left' })], [alone('b')], 'a', 1)
		expect(next[0]).toMatchObject({ full: true, filler: 'a' })
	})

	it('joins a whole stack, in the order it has', () => {
		const three: PanelLayout = [stack(['a']), stack(['b', 'c'], { side: 'left' })]
		expect(names(joined(three, [alone('b'), alone('c')], 'a', 0))).toEqual([['b', 'c', 'a']])
	})

	it('raises a stack over the others', () => {
		expect(names(raised(layout, 'a'))).toEqual([['c'], ['a', 'b']])
		expect(raised(layout, 'c')).toBe(layout)
	})

	const tabsOfTwo: PanelLayout = [{ ...stack([]), groups: [{ tabs: ['a', 'b'], active: 'a' }] }, stack(['c'], { side: 'left' })]

	it('makes a panel a tab of a group, showing it', () => {
		const next = tabbed(layout, [alone('c')], 'b')
		expect(next).toHaveLength(1)
		expect(next[0]!.groups).toEqual([alone('a'), { tabs: ['b', 'c'], active: 'c' }])
	})

	it('takes a tab out, with another showing in its place if it was showing', () => {
		const next = placed(tabsOfTwo, [alone('a')], { side: 'left', inset: 9, y: 9 })
		expect(next[0]!.groups).toEqual([{ tabs: ['b'], active: 'b' }])
		expect(next.at(-1)!.groups).toEqual([alone('a')])
	})

	it('changes which tab shows', () => {
		expect(activated(tabsOfTwo, 'b')[0]!.groups[0]!.active).toBe('b')
		expect(activated(tabsOfTwo, 'a')).toBe(tabsOfTwo)
	})

	it('has what grows from the end of the window, once full, start from the top', () => {
		const next = withFull([stack(['a'], { y: 'bottom' })], 'a', true)
		expect(next[0]).toMatchObject({ y: 0, full: true })
	})
})

describe('joinAt', () => {
	const layout: PanelLayout = [stack(['a', 'b']), stack(['held'], { side: 'left' })]
	const rects = [
		{ name: 'a', left: 700, top: 14, right: 1000, bottom: 214 },
		{ name: 'b', left: 700, top: 213, right: 1000, bottom: 400 },
		{ name: 'held', left: 0, top: 14, right: 300, bottom: 300 },
	]

	it('finds the line nearest the pointer', () => {
		expect(joinAt(800, 216, layout, rects, ['held'])).toMatchObject({ to: 'a', at: 1, top: 214 })
		expect(joinAt(800, 390, layout, rects, ['held'])).toMatchObject({ at: 2, top: 400, left: 700, width: 300 })
		expect(joinAt(800, 10, layout, rects, ['held'])).toMatchObject({ at: 0, top: 14 })
	})

	it('finds a header to become a tab of, within it', () => {
		expect(joinAt(800, 30, layout, rects, ['held'])).toMatchObject({ kind: 'tab', to: 'a', top: 14 })
		expect(joinAt(800, 230, layout, rects, ['held'])).toMatchObject({ kind: 'tab', to: 'b', top: 213 })
	})

	it('finds nothing away from those lines', () => {
		expect(joinAt(800, 100, layout, rects, ['held'])).toBeNull()
		expect(joinAt(500, 214, layout, rects, ['held'])).toBeNull()
	})

	it('does not join what is held to itself', () => {
		expect(joinAt(100, 14, layout, rects, ['held'])).toBeNull()
	})
})

describe('normalized', () => {
	const defaults: PanelLayout = [stack(['a']), stack(['b'], { side: 'left' })]

	it('goes by default with nothing kept, or nonsense', () => {
		expect(normalized(null, defaults)).toEqual(defaults)
		expect(normalized([{ groups: 3 }], defaults)).toEqual(defaults)
	})

	it('keeps the tabs that were kept, showing another if the one that showed is gone', () => {
		const kept = [{ ...stack([]), groups: [{ tabs: ['gone', 'a', 'b'], active: 'gone' }] }]
		expect(normalized(kept, defaults)[0]!.groups).toEqual([{ tabs: ['a', 'b'], active: 'a' }])
	})

	it('keeps what was kept, and puts what it does not say where it goes by default', () => {
		const kept = [stack(['a'], { inset: 30 })]
		expect(normalized(kept, defaults)).toEqual([stack(['b'], { side: 'left' }), kept[0]])
	})

	it('leaves out panels that are not there any more, and any said twice', () => {
		const kept = [stack(['gone', 'a', 'b']), stack(['a'])]
		expect(normalized(kept, defaults)).toEqual([stack(['a', 'b'])])
	})
})
