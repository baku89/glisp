import { describe, expect, it } from 'vitest'

import {
	boxesOf,
	END,
	joinAt,
	joined,
	normalized,
	type PanelLayout,
	placeAt,
	placed,
	raised,
	type Stack,
	withFull,
} from './panelLayout'

const STAGE = { width: 1000, height: 800 }
const SIZE = { width: 300, height: 200 }

const stack = (panels: readonly string[], rest: Partial<Stack> = {}): Stack => ({
	panels,
	side: 'right',
	inset: 0,
	y: 0,
	full: false,
	...rest,
})

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
		expect(placeAt(0, 100, { width: 300, height: 790 }, STAGE).y).toBe(100)
	})

	it('stays where it can be taken hold of', () => {
		expect(placeAt(-500, -500, SIZE, STAGE)).toEqual({ side: 'left', inset: 0, y: 0 })
		expect(placeAt(5000, 5000, SIZE, STAGE)).toMatchObject({ side: 'right', y: 'bottom' })
		expect(placeAt(0, 5000, { width: 300, height: 790 }, STAGE).y).toBe(760)
	})
})

describe('boxesOf', () => {
	it('starts from the top of the edge, past its curve', () => {
		const box = boxesOf([stack(['a'])], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ top: END, bottom: null, grows: 'down', flushBottom: false })
	})

	it('goes to the end of the window when full, still curving into the edge at the top', () => {
		const box = boxesOf([stack(['a'], { full: true })], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ top: END, bottom: 0, flushBottom: true })
	})

	it('stays where it starts when full from further down', () => {
		const box = boxesOf([stack(['a'], { y: 100, full: true })], measured({ a: 200 })).get('a')!
		expect(box).toMatchObject({ top: 100, bottom: 0, flushBottom: true })
	})

	it('goes one under the other when joined, sharing the line between', () => {
		const boxes = boxesOf([stack(['a', 'b'])], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')).toMatchObject({ top: END, joinedBelow: true, joinedAbove: false })
		expect(boxes.get('b')).toMatchObject({ top: END + 199, joinedAbove: true, joinedBelow: false })
	})

	it('has only the last of a stack go on to the end', () => {
		const boxes = boxesOf([stack(['a', 'b'], { full: true })], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')!.bottom).toBeNull()
		expect(boxes.get('b')).toMatchObject({ top: END + 199, bottom: 0 })
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

	it('keeps room for what is joined under it', () => {
		const boxes = boxesOf([stack(['a', 'b'])], measured({ a: 200, b: 100 }))
		expect(boxes.get('a')!.maxHeight).toBe(800 - END * 2 - 64)
	})
})

describe('changing the layout', () => {
	const layout: PanelLayout = [stack(['a', 'b']), stack(['c'], { side: 'left' })]

	it('takes a panel out of a stack to a place of its own', () => {
		const next = placed(layout, ['b'], { side: 'left', inset: 50, y: 50 })
		expect(next.map(({ panels }) => panels)).toEqual([['a'], ['c'], ['b']])
		expect(next[2]).toMatchObject({ side: 'left', inset: 50, y: 50, full: false })
	})

	it('removes a stack that nothing is left in', () => {
		expect(placed(layout, ['c'], { side: 'right', inset: 9, y: 9 }).map(({ panels }) => panels)).toEqual([
			['a', 'b'],
			['c'],
		])
	})

	it('joins a panel at a place in a stack, which keeps its place', () => {
		const next = joined(layout, ['c'], 'a', 1)
		expect(next).toHaveLength(1)
		expect(next[0]).toMatchObject({ panels: ['a', 'c', 'b'], side: 'right' })
	})

	it('joins a whole stack, in the order it has', () => {
		const three: PanelLayout = [stack(['a']), stack(['b', 'c'], { side: 'left' })]
		expect(joined(three, ['b', 'c'], 'a', 0)[0]!.panels).toEqual(['b', 'c', 'a'])
	})

	it('raises a stack over the others', () => {
		expect(raised(layout, 'a').map(({ panels }) => panels)).toEqual([['c'], ['a', 'b']])
		expect(raised(layout, 'c')).toBe(layout)
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
		expect(normalized([{ panels: 3 }], defaults)).toEqual(defaults)
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
