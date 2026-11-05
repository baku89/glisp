import { describe, expect, it } from 'vitest'

import {
	type Arrangement,
	arranged,
	barPlaceAt,
	distanceFrom,
	dropAmong,
	foldered,
	MAIN_BAR,
	mergedBars,
	movedBar,
	placed,
	separated,
	shownInFolder,
	shownOf,
	stowedAway,
	withColumns,
} from './toolbar'

const FIRST = { shown: ['a', 'b', 'c'], stowed: ['x', 'y'] }
const START = arranged(null, FIRST)
const slots = (arrangement: Arrangement, id = MAIN_BAR) => arrangement.bars.find(bar => bar.id === id)?.slots
const FREE = { x: 0.5, y: 0.5, wall: null }

describe('an arrangement of tools', () => {
	it('is what it first is, with nothing kept', () => {
		expect(START.bars).toHaveLength(1)
		expect(START.bars[0]).toMatchObject({ id: MAIN_BAR, slots: ['a', 'b', 'c'], wall: 'bottom', x: 0.5, y: 1 })
		expect(START.stowed).toEqual(['x', 'y'])
	})

	it('keeps what was done with the tools', () => {
		const kept = foldered(separated(START, 'c', FREE), 'x', 'a')
		expect(arranged(JSON.parse(JSON.stringify(kept)), FIRST)).toEqual(kept)
	})

	it('takes in what was kept when there was one bar', () => {
		const next = arranged({ shown: ['x', 'c', 'a'], stowed: ['b', 'y'] }, FIRST)
		expect(slots(next)).toEqual(['x', 'c', 'a'])
		expect(next.stowed).toEqual(['b', 'y'])
	})

	it('forgets a tool that has gone, and a new one goes where it first would', () => {
		const next = arranged({ shown: ['c', 'gone'], stowed: ['a', 'b', 'x'] }, FIRST)
		expect(slots(next)).toEqual(['c'])
		expect(next.stowed).toEqual(['a', 'b', 'x', 'y'])
	})

	it('has each tool once, whatever was kept', () => {
		const next = arranged({ shown: ['a', 'a', 1], stowed: ['a', 'b'] }, FIRST)
		expect(slots(next)).toEqual(['a', 'c'])
		expect(next.stowed).toEqual(['b', 'x', 'y'])
		expect(arranged({ shown: 'a' }, FIRST)).toEqual(START)
	})

	it('makes of a folder with one tool left that tool, and of nothing nothing', () => {
		const kept = { bars: [{ id: MAIN_BAR, slots: [{ tools: ['a', 'gone'], active: 'gone' }, { tools: [] }] }] }
		expect(slots(arranged(kept, FIRST))![0]).toBe('a')
	})
})

describe('moving a tool', () => {
	it('moves it along the bar, counting places as they were', () => {
		expect(slots(placed(START, 'a', MAIN_BAR, 3))).toEqual(['b', 'c', 'a'])
		expect(slots(placed(START, 'c', MAIN_BAR, 0))).toEqual(['c', 'a', 'b'])
		expect(slots(placed(START, 'b', MAIN_BAR, 1))).toEqual(['a', 'b', 'c'])
	})

	it('brings it out from behind the dots', () => {
		const next = placed(START, 'x', MAIN_BAR, 1)
		expect(slots(next)).toEqual(['a', 'x', 'b', 'c'])
		expect(next.stowed).toEqual(['y'])
	})

	it('puts it behind the dots', () => {
		const next = stowedAway(START, 'b')
		expect(slots(next)).toEqual(['a', 'c'])
		expect(next.stowed).toEqual(['x', 'y', 'b'])
	})

	it('takes it off to a bar of its own, and that bar goes when it is taken off of it', () => {
		const next = separated(START, 'b', { x: 0.1, y: 0.2, wall: null })
		expect(slots(next)).toEqual(['a', 'c'])
		expect(next.bars[1]).toMatchObject({ id: 'bar1', slots: ['b'], x: 0.1, y: 0.2 })
		expect(placed(next, 'b', MAIN_BAR, 1).bars).toHaveLength(1)
	})

	it('stands up what is taken off to a wall at the side', () => {
		expect(separated(START, 'b', { x: 0, y: 0.5, wall: 'left' }).bars[1]!.columns).toBe(1)
	})

	it('leaves the main bar there with nothing on it', () => {
		const next = stowedAway(stowedAway(stowedAway(START, 'a'), 'b'), 'c')
		expect(slots(next)).toEqual([])
	})

	it('leaves it where it is, let go of on the bar that it is all of', () => {
		const next = separated(START, 'b', FREE)
		expect(placed(next, 'b', 'bar1', 0)).toEqual(next)
	})
})

describe('folders', () => {
	const folder = foldered(START, 'c', 'a')

	it('makes one of two tools, showing what was put in', () => {
		expect(slots(folder)).toEqual([{ tools: ['a', 'c'], active: 'c' }, 'b'])
	})

	it('adds to one', () => {
		expect(slots(foldered(folder, 'x', 'a'))![0]).toEqual({ tools: ['a', 'c', 'x'], active: 'x' })
	})

	it('goes away when one tool is left, leaving that tool', () => {
		expect(slots(placed(folder, 'c', MAIN_BAR, 2))).toEqual(['a', 'b', 'c'])
	})

	it('goes as one, taken off or put into another', () => {
		const out = separated(folder, slots(folder)![0]!, FREE)
		expect(slots(out, 'bar1')).toEqual([{ tools: ['a', 'c'], active: 'c' }])
		expect(slots(foldered(folder, slots(folder)![0]!, 'b'))).toEqual([{ tools: ['b', 'a', 'c'], active: 'c' }])
	})

	it('shows the one in use, or else the last one that was', () => {
		const slot = { tools: ['a', 'c'], active: 'c' }
		expect(shownOf(slot, 'a')).toBe('a')
		expect(shownOf(slot, 'b')).toBe('c')
		expect(shownOf('b', 'a')).toBe('b')
		expect(slots(shownInFolder(folder, 'a'))![0]).toEqual({ tools: ['a', 'c'], active: 'a' })
	})

	it('cannot go into itself', () => {
		expect(foldered(folder, 'c', 'c')).toBe(folder)
	})
})

describe('moving a bar', () => {
	const two = separated(START, 'b', FREE)

	it('stands up on a wall at the side, and lies down again at an end', () => {
		const side = movedBar(START, MAIN_BAR, { x: 0, y: 0.5, wall: 'left' })
		expect(side.bars[0]).toMatchObject({ wall: 'left', columns: 1 })
		expect(movedBar(side, MAIN_BAR, { x: 0.5, y: 0, wall: 'top' }).bars[0]).toMatchObject({ wall: 'top', columns: null })
	})

	it('keeps a shape that it was given', () => {
		const shaped = withColumns(START, MAIN_BAR, 2)
		expect(movedBar(shaped, MAIN_BAR, { x: 0, y: 0.5, wall: 'left' }).bars[0]!.columns).toBe(2)
	})

	it('goes back to one line, shaped as wide as it has tools', () => {
		expect(withColumns(START, MAIN_BAR, 3).bars[0]!.columns).toBeNull()
		expect(withColumns(START, MAIN_BAR, 0).bars[0]!.columns).toBe(1)
	})

	it('joins another', () => {
		const next = mergedBars(two, 'bar1', MAIN_BAR, 1)
		expect(next.bars).toHaveLength(1)
		expect(slots(next)).toEqual(['a', 'b', 'c'])
	})

	it('leaves the main bar itself', () => {
		expect(mergedBars(two, MAIN_BAR, 'bar1', 0)).toBe(two)
	})
})

describe('barPlaceAt', () => {
	const STAGE = { width: 1000, height: 800 }
	const SIZE = { width: 100, height: 40 }

	it('stays where it is, away from the walls', () => {
		expect(barPlaceAt(500, 400, SIZE, STAGE)).toEqual({ x: 0.5, y: 0.5, wall: null })
	})

	it('comes onto the wall it is nearest, near one', () => {
		expect(barPlaceAt(60, 400, SIZE, STAGE)).toEqual({ x: 0, y: 0.5, wall: 'left' })
		expect(barPlaceAt(500, 770, SIZE, STAGE)).toEqual({ x: 0.5, y: 1, wall: 'bottom' })
		expect(barPlaceAt(5000, 400, SIZE, STAGE).wall).toBe('right')
	})
})

describe('dropAmong', () => {
	const cell = (left: number) => ({ left, top: 0, right: left + 32, bottom: 32 })
	const row = [cell(0), cell(34), cell(68)]

	it('goes into a place, at the middle of it', () => {
		expect(dropAmong(row, 50, 16, false)).toEqual({ kind: 'into', index: 1 })
	})

	it('goes before or after a place, at its sides', () => {
		expect(dropAmong(row, 36, 16, false)).toEqual({ kind: 'at', index: 1 })
		expect(dropAmong(row, 64, 16, false)).toEqual({ kind: 'at', index: 2 })
		expect(dropAmong(row, 200, 16, false)).toEqual({ kind: 'at', index: 3 })
	})

	it('goes by height on what stands up', () => {
		const column = [{ left: 0, top: 0, right: 32, bottom: 32 }, { left: 0, top: 34, right: 32, bottom: 66 }]
		expect(dropAmong(column, 2, 60, true)).toEqual({ kind: 'at', index: 2 })
	})

	it('goes first where there is nothing', () => {
		expect(dropAmong([], 0, 0, false)).toEqual({ kind: 'at', index: 0 })
	})
})

describe('distanceFrom', () => {
	it('is nothing inside', () => {
		expect(distanceFrom(5, 5, { left: 0, top: 0, right: 10, bottom: 10 })).toBe(0)
		expect(distanceFrom(13, 14, { left: 0, top: 0, right: 10, bottom: 10 })).toBe(5)
	})
})
