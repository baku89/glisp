import { type AST, buildPrelude, type Env, LetAST, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { type Change, type Vec, withGraphics } from './graphics'
import {
	changed,
	type Dimension,
	dimensionAt,
	dimensionChange,
	dimensionChanges,
	dimensionsDrawn,
	dimensionsHeld,
	dimensionsOf,
	drawn,
	drawnFrom,
	withExpressionAt,
	gripAt,
	placedBeside,
	placedDimensions,
} from './scene'

const env: Env = withGraphics(buildPrelude())
const ROW = 'binding:c'

const said = (dimensions: readonly Dimension[]): string[] =>
	dimensions.map(({ label, value }) => `${label} ${value}`)

const dragged = (src: string, index: number, to: Vec) => {
	const root = parse(src)
	const changes = gripAt(root, env, ROW)!.handles[index]!.to(to, to)
	return { root, changes, next: changed(root, env, ROW, changes).ast! }
}

const typed = (root: AST, dimension: Dimension, value: number): string =>
	print(changed(root, env, ROW, [dimensionChange(dimension, value)]).ast!)

describe('the numbers a drag has got hold of', () => {
	it('are what the handle changes, each on its own', () => {
		const { root, changes, next } = dragged('{c = (path.rect [0 0] [10 10])}', 7, [20, 30])
		expect(said(dimensionsOf(next, env, ROW, changes, root))).toEqual(['Width 20', 'Height 30'])
	})

	it('are only the part of a vector that was taken hold of', () => {
		const { root, changes, next } = dragged('{c = (path.rect [0 0] [10 10])}', 2, [25, 99])
		expect(said(dimensionsOf(next, env, ROW, changes, root))).toEqual(['Width 25'])
	})

	it('are in the order the call has them, whatever order they were changed in', () => {
		const { root, changes, next } = dragged('{c = (path.rect [0 0] [10 10])}', 4, [-5, -6])
		expect(said(dimensionsOf(next, env, ROW, changes, root))).toEqual([
			'X -5',
			'Y -6',
			'Width 15',
			'Height 16',
		])
	})

	it('are what a move changes', () => {
		const root = parse('{c = (path.circle [0 0] 10)}')
		const changes = gripAt(root, env, ROW)!.move!([3, 4])
		const next = changed(root, env, ROW, changes).ast!
		expect(said(dimensionsOf(next, env, ROW, changes))).toEqual(['X 3', 'Y 4'])
	})

	it('go through a style, as a handle does', () => {
		const src = '{c = (style (path.circle [0 0] 10) "red" "none" 0)}'
		const { root, changes, next } = dragged(src, 0, [30, 0])
		const [radius] = dimensionsOf(next, env, ROW, changes, root)
		expect(radius?.label).toBe('Radius')
		expect(typed(next, radius!, 7)).toBe('{c = (style (path.circle [0 0] 7) "red" "none" 0)}')
	})

	it('are nothing, for what is not numbers', () => {
		const { root, changes, next } = dragged('{c = (path.d "M 0,0 L 10,0")}', 1, [5, 5])
		expect(dimensionsOf(next, env, ROW, changes, root)).toEqual([])
	})

	it('say how far a number can go', () => {
		const root = parse('{c = (path.ngon [0 0] 10 5)}')
		const sides = dimensionAt(root, env, ROW, { route: [2] })
		expect(sides).toMatchObject({ label: 'Sides', value: 5, options: { min: 3, step: 1 } })
	})

	it('are read again from what the program is now', () => {
		const root = parse('{c = (path.circle [0 0] 10)}')
		const place = { route: [1] }
		const after = parse('{c = (path.circle [0 0] 25)}')
		expect(dimensionAt(root, env, ROW, place)?.value).toBe(10)
		expect(dimensionAt(after, env, ROW, place)?.value).toBe(25)
	})
})

describe('what is typed', () => {
	const at = (src: string, route: number[], index?: number): { root: AST; dimension: Dimension } => {
		const root = parse(src)
		return {
			root,
			dimension: dimensionAt(root, env, ROW, { route, ...(index === undefined ? {} : { index }) })!,
		}
	}

	it('changes only that one number of a vector', () => {
		const first = at('{c = (path.rect [1 2] [3 4])}', [1], 0)
		expect(typed(first.root, first.dimension, 120)).toBe('{c = (path.rect [1 2] [120 4])}')
		const second = at('{c = (path.rect [1 2] [3 4])}', [1], 1)
		expect(typed(second.root, second.dimension, 80)).toBe('{c = (path.rect [1 2] [3 80])}')
	})

	it('is a number on its own', () => {
		const { root, dimension } = at('{c = (path.circle [0 0] 10)}', [1])
		expect(typed(root, dimension, 42.5)).toBe('{c = (path.circle [0 0] 42.5)}')
	})

	it('goes back through what it refers to, as a drag does', () => {
		const { root, dimension } = at('{r = 10 c = (path.circle [0 0] r)}', [1])
		expect(typed(root, dimension, 30)).toBe('{r = 30 c = (path.circle [0 0] r)}')
	})

	it('goes back through a call, if it can be worked out', () => {
		const { root, dimension } = at('{r = 10 c = (path.circle [0 0] (* r 2))}', [1])
		expect(typed(root, dimension, 30)).toBe('{r = 10 c = (path.circle [0 0] (* r 3))}')
	})

	it('changes nothing it does not say', () => {
		const change: Change = dimensionChange(at('{c = (path.rect [1 2] [3 4])}', [0], 1).dimension, 9)
		expect(change.route).toEqual([0])
	})
})

describe('the numbers of a shape just drawn', () => {
	const base = new LetAST([], null)

	it('are where it is and how big, going to how big first', () => {
		const root = drawn(base, 'c', 'rect', [10, 20], [110, 70], false)
		const { dimensions, first } = dimensionsDrawn(root, env, ROW)
		expect(said(dimensions)).toEqual(['X 10', 'Y 20', 'Width 100', 'Height 50'])
		expect(dimensions[first]?.label).toBe('Width')
	})

	it('go to the radius of a circle', () => {
		const root = drawn(base, 'c', 'ellipse', [0, 0], [20, 20], true)
		const { dimensions, first } = dimensionsDrawn(root, env, ROW)
		expect(said(dimensions)).toEqual(['X 10', 'Y 10', 'Radius 10'])
		expect(dimensions[first]?.label).toBe('Radius')
	})

	it('have what a polygon has', () => {
		const root = drawn(base, 'c', 'ngon', [0, 0], [30, 40], false)
		const { dimensions, first } = dimensionsDrawn(root, env, ROW)
		expect(said(dimensions)).toEqual(['X 0', 'Y 0', 'Radius 50', 'Sides 5', 'Angle 53.13'])
		expect(dimensions[first]?.label).toBe('Radius')
	})

	it('leave out where it starts, if that is something else’s', () => {
		const from = parse('{o = (path.circle [50 50] 10)}') as LetAST
		const snap = {
			at: [50, 50] as Vec,
			target: 'binding:o/arg0',
			label: 'o center',
		}
		const root = drawnFrom(from, env, 'c', 'rect', snap, [80, 90], false)
		const { dimensions, first } = dimensionsDrawn(root, env, ROW)
		expect(print(root)).toContain('../o/center')
		expect(said(dimensions)).toEqual(['Width 30', 'Height 40'])
		expect(first).toBe(0)
	})
})

describe('typing an expression for a number', () => {
	const source = '{radius = 40 c = (path.rect [10 20] [100 50])}'
	const width = { route: [1], index: 0 }
	const typed = (text: string, place: { route: number[]; index?: number } = width) =>
		withExpressionAt(parse(source), env, ROW, place, text)
	const written = (text: string, place?: { route: number[]; index?: number }) => {
		const result = typed(text, place)
		return 'ast' in result ? print(result.ast) : result.problem
	}

	it('writes what it says, where the number was', () => {
		expect(written('radius')).toBe('{radius = 40 c = (path.rect [10 20] [radius 50])}')
		expect(written('(* radius 2)')).toBe('{radius = 40 c = (path.rect [10 20] [(* radius 2) 50])}')
	})

	it('can begin with a =, which is only a way to begin', () => {
		expect(written('=radius')).toBe('{radius = 40 c = (path.rect [10 20] [radius 50])}')
	})

	it('can be a number, in place of an expression', () => {
		expect(written('12')).toBe('{radius = 40 c = (path.rect [10 20] [12 50])}')
	})

	it('says what is wrong, leaving out what cannot be read or worked out', () => {
		for (const text of ['(* radius', 'nothing', 'x*2', '"text"', '[1 2]', '']) {
			expect(typed(text), text).toHaveProperty('problem')
		}
	})

	it('does not refer to itself', () => {
		const result = withExpressionAt(
			parse('{a = (path.rect [0 0] [10 10]) c = 1}'),
			env,
			'binding:a',
			width,
			'../a/size/0'
		)
		expect(result).toHaveProperty('problem')
	})

	it('says so of a number that is worked out', () => {
		const at = (src: string) => dimensionAt(parse(src), env, ROW, width)
		expect(at('{radius = 40 c = (path.rect [0 0] [radius 50])}')).toMatchObject({ value: 40, expression: true })
		expect(at('{c = (path.rect [0 0] [10 50])}')).not.toHaveProperty('expression')
	})
})

describe('where each number goes', () => {
	const placed = (src: string, places: readonly { route: number[]; index?: number }[]) =>
		placedDimensions(parse(src), env, ROW, places, [500, 500], at => at).map(
			({ dimensions, at, side }) =>
				`${dimensions.map(({ label }) => label).join('+')} ${at.join()} ${side}`
		)

	it('is by the edge that it is the length of', () => {
		const rect = '{c = (path.rect [10 20] [100 50])}'
		expect(
			placed(rect, [
				{ route: [0], index: 0 },
				{ route: [0], index: 1 },
				{ route: [1], index: 0 },
				{ route: [1], index: 1 },
			])
		).toEqual(['X+Y 10,20 above-start', 'Width 60,70 below', 'Height 110,45 right'])
	})

	it('is by the edge that is clear of the rest, however it was drawn', () => {
		const rect = '{c = (path.rect [110 70] [-100 -50])}'
		expect(
			placed(rect, [
				{ route: [1], index: 0 },
				{ route: [1], index: 1 },
			])
		).toEqual(['Width 60,70 below', 'Height 110,45 right'])
	})

	it('has the numbers of a place together, and only those', () => {
		const circle = '{c = (path.circle [10 20] 5)}'
		expect(
			placed(circle, [
				{ route: [0], index: 0 },
				{ route: [0], index: 1 },
				{ route: [1] },
			])
		).toEqual(['X+Y 10,15 above', 'Radius 15,20 right'])
		expect(placed('{c = (path.line [1 2] [3 4])}', [
			{ route: [0], index: 0 },
			{ route: [0], index: 1 },
			{ route: [1], index: 0 },
			{ route: [1], index: 1 },
		])).toEqual(['X+Y 1,2 above', 'X+Y 3,4 above'])
	})

	it('goes through a style', () => {
		expect(
			placed('{c = (style (path.circle [10 20] 5) "red" "none" 0)}', [{ route: [0, 1] }])
		).toEqual(['Radius 15,20 right'])
	})

	it('goes along with what it says', () => {
		const src = '{c = (path.rect [0 0] [200 50])}'
		expect(placed(src, [{ route: [1], index: 0 }])).toEqual(['Width 100,50 below'])
	})

	it('is by the pointer for what has no part of its own, each under the last', () => {
		const src = '{c = (path.transform (path.circle [0 0] 1) [1 0 0 1 0 0])}'
		expect(
			placed(src, [
				{ route: [1], index: 4 },
				{ route: [1], index: 5 },
			]).map(line => line.split(' ').slice(-2).join(' '))
		).toEqual(['514,514 corner', '514,540 corner'])
	})

	describe('of an offset being dragged', () => {
		const rect = '{c = (path.rect [0 0] [100 50])}'
		const dragged = (src: string, pointer: Vec, places: readonly { route: number[]; index?: number }[]) =>
			placedDimensions(parse(src), env, ROW, places, pointer, at => at, 'offset').map(
				({ dimensions, at, side }) =>
					`${dimensions.map(({ label }) => label).join('+')} ${at.join()} ${side}`
			)
		const width = [{ route: [1], index: 0 }]
		const height = [{ route: [1], index: 1 }]

		it('is outside of the side of a rect that was taken', () => {
			expect(dragged(rect, [0, 25], width)).toEqual(['Width 0,25 left'])
			expect(dragged(rect, [100, 25], width)).toEqual(['Width 100,25 right'])
			expect(dragged(rect, [50, 0], height)).toEqual(['Height 50,0 above'])
			expect(dragged(rect, [50, 50], height)).toEqual(['Height 50,50 below'])
		})

		it('goes out from the ring of a fan, each way, wherever the fan points', () => {
			const fan = '{c = (path.fan [0 0] 20 60 180 180)}'
			expect(dragged(fan, [-20, 0], [{ route: [1] }])[0]).toMatch(/ right$/)
			expect(dragged(fan, [-60, 0], [{ route: [2] }])[0]).toMatch(/ left$/)
		})

		it('is out along the handle, with only the one', () => {
			expect(dragged('{c = (path.circle [0 0] 5)}', [5, 0], [{ route: [1] }])).toEqual([
				'Radius 5,0 right',
			])
		})
	})

	describe('of a length being pulled', () => {
		const pulled = (
			src: string,
			kind: 'arrow' | 'point',
			pointer: Vec,
			places: readonly { route: number[]; index?: number }[]
		) =>
			placedDimensions(parse(src), env, ROW, places, pointer, at => at, kind).map(
				({ side }) => side
			)

		it('is out from the center of a polygon, whichever way its corner points', () => {
			const at = (angle: number) => `{c = (path.ngon [0 0] 50 5 ${angle})}`
			expect(pulled(at(0), 'point', [50, 0], [{ route: [1] }])).toEqual(['right'])
			expect(pulled(at(90), 'point', [0, 50], [{ route: [1] }])).toEqual(['below'])
			expect(pulled(at(180), 'point', [-50, 0], [{ route: [1] }])).toEqual(['left'])
			expect(pulled(at(-90), 'point', [0, -50], [{ route: [1] }])).toEqual(['above'])
		})

		it('stacks what else a corner says, rather than over the first', () => {
			const placed = placedDimensions(
				parse('{c = (path.ngon [0 0] 50 5 0)}'),
				env,
				ROW,
				[{ route: [1] }, { route: [3] }],
				[50, 0],
				at => at,
				'point'
			)
			expect(placed.map(({ at, side }) => `${at.join()} ${side}`)).toEqual([
				'50,0 right',
				'50,26 right',
			])
		})

		it('is out from the center, for the notch of a star as well', () => {
			const star = '{c = (path.star [0 0] 100 40 4 90)}'
			expect(pulled(star, 'arrow', [-28, 28], [{ route: [2] }])).toEqual(['left'])
		})

		it('is on the side of the axis that it pulls along', () => {
			const ellipse = '{c = (path.ellipse [0 0] [50 30])}'
			expect(pulled(ellipse, 'arrow', [50, 0], [{ route: [1], index: 0 }])).toEqual(['right'])
			expect(pulled(ellipse, 'arrow', [0, 30], [{ route: [1], index: 1 }])).toEqual(['below'])
		})

		it('is ahead of the end of a clothoid, however far it has come round', () => {
			const clothoid = '{c = (path.clothoid [0 0] 0 100 0 0.06)}'
			expect(pulled(clothoid, 'arrow', [0, 0], [{ route: [2] }])).toEqual(['left'])
		})

		it('is the way it faces, for a direction', () => {
			const facing = (angle: number) => `{c = (path.clothoid [0 0] ${angle} 100 0 0)}`
			const side = (angle: number) =>
				placedDimensions(parse(facing(angle)), env, ROW, [{ route: [1] }], [0, 0], at => at, 'direction').map(
					({ side }) => side
				)
			expect(side(0)).toEqual(['right'])
			expect(side(90)).toEqual(['below'])
			expect(side(180)).toEqual(['left'])
			expect(side(-90)).toEqual(['above'])
		})

		it('is off the corner, for what rounds it', () => {
			const round = '{c = (path.roundRect [0 0] [100 50] 10)}'
			expect(pulled(round, 'arrow', [12, 12], [{ route: [2] }])).toEqual(['left'])
		})
	})

	it('is the side it says, inside of the room there is', () => {
		const room: Vec = [1000, 800]
		const size: Vec = [60, 20]
		expect(placedBeside([500, 400], 'below', size, room)).toEqual([470, 414])
		expect(placedBeside([500, 400], 'above', size, room)).toEqual([470, 366])
		expect(placedBeside([500, 400], 'above-start', size, room)).toEqual([500, 366])
		expect(placedBeside([500, 400], 'right', size, room)).toEqual([514, 390])
		expect(placedBeside([500, 400], 'left', size, room)).toEqual([426, 390])
		expect(placedBeside([500, 400], 'corner', size, room)).toEqual([500, 400])
		expect(placedBeside([995, 795], 'right', size, room)).toEqual([932, 772])
		expect(placedBeside([0, 0], 'left', size, room)).toEqual([8, 8])
	})
})

describe('what a handle is about', () => {
	/** Dragged to `to`, as it would be on a canvas, and what is to be typed from there. */
	const held = (src: string, index: number, to: Vec, symmetric = false) => {
		const root = parse(src)
		const handle = gripAt(root, env, ROW)!.handles[index]!
		const how = { symmetric }
		const changes = handle.to(to, to, how)
		const next = changed(root, env, ROW, changes).ast!
		return { next, dimensions: dimensionsHeld(next, env, ROW, handle, changes, root, to, how) }
	}
	const typedIn = (next: AST, dimension: Dimension, value: number): string =>
		print(changed(next, env, ROW, dimensionChanges(next, env, ROW, dimension, value)).ast!)

	const RECT = '{c = (path.rect [100 100] [200 100])}'
	const LEFT = 0
	const TOP = 1
	const RIGHT = 2
	const BOTTOM = 3
	const TOP_LEFT = 4
	const BOTTOM_RIGHT = 7

	it('is only its height, for the top of a rect, though its Y changes too', () => {
		const { next, dimensions } = held(RECT, TOP, [200, 80])
		expect(print(next)).toBe('{c = (path.rect [100 80] [200 120])}')
		expect(said(dimensions)).toEqual(['Height 120'])
	})

	it('keeps the side across from it, when the height is typed', () => {
		const { next, dimensions } = held(RECT, TOP, [200, 80])
		expect(typedIn(next, dimensions[0]!, 50)).toBe('{c = (path.rect [100 150] [200 50])}')
	})

	it('is only its width, for the left of a rect, and keeps the right', () => {
		const { next, dimensions } = held(RECT, LEFT, [50, 150])
		expect(said(dimensions)).toEqual(['Width 250'])
		expect(typedIn(next, dimensions[0]!, 60)).toBe('{c = (path.rect [240 100] [60 100])}')
	})

	it('needs nothing else, for the right and the bottom', () => {
		const right = held(RECT, RIGHT, [320, 150])
		expect(typedIn(right.next, right.dimensions[0]!, 60)).toBe('{c = (path.rect [100 100] [60 100])}')
		const bottom = held(RECT, BOTTOM, [200, 220])
		expect(typedIn(bottom.next, bottom.dimensions[0]!, 60)).toBe('{c = (path.rect [100 100] [200 60])}')
	})

	it('is how big it is, for a corner, each keeping its own far side', () => {
		const { next, dimensions } = held(RECT, TOP_LEFT, [80, 90])
		expect(said(dimensions)).toEqual(['Width 220', 'Height 110'])
		const narrowed = changed(next, env, ROW, dimensionChanges(next, env, ROW, dimensions[0]!, 100)).ast!
		expect(print(narrowed)).toBe('{c = (path.rect [200 90] [100 110])}')
		expect(print(changed(narrowed, env, ROW, dimensionChanges(narrowed, env, ROW, dimensions[1]!, 10)).ast!)).toBe(
			'{c = (path.rect [200 190] [100 10])}'
		)
		expect(said(held(RECT, BOTTOM_RIGHT, [320, 220]).dimensions)).toEqual(['Width 220', 'Height 120'])
	})

	it('can be typed again and again', () => {
		const { next, dimensions } = held(RECT, TOP, [200, 80])
		const once = changed(next, env, ROW, dimensionChanges(next, env, ROW, dimensions[0]!, 50)).ast!
		expect(print(changed(once, env, ROW, dimensionChanges(once, env, ROW, dimensions[0]!, 30)).ast!)).toBe(
			'{c = (path.rect [100 170] [200 30])}'
		)
	})

	it('goes the way it was let go of, having gone past the other side', () => {
		const { next, dimensions } = held(RECT, TOP, [200, 260])
		expect(print(next)).toBe('{c = (path.rect [100 200] [200 60])}')
		expect(typedIn(next, dimensions[0]!, 30)).toBe('{c = (path.rect [100 200] [200 30])}')
	})

	it('keeps the middle, if that is how it was dragged', () => {
		const { next, dimensions } = held(RECT, TOP, [200, 90], true)
		expect(print(next)).toBe('{c = (path.rect [100 90] [200 120])}')
		expect(said(dimensions)).toEqual(['Height 120'])
		expect(typedIn(next, dimensions[0]!, 40)).toBe('{c = (path.rect [100 130] [200 40])}')
	})

	it('goes through a style', () => {
		const src = '{c = (style (path.rect [100 100] [200 100]) "red" "none" 0)}'
		const { next, dimensions } = held(src, TOP, [200, 80])
		expect(said(dimensions)).toEqual(['Height 120'])
		expect(typedIn(next, dimensions[0]!, 50)).toBe(
			'{c = (style (path.rect [100 150] [200 50]) "red" "none" 0)}'
		)
	})

	it('is only its side, for the top left of a square, and keeps the bottom right', () => {
		const { next, dimensions } = held('{c = (path.square [100 100] 100)}', 2, [80, 80])
		expect(dimensions.map(({ route, index }) => [route, index])).toEqual([[[1], undefined]])
		expect(typedIn(next, dimensions[0]!, 50)).toBe('{c = (path.square [150 150] 50)}')
	})

	describe('with what it would take along referring to something else', () => {
		const typedAt = (src: string, index: number, value: number): string => {
			const root = parse(src)
			const handle = gripAt(root, env, ROW)!.handles[index]!
			const [first] = dimensionsHeld(root, env, ROW, handle, [], root, [0, 0])
			return print(changed(root, env, ROW, dimensionChanges(root, env, ROW, first!, value)).ast!)
		}

		it('leaves what it was put on where it is', () => {
			expect(
				typedAt('{a = (path.rect [5 6] [1 1]) c = (path.rect ../a/origin [380 280])}', TOP_LEFT, 50)
			).toBe('{a = (path.rect [5 6] [1 1]) c = (path.rect ../a/origin [50 280])}')
		})

		it('leaves a name where it is', () => {
			expect(typedAt('{o = [5 6] c = (path.rect o [100 100])}', LEFT, 50)).toBe(
				'{o = [5 6] c = (path.rect o [50 100])}'
			)
		})

		it('goes by the part of it that has to change', () => {
			expect(typedAt('{x = 5 c = (path.rect [x 6] [100 100])}', LEFT, 50)).toBe(
				'{x = 5 c = (path.rect [x 6] [50 100])}'
			)
			expect(typedAt('{x = 5 c = (path.rect [x 6] [100 100])}', TOP, 50)).toBe(
				'{x = 5 c = (path.rect [x 56] [100 50])}'
			)
		})
	})

	it('is what changes, for a handle that says nothing of it', () => {
		const { dimensions } = held('{c = (path.circle [0 0] 10)}', 0, [30, 0])
		expect(said(dimensions)).toEqual(['Radius 30'])
	})
})

describe('a size that goes in proportion', () => {
	const RECT = '{c = (path.rect [0 0] ^{proportional: true} [100 50])}'
	const [LEFT, TOP, RIGHT, BOTTOM, TOP_LEFT, , , BOTTOM_RIGHT] = [0, 1, 2, 3, 4, 5, 6, 7]
	const after = (src: string, index: number, to: Vec, symmetric = false): string => {
		const root = parse(src)
		const changes = gripAt(root, env, ROW)!.handles[index]!.to(to, to, { symmetric })
		return print(changed(root, env, ROW, changes).ast!)
	}
	const rect = (topLeft: string, size: string) =>
		`{c = (path.rect ${topLeft} ^{proportional: true} ${size})}`

	it('has a corner keep the ratio, from the corner across, going by the further way', () => {
		expect(after(RECT, BOTTOM_RIGHT!, [200, 10])).toBe(rect('[0 0]', '[200 100]'))
		expect(after(RECT, BOTTOM_RIGHT!, [10, 100])).toBe(rect('[0 0]', '[200 100]'))
	})

	it('has the corner across stay where it is', () => {
		expect(after(RECT, TOP_LEFT!, [-100, 0])).toBe(rect('[-100 -50]', '[200 100]'))
	})

	it('has a side take the other way along, about its middle', () => {
		expect(after(RECT, RIGHT!, [200, 999])).toBe(rect('[0 -25]', '[200 100]'))
		expect(after(RECT, LEFT!, [-100, 999])).toBe(rect('[-100 -25]', '[200 100]'))
		expect(after(RECT, BOTTOM!, [999, 100])).toBe(rect('[-50 0]', '[200 100]'))
		expect(after(RECT, TOP!, [999, -50])).toBe(rect('[-50 -50]', '[200 100]'))
	})

	it('goes from the center, when that is what stays', () => {
		expect(after(RECT, BOTTOM_RIGHT!, [150, 0], true)).toBe(rect('[-50 -25]', '[200 100]'))
	})

	it('comes through to what it refers to', () => {
		const src = '{s = ^{proportional: true} [100 50] c = (path.rect [0 0] s)}'
		expect(after(src, BOTTOM_RIGHT!, [200, 100])).toBe(
			'{s = ^{proportional: true} [200 100] c = (path.rect [0 0] s)}'
		)
	})

	it('goes through a style', () => {
		const src = '{c = (style (path.rect [0 0] ^{proportional: true} [100 50]) "red" "none" 0)}'
		expect(after(src, BOTTOM_RIGHT!, [200, 10])).toBe(
			'{c = (style (path.rect [0 0] ^{proportional: true} [200 100]) "red" "none" 0)}'
		)
	})

	it('is not there for a size that does not', () => {
		const src = '{c = (path.rect [0 0] [100 50])}'
		expect(after(src, BOTTOM_RIGHT!, [200, 10])).toBe('{c = (path.rect [0 0] [200 10])}')
		expect(after(src, RIGHT!, [200, 999])).toBe('{c = (path.rect [0 0] [200 50])}')
	})

	it('goes as if it did not where one way is 0, having no ratio', () => {
		const src = rect('[0 0]', '[100 0]')
		expect(after(src, BOTTOM_RIGHT!, [200, 10])).toBe(rect('[0 0]', '[200 10]'))
	})

	it('does not refer to what it snapped to, not ending up there', () => {
		const grip = gripAt(parse(RECT), env, ROW)!
		expect(grip.handles[TOP_LEFT!]!.constrained).toBe(true)
		expect(gripAt(parse('{c = (path.rect [0 0] [100 50])}'), env, ROW)!.handles[TOP_LEFT!]!.constrained).toBe(false)
	})

	it('has what is typed bring the other along', () => {
		const root = parse(RECT)
		const width = dimensionAt(root, env, ROW, { route: [1], index: 0 })!
		const changes = dimensionChanges(root, env, ROW, width, 300)
		expect(print(changed(root, env, ROW, changes).ast!)).toBe(rect('[0 0]', '[300 150]'))
	})

	it('has what is typed keep the ratio it began with, through a 0', () => {
		const base = parse(RECT)
		const width = dimensionAt(base, env, ROW, { route: [1], index: 0 })!
		const atZero = changed(base, env, ROW, dimensionChanges(base, env, ROW, width, 0, base)).ast!
		const typed = dimensionChanges(atZero, env, ROW, width, 40, base)
		expect(print(changed(atZero, env, ROW, typed).ast!)).toBe(rect('[0 0]', '[40 20]'))
	})

	it('has what is typed after a drag keep the ratio, and the corner across', () => {
		const root = parse(RECT)
		const handle = gripAt(root, env, ROW)!.handles[TOP_LEFT!]!
		const [width] = handle.means!
		const changes = width!.set(300, [-1, -1])
		expect(print(changed(root, env, ROW, changes).ast!)).toBe(rect('[-200 -100]', '[300 150]'))
	})
})
