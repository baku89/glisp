import { describe, expect, it } from 'vitest'

import {
	acrossLine,
	activated,
	alone,
	boxesOf,
	fitted,
	joinAt,
	joined,
	joinedUnder,
	merged,
	normalized,
	type PanelLayout,
	placeAt,
	placed,
	raised,
	roomOf,
	settled,
	stamped,
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
	along: 0,
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
		expect(placeAt(100, 100, SIZE, STAGE)).toEqual({ side: 'left', inset: 100, along: 100 })
		expect(placeAt(600, 100, SIZE, STAGE)).toEqual({ side: 'right', inset: 100, along: 100 })
	})

	it('comes onto an edge near it, and off of it further away', () => {
		expect(placeAt(10, 100, SIZE, STAGE).inset).toBe(0)
		expect(placeAt(20, 100, SIZE, STAGE).inset).toBe(20)
		expect(placeAt(690, 100, SIZE, STAGE)).toMatchObject({ side: 'right', inset: 0 })
	})

	it('comes to the top and to the end of the window near them', () => {
		expect(placeAt(0, 10, SIZE, STAGE).along).toBe(0)
		expect(placeAt(0, 595, SIZE, STAGE).along).toBe('end')
		expect(placeAt(0, 500, SIZE, STAGE).along).toBe(500)
	})

	it('does not take what is too tall for the window as sitting at its end', () => {
		expect(placeAt(0, 100, { width: 300, height: 810 }, STAGE).along).toBe(100)
	})

	it('stays where it can be taken hold of', () => {
		expect(placeAt(-500, -500, SIZE, STAGE)).toEqual({ side: 'left', inset: 0, along: 0 })
		expect(placeAt(5000, 5000, SIZE, STAGE)).toMatchObject({ side: 'right', along: 'end' })
		expect(placeAt(0, 5000, { width: 300, height: 810 }, STAGE).along).toBe(760)
	})
})

describe('boxesOf', () => {
	it('starts from the top of the edge', () => {
		const box = boxesOf([stack(['a'])], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ start: 0, end: null, grows: 'forward', flushEnd: false })
	})

	it('goes to the end of the window when full', () => {
		const box = boxesOf([stack(['a'], { full: true })], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ start: 0, end: 0, flushEnd: true })
	})

	it('stays where it starts when full from further down', () => {
		const box = boxesOf([stack(['a'], { along: 100, full: true })], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ start: 100, end: 0, flushEnd: true })
	})

	it('goes one under the other when joined, sharing the line between', () => {
		const boxes = boxesOf([stack(['a', 'b'])], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')).toMatchObject({ start: 0, joinedAfter: true, joinedBefore: false })
		expect(boxes.get('b')).toMatchObject({ start: 199, joinedBefore: true, joinedAfter: false })
	})

	it('has only the last of a stack go on to the end', () => {
		const boxes = boxesOf([stack(['a', 'b'], { full: true })], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')!.end).toBeNull()
		expect(boxes.get('b')).toMatchObject({ start: 199, end: 0 })
	})

	it('builds up from the end of the window', () => {
		const boxes = boxesOf([stack(['a', 'b'], { along: 'end' })], measured({ a: 200, b: 100 }))
		expect(boxes.get('b')).toMatchObject({ start: null, end: 0, grows: 'back', flushEnd: true })
		expect(boxes.get('a')).toMatchObject({ start: null, end: 99, flushEnd: false })
	})

	it('stops short of what is further down the same edge', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'left', full: true }),
			stack(['b'], { side: 'left', along: 'end' }),
		]
		const box = boxesOf(layout, measured({ a: 100, b: 200 })).get('a')!
		expect(box.end).toBe(200 + 8)
		expect(box.flushEnd).toBe(false)
	})

	it('pays no mind to what is on the other edge, or floating', () => {
		const layout: PanelLayout = [
			stack(['a'], { full: true }),
			stack(['b'], { side: 'left', along: 'end' }),
			stack(['c'], { inset: 40, along: 400 }),
		]
		expect(boxesOf(layout, measured({ a: 100, b: 200, c: 200 })).get('a')!.end).toBe(0)
	})

	it('makes no way for what is being held', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'left', full: true }),
			stack(['b'], { side: 'left', along: 'end' }),
		]
		const box = boxesOf(layout, { ...measured({ a: 100, b: 200 }), held: ['b'] }).get('a')!
		expect(box.end).toBe(0)
	})

	it('says what is next along the edge', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'left' }),
			stack(['b'], { side: 'left', along: 'end' }),
			stack(['c']),
		]
		const boxes = boxesOf(layout, measured({ a: 100, b: 200, c: 100 }))
		expect(boxes.get('a')).toMatchObject({ neighbor: 'b', room: 592 })
		expect(boxes.get('b')).toMatchObject({ neighbor: 'a', room: 692 })
		expect(boxes.get('c')!.neighbor).toBeNull()
	})

	it('says how far up its top can go', () => {
		const layout: PanelLayout = [stack(['a'], { side: 'left' }), stack(['b'], { side: 'left', along: 400 }), stack(['c'], { along: 50 })]
		const boxes = boxesOf(layout, measured({ a: 100, b: 100, c: 100 }))
		expect(boxes.get('b')).toMatchObject({ ceiling: 108, before: 'a' })
		expect(boxes.get('c')).toMatchObject({ ceiling: 0, before: null })
	})

	it('has what is under the one that fills sit at the end', () => {
		const layout: PanelLayout = [{ ...stack(['a', 'b'], { full: true }), filler: 'a' }]
		const boxes = boxesOf(layout, measured({ a: 100, b: 200 }))
		expect(boxes.get('a')).toMatchObject({ start: 0, end: 199, grows: 'forward' })
		expect(boxes.get('b')).toMatchObject({ start: null, end: 0, grows: 'back', flushEnd: true })
	})

	it('keeps room for what is joined under it', () => {
		const boxes = boxesOf([stack(['a', 'b'])], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')!.most).toBe(736)
	})

	it('puts the tabs of a group in the same place, with only the one showing', () => {
		const group = { tabs: ['a', 'b'], active: 'b' }
		const boxes = boxesOf([{ ...stack([]), groups: [group] }], measured({ a: 500, b: 100 }))
		expect(boxes.get('a')).toMatchObject({ start: 0, shown: false })
		expect(boxes.get('b')).toMatchObject({ start: 0, shown: true })
	})

	it('goes by the height of the tab that shows', () => {
		const group = { tabs: ['a', 'b'], active: 'b' }
		const boxes = boxesOf([{ ...stack([]), groups: [group, alone('c')] }], measured({ a: 500, b: 100, c: 50 }))
		expect(boxes.get('c')!.start).toBe(99)
	})
})

describe('changing the layout', () => {
	const layout: PanelLayout = [stack(['a', 'b']), stack(['c'], { side: 'left' })]

	it('takes a panel out of a stack to a place of its own', () => {
		const next = placed(layout, [alone('b')], { side: 'left', inset: 50, along: 50 })
		expect(names(next)).toEqual([['a'], ['c'], ['b']])
		expect(next[2]).toMatchObject({ side: 'left', inset: 50, along: 50, full: false })
	})

	it('removes a stack that nothing is left in', () => {
		expect(names(placed(layout, [alone('c')], { side: 'right', inset: 9, along: 9 }))).toEqual([
			['a', 'b'],
			['c'],
		])
	})

	const onEdge: PanelLayout = [
		stack(['a'], { side: 'left', along: 40 }),
		stack(['b'], { side: 'left', along: 'end' }),
	]

	it('merges with the next along the edge, the one that reached it taking up the room', () => {
		const down = merged(onEdge, 'a', 'b')
		expect(names(down)).toEqual([['a', 'b']])
		expect(down[0]).toMatchObject({ along: 40, full: true, filler: 'a' })
		const up = merged(onEdge, 'b', 'a')
		expect(names(up)).toEqual([['a', 'b']])
		expect(up[0]).toMatchObject({ along: 40, full: true, filler: 'b' })
	})

	it('joins under what is above, which stays where it is', () => {
		const apart: PanelLayout = [stack(['a'], { side: 'left', along: 20 }), stack(['b'], { side: 'left', along: 300 })]
		const next = joinedUnder(apart, 'b', 'a')
		expect(names(next)).toEqual([['a', 'b']])
		expect(next[0]).toMatchObject({ along: 20, full: false })
		const full: PanelLayout = [stack(['a'], { side: 'left' }), stack(['b'], { side: 'left', along: 300, full: true })]
		expect(joinedUnder(full, 'b', 'a')[0]).toMatchObject({ along: 0, full: true, filler: 'b' })
	})

	it('finds what gives way across a line, unless that takes up the room by itself', () => {
		const three: PanelLayout = [stack(['a', 'b', 'c'])]
		expect(acrossLine(three, 'a', 'forward')).toBe('b')
		expect(acrossLine(three, 'c', 'back')).toBe('b')
		expect(acrossLine(three, 'c', 'forward')).toBeNull()
		expect(acrossLine(three, 'a', 'back')).toBeNull()
		const filling: PanelLayout = [{ ...stack(['a', 'b', 'c'], { full: true }), filler: 'b' }]
		expect(acrossLine(filling, 'a', 'forward')).toBeNull()
		expect(acrossLine(filling, 'c', 'back')).toBeNull()
	})

	it('settles what comes to the end of an edge onto what goes on toward it', () => {
		const full: PanelLayout = [
			stack(['a'], { side: 'left', full: true }),
			stack(['b'], { side: 'left', along: 'end' }),
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
		const next = placed(tabsOfTwo, [alone('a')], { side: 'left', inset: 9, along: 9 })
		expect(next[0]!.groups).toEqual([{ tabs: ['b'], active: 'b' }])
		expect(next.at(-1)!.groups).toEqual([alone('a')])
	})

	it('changes which tab shows', () => {
		expect(activated(tabsOfTwo, 'b')[0]!.groups[0]!.active).toBe('b')
		expect(activated(tabsOfTwo, 'a')).toBe(tabsOfTwo)
	})

	it('has what grows from the end of the window, once full, start from the top', () => {
		const next = withFull([stack(['a'], { along: 'end' })], 'a', true)
		expect(next[0]).toMatchObject({ along: 0, full: true })
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

describe('on any edge', () => {
	const lying = (sizes: Record<string, number>) => ({
		stage: STAGE,
		sizes: new Map(Object.entries(sizes).map(([name, width]) => [name, { width, height: 40 }])),
	})

	it('comes onto the top or the bottom, and to the middle of it', () => {
		expect(placeAt(400, 5, { width: 300, height: 40 }, STAGE)).toEqual({ side: 'top', inset: 0, along: 400 })
		expect(placeAt(350, 755, { width: 300, height: 40 }, STAGE)).toEqual({ side: 'bottom', inset: 0, along: 'middle' })
		expect(placeAt(0, 0, { width: 300, height: 40 }, STAGE).side).toBe('top')
	})

	it('goes across the top, one after another, and on to the end when full', () => {
		const boxes = boxesOf([stack(['a', 'b'], { side: 'top', full: true })], lying({ a: 200, b: 100 }))
		expect(boxes.get('a')).toMatchObject({ start: 0, end: null, joinedAfter: true })
		expect(boxes.get('b')).toMatchObject({ start: 199, end: 0, flushEnd: true })
	})

	it('fills across only as far as what is next along the top', () => {
		const layout: PanelLayout = [
			stack(['a'], { side: 'top', full: true }),
			stack(['b'], { side: 'top', along: 'end' }),
		]
		expect(boxesOf(layout, lying({ a: 200, b: 300 })).get('a')).toMatchObject({ end: 308, neighbor: 'b' })
	})

	it('is in the middle of its edge', () => {
		const box = boxesOf([stack(['a'], { side: 'bottom', along: 'middle' })], lying({ a: 200 })).get('a')!
		expect(box.start).toBe(400)
	})

	it('gives a corner to what was put there later', () => {
		const left = stack(['a'], { side: 'left', full: true, since: 1 })
		const top = stack(['t'], { side: 'top', full: true, since: 2 })
		const sizes = { stage: STAGE, sizes: new Map([['a', { width: 300, height: 100 }], ['t', { width: 200, height: 40 }]]) }
		const later = boxesOf([left, top], sizes)
		expect(later.get('a')!.start).toBe(48)
		expect(later.get('t')!.start).toBe(0)
		const earlier = boxesOf([{ ...left, since: 3 }, top], sizes)
		expect(earlier.get('a')!.start).toBe(0)
		expect(earlier.get('t')!.start).toBe(308)
	})

	it('has nothing to do with a corner it does not reach', () => {
		const left = stack(['a'], { side: 'left', since: 1 })
		const top = stack(['t'], { side: 'top', along: 500, since: 2 })
		const sizes = { stage: STAGE, sizes: new Map([['a', { width: 300, height: 100 }], ['t', { width: 200, height: 40 }]]) }
		expect(boxesOf([left, top], sizes).get('a')!.start).toBe(0)
	})

	it('is stamped as the latest once it is taken hold of', () => {
		const next = stamped([stack(['a'], { since: 4 }), stack(['b'], { side: 'left', since: 2 })], 'b')
		expect(next[1]!.since).toBe(5)
	})
})

describe('minimized among others', () => {
	it('leaves the room to the rest, with another taking it up if it took it up', () => {
		const layout: PanelLayout = [{ ...stack(['a', 'b', 'c'], { full: true }), filler: 'c' }]
		const sizes = { ...measured({ a: 200, b: 100, c: 36 }), closed: new Set(['c']) }
		const boxes = boxesOf(layout, sizes)
		expect(boxes.get('c')).toMatchObject({ folded: true, start: null, end: 0 })
		expect(boxes.get('b')).toMatchObject({ folded: false, start: 199, end: 35 })
	})

	it('is not folded alone, as it goes to its wall', () => {
		const boxes = boxesOf([stack(['a'])], { ...measured({ a: 36 }), closed: new Set(['a']) })
		expect(boxes.get('a')!.folded).toBe(false)
	})
})

describe('what was kept before', () => {
	it('goes by how far down it was, as how far along', () => {
		const kept = [{ groups: [alone('a')], side: 'right', inset: 0, y: 'bottom', full: false }]
		expect(normalized(kept, [stack(['a'])])[0]).toMatchObject({ along: 'end' })
	})

	it('puts what can be there besides where it goes, until something says', () => {
		const next = normalized(null, [stack(['a'])], new Map([['bar', { side: 'bottom', inset: 0, along: 'middle' } as const]]))
		expect(next[1]).toMatchObject({ side: 'bottom', along: 'middle', groups: [alone('bar')] })
	})
})

describe('fitting what is joined', () => {
	it('leaves what fits as it is', () => {
		expect(fitted([200, 300], 800, [false, false])).toEqual([200, 300])
	})

	it('takes what is over from each, by how much it has over the least', () => {
		// 400 + 400 + 300, less the two lines shared, is 1098: 298 over.
		const next = fitted([400, 400, 300], 800, [false, false, false])
		expect(next.reduce((a, b) => a + b, 0) - 2).toBeLessThanOrEqual(801)
		expect(next[0]).toBe(next[1])
		expect(next[2]).toBeLessThan(300)
	})

	it('takes nothing from what is kept as it is', () => {
		const next = fitted([400, 64, 600], 800, [false, true, false])
		expect(next[1]).toBe(64)
		expect(next[0]! + next[2]!).toBeLessThanOrEqual(800 - 64 + 2)
	})

	it('says how much room a stack has, to what is next along the edge', () => {
		const layout: PanelLayout = [stack(['a'], { side: 'left', along: 40 }), stack(['b'], { side: 'left', along: 'end' })]
		const sizes = measured({ a: 100, b: 200 })
		expect(roomOf(layout, sizes, 'a')).toBe(800 - 200 - 8 - 40)
		expect(roomOf(layout, sizes, 'b')).toBe(800 - 148)
	})
})
