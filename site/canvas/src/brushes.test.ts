import { buildPrelude, type Env, type LetAST, parse, print } from '@glisp/lang'
import { bounds } from 'pave/path/metrics'
import { describe, expect, it } from 'vitest'

import {
	arcStrip,
	type Brush,
	brushed,
	type BrushContext,
	dubinsChain,
	radial,
	spray,
	triangleStrip,
} from './brushes'
import { NO_PAINT, type Vec, withGraphics } from './graphics'
import { gripAt, SHAPE_ATTRIBUTES, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const blank = parse('{[]}') as LetAST
const context: BrushContext = {
	paint: { ...NO_PAINT, fill: '#ff0000', stroke: '#0000ff' },
	shape: SHAPE_ATTRIBUTES,
	zoom: 1,
}

type Step = ['press' | 'drag' | 'move' | 'release', Vec]
const go = <S,>(brush: Brush<S>, steps: readonly Step[], seed = 3): S =>
	steps.reduce((state, [what, at]) => brush[what](state, at, context), brush.start(seed))
const click = (at: Vec): Step[] => [['press', at], ['release', at]]
const row = <S,>(brush: Brush<S>, state: S, final = true) => {
	const ast = brushed(blank, env, brush, state, context, final)
	return { ast, source: print(ast.bindings[0]?.[1] ?? blank), shapes: sceneOf(ast, env) }
}

describe('spray', () => {
	const stroke: Step[] = [['press', [0, 0]], ['drag', [20, 0]], ['drag', [40, 0]], ['drag', [41, 0]], ['release', [41, 0]]]

	it('is one row of a dab for each place, each its own color and size', () => {
		const { ast, shapes } = row(spray, go(spray, stroke))
		expect(ast.bindings).toHaveLength(1)
		expect(shapes).toHaveLength(3)
		expect(new Set(shapes.map(s => s.row)).size).toBe(1)
		expect(new Set(shapes.map(s => s.paint?.fill)).size).toBeGreaterThan(1)
	})

	it('comes to the same from the same seed, and otherwise from another', () => {
		const fills = (seed: number) => row(spray, go(spray, stroke, seed)).shapes.map(s => s.paint?.fill)
		expect(fills(3)).toEqual(fills(3))
		expect(fills(3)).not.toEqual(fills(4))
	})

	it('leaves the dabs there are as they are when there are more', () => {
		const few = row(spray, go(spray, stroke.slice(0, 2))).shapes
		const more = row(spray, go(spray, stroke)).shapes
		// What comes first in a vector is in front, so it is drawn last.
		expect(more.at(-1)?.paint?.fill).toBe(few.at(-1)?.paint?.fill)
	})

	it('stays within how far it says it reaches, all the way around', () => {
		const center: Vec = [500, 500]
		const points = Array.from({ length: 300 }, (): Vec => center)
		const state = { seed: 3, points }
		const reach = spray.reach!(context)
		const ast = brushed(blank, env, spray, state, context, true)
		const corners = sceneOf(ast, env).map(({ value }) => {
			const [[left, top], [right, bottom]] = bounds(value as never)
			return [left, top, right, bottom] as const
		})
		const out = corners.map(([l, t, r, b]) => Math.max(...[[l, t], [r, t], [l, b], [r, b]].map(([x, y]) => Math.hypot(x! - 500, y! - 500))))
		// The corners of a box around a dot are outside of the dot, by up to the part of it that is its radius.
		expect(Math.max(...out)).toBeLessThanOrEqual(reach * Math.SQRT2)
		const middles = corners.map(([l, t, r, b]) => Math.hypot((l + r) / 2 - 500, (t + b) / 2 - 500))
		expect(Math.max(...middles)).toBeLessThanOrEqual(SHAPE_ATTRIBUTES.sprayJitter + 1e-6)
		expect(Math.max(...middles)).toBeGreaterThan(SHAPE_ATTRIBUTES.sprayJitter * 0.9)
	})

	it('says it is done as it is let go of', () => {
		expect(spray.oneStroke).toBe(true)
		expect(arcStrip.oneStroke).toBeFalsy()
	})

	it('is nothing until it has been anywhere', () => {
		expect(row(spray, spray.start(1)).ast).toBe(blank)
	})
})

describe('arcStrip', () => {
	it('goes through its places by arcs, as a line', () => {
		const state = go(arcStrip, [...click([0, 0]), ...click([50, 50]), ...click([100, 0]), ...click([150, 50])])
		const { source, shapes } = row(arcStrip, state)
		expect(source).toContain('(path.arcStrip [[0 0] [50 50] [100 0] [150 50]])')
		expect(source).not.toContain('fill=')
		expect(shapes).toHaveLength(1)
		expect((shapes[0]!.value as { curves: unknown[] }).curves).toHaveLength(2)
	})

	it('is a line while there are only two places, and not a mistake for three in a line', () => {
		expect(row(arcStrip, go(arcStrip, [...click([0, 0]), ...click([50, 0])])).shapes).toHaveLength(1)
		expect(row(arcStrip, go(arcStrip, [...click([0, 0]), ...click([50, 0]), ...click([100, 0])])).shapes).toHaveLength(1)
	})
})

describe('triangleStrip', () => {
	it('has a triangle for each place after the second, each mixed from the two colors', () => {
		const state = go(triangleStrip, [...click([0, 0]), ...click([50, 0]), ...click([0, 50]), ...click([50, 50])])
		const { ast, shapes } = row(triangleStrip, state)
		expect(ast.bindings).toHaveLength(1)
		expect(shapes).toHaveLength(2)
		expect(shapes[0]!.paint?.fill).not.toBe(shapes[1]!.paint?.fill)
	})

	it('is nothing with fewer than three', () => {
		expect(row(triangleStrip, go(triangleStrip, [...click([0, 0]), ...click([50, 0])])).ast).toBe(blank)
	})
})

describe('radial', () => {
	it('puts its center down first, and then a line out from it for each drag', () => {
		const state = go(radial, [
			...click([100, 100]),
			['press', [150, 100]],
			['drag', [200, 100]],
			['drag', [130, 100]],
			['release', [130, 100]],
		])
		expect(row(radial, state).source).toContain('(path.line [130 100] [200 100])')
	})

	it('keeps to its line, wherever the drag goes', () => {
		const state = go(radial, [...click([0, 0]), ['press', [100, 0]], ['drag', [150, 90]], ['release', [150, 90]]])
		expect(row(radial, state).source).toContain('(path.line [100 0] [150 0])')
	})

	it('moves the center by a drag of the first press', () => {
		const state = go(radial, [['press', [0, 0]], ['drag', [40, 40]], ['release', [40, 40]], ['press', [90, 40]], ['drag', [120, 40]], ['release', [120, 40]]])
		expect(row(radial, state).source).toContain('(path.line [90 40] [120 40])')
	})

	it('comes to a group of lines, each painted as a line is, and one row however many there are', () => {
		const pull = (from: Vec, to: Vec): Step[] => [['press', from], ['drag', to], ['release', to]]
		const state = go(radial, [...click([0, 0]), ...pull([10, 0], [50, 0]), ...pull([0, 10], [0, 50])])
		const { ast, shapes } = row(radial, state)
		expect(ast.bindings).toHaveLength(1)
		expect(shapes.map(({ row: at }) => at).sort()).toEqual(['binding:radial1/binding:line1', 'binding:radial1/binding:line2'])
		expect(shapes.every(({ paint }) => paint?.fill === 'none')).toBe(true)
	})

	it('has no style with no color for its line, to be seen as what has none is', () => {
		const state = go(radial, [...click([0, 0]), ['press', [10, 0]], ['drag', [50, 0]], ['release', [50, 0]]])
		const none = brushed(blank, env, radial, state, { ...context, paint: NO_PAINT }, true)
		expect(print(none.bindings[0]![1])).toBe('[line1 = (path.line [10 0] [50 0])]')
	})

	it('leaves out a press that went nowhere', () => {
		const state = go(radial, [...click([0, 0]), ...click([50, 0])])
		expect(row(radial, state).ast).toBe(blank)
	})

	it('shows the way it would go', () => {
		const state = go(radial, [...click([0, 0]), ['move', [0, 10]]])
		expect(radial.guides(state, context).points).toEqual([[0, 0]])
		expect(radial.guides(state, context).lines).toHaveLength(1)
	})
})

describe('dubinsChain', () => {
	const pull = (from: Vec, to: Vec): Step[] => [['press', from], ['drag', to], ['release', to]]

	it('goes the way it was pulled, and turns as tightly as it was pulled far', () => {
		const state = go(dubinsChain, [...pull([0, 0], [50, 0]), ...pull([200, 100], [200, 130])])
		const { source, shapes } = row(dubinsChain, state)
		expect(source).toContain('[[[0 0] 0 50] [[200 100] 90 30]]')
		expect(shapes).toHaveLength(1)
		expect((shapes[0]!.value as { curves: unknown[] }).curves.length).toBeGreaterThan(0)
	})

	it('has what the tool says for a click, and goes on the way it came', () => {
		const state = go(dubinsChain, [...click([0, 0]), ...click([100, 100])])
		const { source } = row(dubinsChain, state)
		expect(source).toContain(`[[[0 0] 0] [[100 100] 45]] ${SHAPE_ATTRIBUTES.dubinsRadius})`)
	})

	it('has a click go on as tightly as the last that was pulled', () => {
		const state = go(dubinsChain, [...pull([0, 0], [50, 0]), ...click([100, 0])])
		expect(row(dubinsChain, state).source).toContain('[[100 0] 0 50]')
	})

	it('takes a press that hardly moved for a click', () => {
		const state = go(dubinsChain, [...click([0, 0]), ...pull([100, 0], [101, 1])])
		expect(row(dubinsChain, state).source).toContain('[[[0 0] 0] [[100 0] 0]]')
	})

	it('has an arrow at the end of each direction, as far out as it turns', () => {
		const state = go(dubinsChain, pull([0, 0], [0, 50]))
		const { arrows, points } = dubinsChain.guides(state, context)
		expect(points).toEqual([[0, 0]])
		expect(arrows).toHaveLength(1)
		expect(arrows![0]!.at[0]).toBeCloseTo(0)
		expect(arrows![0]!.at[1]).toBeCloseTo(50)
		expect(arrows![0]!.angle).toBeCloseTo(90)
	})

	it('takes hold of an arrow again, rather than putting down another', () => {
		const state = go(dubinsChain, [...pull([0, 0], [50, 0]), ...pull([200, 0], [250, 0]), ...pull([50, 0], [0, 80])])
		expect(state.stops).toHaveLength(2)
		expect(state.stops[0]).toEqual({ at: [0, 0], angle: 90, radius: 80 })
	})

	it('moves a place by taking hold of it, going the way it was', () => {
		const state = go(dubinsChain, [...pull([0, 0], [50, 0]), ...pull([200, 0], [250, 0]), ...pull([200, 0], [210, 40])])
		expect(state.stops).toHaveLength(2)
		expect(state.stops[1]).toEqual({ at: [210, 40], angle: 0, radius: 50 })
	})

	it('takes hold of what is near enough on screen, at any zoom', () => {
		const zoomed = { ...context, zoom: 10 }
		const first = dubinsChain.press(dubinsChain.start(0), [0, 0], zoomed)
		const near = dubinsChain.press(dubinsChain.release(first, [0, 0], zoomed), [0.5, 0], zoomed)
		expect(near.stops).toHaveLength(1)
		const far = dubinsChain.press(dubinsChain.release(first, [0, 0], zoomed), [5, 5], zoomed)
		expect(far.stops).toHaveLength(2)
	})

	it('says to leave what it drew selected', () => {
		expect(dubinsChain.selectedAfter).toBe(true)
		expect(spray.selectedAfter).toBeFalsy()
	})

	it('turns on the way to a stop as tightly as that stop says, not the one it left', () => {
		const path = (first: number, second: number) =>
			JSON.stringify(
				sceneOf(parse(`{[a = (path.dubinsChain [[[0 0] 0 ${first}] [[0 200] 180 ${second}]] 20)]}`), env)[0]!.value
			)
		expect(path(30, 40)).not.toBe(path(30, 90))
		expect(path(30, 40)).toBe(path(90, 40))
	})

	it('is nothing with one place', () => {
		expect(row(dubinsChain, go(dubinsChain, click([0, 0]))).ast).toBe(blank)
	})
})

describe('what a brush has drawn', () => {
	const gripOf = (source: string) => gripAt(parse(`{[a = ${source}]}`), env, 'binding:a')!

	it('can be taken hold of at its places, and moved as a whole', () => {
		const grip = gripOf('(path.arcStrip [[0 0] [50 50] [100 0]])')
		expect(grip.handles.map(handle => handle.at)).toEqual([[0, 0], [50, 50], [100, 0]])
		expect(grip.move!([1, 2])).toEqual([{ route: [0], value: [[1, 2], [51, 52], [101, 2]] }])
		expect(grip.handles[1]!.to([9, 9], [50, 50])).toEqual([{ route: [0], value: [[0, 0], [9, 9], [100, 0]] }])
	})

	it('moves a spray as a whole, with no handle for each of its places', () => {
		const grip = gripOf('(spray [[0 0] [10 0]] 3 5 20 40 "#ff0000" "#0000ff")')
		expect(grip.handles).toEqual([])
		expect(grip.move!([1, 1])).toEqual([{ route: [0], value: [[1, 1], [11, 1]] }])
	})

	it('moves a stop of a Dubins path, going the way it was going', () => {
		const grip = gripOf('(path.dubinsChain [[[0 0] 90] [[100 0] 45 30]] 20)')
		const place = grip.handles.filter(handle => handle.kind === 'point')[1]!
		expect(place.to([5, 5], [100, 0])).toEqual([{ route: [0], value: [[[0, 0], 90], [[5, 5], 45, 30]] }])
		expect(grip.move!([1, 1])).toEqual([{ route: [0], value: [[[1, 1], 90], [[101, 1], 45, 30]] }])
	})

	it('turns a Dubins path by the end of a line that says which way, and how tightly', () => {
		const grip = gripOf('(path.dubinsChain [[[0 0] 0] [[100 0] 90 30]] 20)')
		const tips = grip.handles.filter(handle => handle.kind === 'direction')
		// One that says nothing goes by what the whole does, and the other by its own.
		expect(tips.map(tip => tip.at)).toEqual([[20, 0], [expect.closeTo(100), expect.closeTo(30)]])
		expect(tips[0]!.pivot).toEqual([0, 0])
		expect(grip.guides).toHaveLength(2)
		const [{ value }] = tips[0]!.to([0, 50], [20, 0]) as [{ value: [number[], number, number][] }]
		expect(value[0]![0][0]).toBe(0)
		expect(value[0]![1]).toBeCloseTo(90)
		expect(value[0]![2]).toBeCloseTo(50)
		expect(value[1]).toEqual([[100, 0], 90, 30])
	})
})
