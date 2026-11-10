import { type AST, buildPrelude, check, type Env, evaluate, LetAST, print, Session, type TypedHostFn, typeFits, type TypeValue } from '@glisp/lang'
import { bound, parse } from './program.testing'
import { filtersFor, wrappedAt } from '@glisp/tweeq/filters'
import { extractedValueAt } from '@glisp/tweeq/multiRows'
import { copiedRows, pastedArguments, pastedRows, reach } from '@glisp/tweeq/rowsClipboard'
import { withSlotCommand } from '@glisp/tweeq/rowsClipboard'
import { aboutType, actionsOf, defaultFor, renameBindingAt, isAngleInput, isSizeInput, isTranslatable, numberOptionsAt, referenceAt, summaryOf, viewOf } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'
import { transform } from 'pave/path/modifiers'
import { transform } from 'pave/path/modifiers'
import { fromD, toD } from 'pave/path/svg'
import { describe, expect, it } from 'vitest'

import { BOX_ANSWERS, isRect, type PathValue, withGraphics } from './graphics'
import { isPlaceOf, boundsOfRows, boxHandlesOf, changed, gripAt, boxMeasured, gripOfPointsOrNot, gripOfRows, hasSizeMeasured, innerPathsOf, boxWithCornerAt, numbersDifferent, placeOfNumbers, pointsWithin, placePartOf, whatStayed, withBoxMeasured, withBoxOfParts, linked, pathOfRow, rowsInside, sceneOf, snapPointsOf, valueOfRow, withBoxHandles, withPaint } from './scene'

const env: Env = withGraphics(buildPrelude())
const grip = (src: string) => gripAt(parse(`{c = ${src}}`), env, 'binding:c')!
const RECT = '(path.rect [0 0] [10 10])'
const CIRCLE = '(path.circle [50 50] 5)'

describe('several places, in a box around them', () => {
	const SRC = '{a = ^point [0 0] b = ^point [100 0] c = ^point [100 50]}'
	const ROWS = ['binding:a', 'binding:b', 'binding:c']
	const held = (src = SRC, rows = ROWS) => {
		const root = parse(src)
		return { root, gripped: withBoxHandles(gripOfRows(root, env, rows), sceneOf(root, env), rows)! }
	}
	const places = (ast: AST | null) => ROWS.map(row => valueOfRow(ast!, env, row) as number[])
	const near = (is: number[][], was: number[][]) =>
		was.forEach(([x, y], i) => {
			expect(is[i]![0]).toBeCloseTo(x!)
			expect(is[i]![1]).toBeCloseTo(y!)
		})

	it('goes around them, and has nothing around one alone', () => {
		const root = parse(SRC)
		expect(boundsOfRows(sceneOf(root, env), ROWS)).toEqual([[0, 0], [100, 50]])
		expect(boundsOfRows(sceneOf(root, env), ['binding:a'])).toBeNull()
		const one = withBoxHandles(gripOfRows(root, env, ['binding:a']), sceneOf(root, env), ['binding:a'])!
		expect(one.grip.handles.map(({ kind }) => kind)).toEqual(['translate'])
	})

	it('scales all of them, each way, from the corner across', () => {
		const { root, gripped } = held()
		const corner = gripped.grip.handles.find(({ corner, at }) => corner && at![0] === 0 && at![1] === 50)!
		const { ast } = changed(root, env, gripped.rowOf[0]!, corner.to([-100, 100], corner.at!))
		near(places(ast), [[-100, 0], [100, 0], [100, 100]])
	})

	it('leaves a corner with a place on it to that place', () => {
		const { gripped } = held()
		const corners = gripped.grip.handles.filter(({ corner }) => corner).map(({ at }) => at)
		expect(corners).toEqual([[0, 50]])
	})

	it('turns all of them around the middle, from a corner, by as far as that is pulled round', () => {
		const { root, gripped } = held('{a = ^point [0 0] b = ^point [100 0] c = ^point [100 100]}')
		const turner = gripped.grip.handles.find(({ outsideCorner, at }) => outsideCorner && at![0] === 100 && at![1] === 100)!
		// That corner goes from below and to the right of the middle to below and to the left.
		const { ast } = changed(root, env, gripped.rowOf[0]!, turner.to([0, 100], turner.at!))
		near(places(ast), [[100, 0], [100, 100], [0, 100]])
	})

	it('is written finer than a pointer says, so that what lines up stays so as it goes round', () => {
		const { gripped } = held()
		const turners = gripped.grip.handles.filter(({ outsideCorner }) => outsideCorner)
		expect(turners.length).toBeGreaterThan(0)
		expect(turners.every(({ fine }) => fine)).toBe(true)
	})

	it('turns by steps, when asked', () => {
		const { root, gripped } = held('{a = ^point [0 0] b = ^point [100 0] c = ^point [100 100]}')
		const turner = gripped.grip.handles.find(({ outsideCorner, at }) => outsideCorner && at![0] === 100 && at![1] === 100)!
		const { ast } = changed(root, env, gripped.rowOf[0]!, turner.to([10, 100], turner.at!, { even: true }))
		near(places(ast), [[100, 0], [100, 100], [0, 100]])
	})

	it('only scales what cannot say how it turns, by one scale for what cannot go by two', () => {
		const rows = ['binding:p', 'binding:s']
		const withRect = held('{p = ^point [0 0] s = (path.rect [50 50] [10 10])}', rows)
		expect(withRect.gripped.grip.handles.some(({ outsideCorner }) => outsideCorner)).toBe(false)
		expect(withRect.gripped.grip.box!.even).toBe(false)
		const { ast } = changed(withRect.root, env, 'binding:p', withRect.gripped.grip.box!.scaled(2, 2, [0, 0]))
		expect(print(ast!)).toContain('(path.rect [100 100] [20 20])')
		const withCircle = held('{p = ^point [0 0] s = (path.circle [50 50] 10)}', rows)
		expect(withCircle.gripped.grip.box!.even).toBe(true)
	})

	it('moves each of them, as several rows', () => {
		const root = parse(SRC)
		let next: AST = root
		for (const row of ROWS) next = changed(next, env, row, gripAt(root, env, row)!.move!([5, 5])).ast!
		near(places(next), [[5, 5], [105, 5], [105, 55]])
	})
})

describe('what can be turned as it is written', () => {
	const R = '(path.polygon [0 0] [40 0] [40 20])'
	const by = 30
	const about: [number, number] = [3, 7]
	const [cos, sin] = [Math.cos((by * Math.PI) / 180), Math.sin((by * Math.PI) / 180)]
	const turning: [number, number, number, number, number, number] = [
		cos, sin, -sin, cos, about[0] - cos * about[0] + sin * about[1], about[1] - sin * about[0] - cos * about[1],
	]

	it.each([
		'(path.circle [50 20] 10)',
		'(path.ellipse [50 20] [30 10])',
		'(path.ellipse [50 20] [30 10] 20)',
		'(path.ngon [50 20] 20 5)',
		'(path.ngon [50 20] 20 5 10)',
		'(path.star [50 20] 20 10 5)',
		'(path.arc [50 20] 20 10 120)',
		'(path.fan [50 20] 10 20 10 120)',
		'(path.line [0 0] [40 20])',
		'(path.polyline [0 0] [40 20] [10 30])',
		R,
		'(path.cubic [0 0] [10 30] [30 30] [40 0])',
		'(path.arcThrough [0 0] [10 10] [20 0])',
		'(path.dubinsChain [[[0 0] 0] [[50 50] 0]] 10)',
		'(path.ellipseFromFoci [0 0] [40 0] [20 10])',
		'(path.capsule [0 0] [40 20] 5)',
		'(path.clothoid [0 0] 30 100 0 0.01)',
		'(path.d "M0 0 L40 0 L40 20 Z")',
		`(path.offset ${R} 5)`,
		`(path.roundCorners ${R} 3)`,
		`(path.chamfer ${R} 3)`,
		`(path.mirror ${R} (line.fromPoints [50 0] [50 10]))`,
		`(path.mirror ${R} (line.at [50 0] 90))`,
		`(path.mirror ${R} [[50 0] [0 10]])`,
		`(path.reflect ${R} (line.fromPoints [50 0] [50 10]))`,
		`(path.zigzag ${R} 2 10)`,
		`(path.wave ${R} 2 10)`,
		`(path.wave ${R} 2 10 phase: 40 angle: 30 origin: [5 5])`,
		`(path.twirl ${R} [20 10] 30 40)`,
		`(path.bulge ${R} [20 10] 30 0.4)`,
		`(path.dash ${R} [10 5])`,
		`(path.reverse ${R})`,
		`(path.close ${R})`,
		`(path.unite ${R} (path.circle [40 20] 10))`,
		`(path.subtract ${R} (path.circle [40 20] 10))`,
		`(path.blend ${R} (path.polygon [50 50] [60 50] [60 60]) 0.5)`,
		`(path.shadow ${R} [10 20])`,
		`(path.shadowFrom ${R} [-20 -20] 2)`,
		`(path.ray ${R} [-20 10] [0 10])`,
		`(style (path.roundCorners (path.mirror (path.ellipse [50 20] [30 10] 20) (line.fromPoints [90 0] [90 10])) 3) fill: "#ff0000")`,
	])('comes out as far round: %s', src => {
		const root = parse(`{c = ${src}}`)
		const answer = gripAt(root, env, 'binding:c')!.box!
		expect(answer.turned, src).toBeDefined()
		const before = pathOfRow(root, env, 'binding:c')!.path
		const { ast } = changed(root, env, 'binding:c', answer.turned!(by, about))
		const [[l, t], [r, b]] = bounds(pathOfRow(ast!, env, 'binding:c')!.path)
		const [[el, et], [er, eb]] = bounds(transform(before, turning))
		for (const [is, was] of [[l, el], [t, et], [r, er], [b, eb]]) {
			expect(Math.abs(is! - was!), src).toBeLessThan(0.2)
		}
	})

	it.each([
		'(path.rect [0 0] [10 10])',
		'(path.roundRect [0 0] [10 10] 2)',
		'(path.square [0 0] 10)',
		'(path.superellipse [0 0] [10 10] 2)',
		'(path.spiral [0 0] 1 10 2)',
		'(path.offset (path.rect [0 0] [10 10]) 5)',
		'(path.unite (path.rect [0 0] [10 10]) (path.circle [0 0] 5))',
		'(path.transform (path.circle [0 0] 5) [1 0 0 1 5 5])',
		'(path.repeatAlong (path.circle [0 0] 50) (path.circle [0 0] 2) 5)',
	])('says nothing of what would have to be wrapped, or would not be the same: %s', src => {
		expect(gripAt(parse(`{c = ${src}}`), env, 'binding:c')!.box?.turned).toBeUndefined()
	})

	describe('by the corners of the box around it', () => {
		const turners = (src: string) => {
			const root = parse(`{c = ${src}}`)
			const { grip } = withBoxHandles(gripOfRows(root, env, ['binding:c']), sceneOf(root, env), ['binding:c'])!
			return grip.handles.filter(({ outsideCorner }) => outsideCorner)
		}

		it('has them, of what says nothing of turning for itself', () => {
			expect(turners('(path.polyline [0 0] [40 20] [10 30])')).toHaveLength(4)
		})

		it('has none for what would come to the same', () => {
			expect(turners('(path.circle [50 20] 10)')).toHaveLength(0)
			expect(turners('(path.offset (path.circle [50 20] 10) 5)')).toHaveLength(0)
		})

		it('has none for what cannot say', () => {
			expect(turners('(path.rect [0 0] [10 10])')).toHaveLength(0)
		})
	})
})

describe('what goes on being what it was to a parameter, with no parameter around it', () => {
	const R = '(path.rect [0 0] [10 10])'
	const extracted = (src: string, path: string) => print(extractedValueAt(parse(src), env, path)!.ast)
	const actionOf = (src: string, row: string, id: string) => {
		const root = parse(src)
		const slot = viewOf(root, env).slots.find(({ key }) => key === row)!
		return actionsOf(slot).find(action => action.id === id)
	}

	it.each([
		['a place', `{c = ${R}}`, 'binding:c/arg0', 'origin = ^point [0 0]'],
		['a size', `{c = ${R}}`, 'binding:c/arg1', 'size2 = ^size [10 10]'],
		['a line', `{c = (path.mirror ${R} [[50 0] [0 10]])}`, 'binding:c/arg1', 'line2 = ^line [[50 0] [0 10]]'],
	])('says what %s is, when pulled out', (_, src, path, written) => {
		expect(extracted(src, path)).toContain(written)
	})

	it('has nothing to say of a number, which would be taken for one anyway', () => {
		const next = extracted(`{c = (path.offset ${R} 5)}`, 'binding:c/arg1')
		expect(next).toContain('distance = 5')
		expect(next).not.toContain('^distance 5')
	})

	it('is the same to what refers to it, and goes on being drawn', () => {
		const root = parse(`{c = ${R}}`)
		const { ast } = extractedValueAt(root, env, 'binding:c/arg0')!
		expect(bounds(pathOfRow(ast, env, 'binding:c')!.path)).toEqual(bounds(pathOfRow(root, env, 'binding:c')!.path))
		expect(sceneOf(ast, env).map(({ draw }) => draw)).toContain('path')
	})

	it('says so when copied as a row, and not when given to a parameter that says it for it', () => {
		const root = parse(`{c = ${R} d = (path.rect [5 5] [1 1])}`)
		const text = copiedRows(root, env, ['binding:c/arg0'])
		expect(text).toBe('origin = ^point [0 0]')
		expect(print(pastedArguments(root, env, ['binding:d'], text)!)).toContain('d = (path.rect [0 0] [1 1])')
		expect(print(pastedRows(root, env, null, text)!.ast)).toContain('origin = ^point [0 0]')
	})

	it('works out only what is in a cast, which goes on being what it says', () => {
		const src = '{c = ^point (vec2.add [1 2] [3 4])}'
		const next = (id: string) => print(actionOf(src, 'binding:c', id)!.apply!())
		expect(next('all')).toBe('{main = [c = ^point [4 6]]}')
		expect(next('step')).toBe('{main = [c = ^point [4 6]]}')
	})

	it('has nothing to work out of a cast of what is written', () => {
		expect(actionOf('{c = ^point [1 2]}', 'binding:c', 'all')).toBeUndefined()
		expect(actionOf('{c = ^point [1 2]}', 'binding:c', 'step')).toBeUndefined()
	})
})

describe('what is cast to a type of the canvas', () => {
	it('says what it is, as a function does', () => {
		const { castTo, slots } = viewOf(parse('^point [1 2]'), env)
		expect(castTo?.label).toBe('Point')
		expect(castTo?.doc).toContain('A place')
		const [value] = slots
		expect(viewOf(value!.ast, value!.env, value!.expected).slots.map(({ label }) => label)).toEqual(['X', 'Y'])
	})
})

describe('what a path is made from', () => {
	it('shows under an offset, a transform and bounds', () => {
		expect(grip(`(path.offset ${RECT} 5)`).sources).toHaveLength(1)
		expect(grip(`(path.transform ${RECT} [1 0 0 1 5 5])`).sources).toHaveLength(1)
		expect(grip(`(path.bounds ${RECT})`).sources).toHaveLength(1)
	})

	it('shows both of what is blended', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).sources).toHaveLength(2)
	})

	it('shows through a style', () => {
		expect(grip(`(style (path.offset ${RECT} 5))`).sources).toHaveLength(1)
	})

	it('is nothing for a path that is made from nothing', () => {
		expect(grip(RECT).sources).toBeUndefined()
	})
})

describe('how an offset goes around corners', () => {
	const area = (src: string): number => {
		const { value } = evaluate(parse(src), env)
		const [[left, top], [right, bottom]] = bounds((value as PathValue).path)
		return (right - left) * (bottom - top)
	}
	const pathOf = (src: string): string =>
		toD((evaluate(parse(src), env).value as PathValue).path)

	it('is mitered until it says otherwise', () => {
		expect(pathOf(`(path.offset ${RECT} 5)`)).toBe(pathOf(`(path.offset ${RECT} 5 join: "miter")`))
	})

	it('can be round or beveled', () => {
		const miter = pathOf(`(path.offset ${RECT} 5)`)
		expect(pathOf(`(path.offset ${RECT} 5 join: "round")`)).not.toBe(miter)
		expect(pathOf(`(path.offset ${RECT} 5 join: "bevel")`)).not.toBe(miter)
	})

	it('has a stroke end by its cap', () => {
		const line = '(path.line [0 0] [10 0])'
		expect(area(`(path.offsetStroke ${line} 4 cap: "square")`)).toBeGreaterThan(
			area(`(path.offsetStroke ${line} 4 cap: "butt")`)
		)
	})

	it('has a stroke go half of its width to each side, by its handle', () => {
		const [handle] = grip(`(path.offsetStroke ${RECT} 8)`).handles
		expect(handle!.at).toEqual([14, 5])
		expect(handle!.to([20, 5], [14, 5])).toEqual([{ route: [1], value: 20 }])
	})
})

describe('what is around a path', () => {
	it('moves what it is around', () => {
		const changes = grip(`(path.offset ${RECT} 5)`).move!([3, 4])
		expect(changes).toEqual([{ route: [0, 0], value: [3, 4] }])
	})

	it('moves both of what it blends', () => {
		const routes = grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).move!([1, 1]).map(({ route }) => route[0])
		expect(routes).toEqual([0, 1])
	})

	it('says the ratio of a blend or a mix goes from 0 to 1, for it to be a slider', () => {
		for (const src of [`(path.blend ${RECT} ${CIRCLE} 0.5)`, '(color.mix "#ff0000" "#0000ff" 0.5)']) {
			const slot = viewOf(parse(src), env).slots.at(-1)!
			expect(numberOptionsAt(slot)).toMatchObject({ min: 0, max: 1 })
		}
	})

	it('has percent be a type a program can say, as a number that says what it means', () => {
		const { value, diagnostics } = evaluate(parse('^percent 0.25'), env)
		expect(value).toBe(0.25)
		expect(diagnostics).toEqual([])
	})

	it('has angle be a type a program can say, as a number in degrees', () => {
		const { value, diagnostics } = evaluate(parse('^angle 45'), env)
		expect(value).toBe(45)
		expect(diagnostics).toEqual([])
	})

	it('has what turns, and a hue, take an angle', () => {
		for (const src of ['(line.at [0 0] 30)', '(color.hsl 120 0.5 0.5)', '(color.oklch 0.5 0.1 120)']) {
			const slot = viewOf(parse(src), env).slots.find(({ ast }) => ast.kind === 'lit' && (ast.value === 30 || ast.value === 120))!
			expect(slot.expected?.meta?.get('name'), src).toMatchObject({ value: 'angle' })
		}
	})

	it('has percent be shown as one, while it is from 0 to 1', () => {
		const slot = viewOf(parse(`(path.blend ${RECT} ${CIRCLE} 0.5)`), env).slots.at(-1)!
		expect(numberOptionsAt(slot)).toMatchObject({ min: 0, max: 1, scale: 100, suffix: '%' })
	})

	it('has the ratio of a blend go finely, as a number from 0 to 1', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).handles[0]!.fine).toBe(true)
	})

	it('has the ratio of a blend go along the line, and an offset as well', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).handles[0]!.along).toBe(true)
		expect(grip(`(path.offset ${RECT} 5)`).handles[0]!.along).toBe(true)
	})

	it('pulls the distance of an offset', () => {
		const [handle] = grip(`(path.offset ${RECT} 5)`).handles
		expect(handle!.at).toEqual([15, 5])
		expect(handle!.to([30, 5], [15, 5])).toEqual([{ route: [1], value: 20 }])
	})
})

describe('going into a path', () => {
	const root = parse(`{
		c = (path.offset ${RECT} 5)
		s = (style (path.offset ${RECT} 5))
		b = (path.blend ${RECT} ${CIRCLE} 0.5)
		n = (path.offset (path.transform ${RECT} [1 0 0 1 0 0]) 5)
		p = ${RECT}
	}`)
	const into = (row: string) => innerPathsOf(root, env, `binding:${row}`)

	it('is to what it is made from', () => {
		expect(into('c')).toEqual(['binding:c/arg0'])
	})

	it('is past a style', () => {
		expect(into('s')).toEqual(['binding:s/arg0/arg0'])
	})

	it('is to either of two', () => {
		expect(into('b')).toEqual(['binding:b/arg0', 'binding:b/arg1'])
	})

	it('goes as far as there is', () => {
		expect(into('n')).toEqual(['binding:n/arg0'])
		expect(innerPathsOf(root, env, 'binding:n/arg0')).toEqual(['binding:n/arg0/arg0'])
		expect(innerPathsOf(root, env, 'binding:n/arg0/arg0')).toEqual([])
	})

	it('has nowhere to go in a path made from numbers', () => {
		expect(into('p')).toEqual([])
	})

	it('finds the path of a row inside', () => {
		expect(pathOfRow(root, env, 'binding:c/arg0')).not.toBeNull()
		expect(pathOfRow(root, env, 'binding:c/arg1')).toBeNull()
	})
})

describe('a double click on what is made from several', () => {
	const root = parse(`{c = (path.blend ${RECT} ${CIRCLE} 0.5)}`)
	const [c, inA, inB] = ['binding:c', 'binding:c/arg0', 'binding:c/arg1']

	it('selects all that it is made from', () => {
		expect(rowsInside(root, env, c, [])).toEqual([inA, inB])
		expect(rowsInside(root, env, c, [c])).toEqual([inA, inB])
	})

	it('goes through a style', () => {
		const styled = parse(`{c = (style (path.blend ${RECT} ${CIRCLE} 0.5) fill: "#ddd")}`)
		expect(rowsInside(styled, env, c, [c])).toEqual(['binding:c/arg0/arg0', 'binding:c/arg0/arg1'])
	})

	it('narrows them down to the one that it was on', () => {
		expect(rowsInside(root, env, inA, [inA, inB])).toEqual([inA])
	})

	it('has nowhere to go from a path made from nothing', () => {
		expect(rowsInside(root, env, inA, [inA])).toEqual([])
	})

	it('goes on from what is selected inside of it', () => {
		const nested = parse(`{c = (path.offset (path.blend ${RECT} ${CIRCLE} 0.5) 5)}`)
		expect(rowsInside(nested, env, c, ['binding:c/arg0'])).toEqual([
			'binding:c/arg0/arg0',
			'binding:c/arg0/arg1',
		])
	})
})

describe('the handles of several rows', () => {
	const root = parse(`{a = ${RECT} b = ${CIRCLE} m = (path.transform ${RECT} [1 0 0 1 5 5]) g = {n = ${RECT}}}`)
	const rows = ['binding:a', 'binding:b']

	it('are those of all of them, each saying whose', () => {
		const both = gripOfRows(root, env, rows)!
		const a = gripAt(root, env, rows[0]!)!
		const b = gripAt(root, env, rows[1]!)!
		expect(both.grip.handles).toHaveLength(a.handles.length + b.handles.length)
		expect(both.rowOf).toEqual([...a.handles.map(() => rows[0]), ...b.handles.map(() => rows[1])])
		expect(both.grip.move).toBeUndefined()
	})

	it('are as they are of one', () => {
		const one = gripOfRows(root, env, ['binding:a'])!
		expect(one.grip.handles).toHaveLength(gripAt(root, env, 'binding:a')!.handles.length)
		expect(one.grip.move).toBeDefined()
	})

	it('are nothing with nothing selected', () => {
		expect(gripOfRows(root, env, [])).toBeNull()
	})
})

describe('paths combined', () => {
	const A = '(path.rect [0 0] [10 10])'
	const B = '(path.rect [5 0] [10 10])'
	const C = '(path.rect [10 0] [10 10])'
	const size = (src: string): [number, number] => {
		const { value, diagnostics } = evaluate(parse(src), env)
		expect(diagnostics).toEqual([])
		const [[left, top], [right, bottom]] = bounds((value as PathValue).path)
		return [right - left, bottom - top]
	}

	it('unites them', () => {
		expect(size(`(path.unite ${A} ${B})`)).toEqual([15, 10])
	})

	it('takes more than two', () => {
		expect(size(`(path.unite ${A} ${B} ${C})`)).toEqual([20, 10])
	})

	it('subtracts from the first, by the order they are in', () => {
		const leftOf = (src: string): number =>
			bounds((evaluate(parse(src), env).value as PathValue).path)[0][0]
		expect(size(`(path.subtract ${A} ${B})`)).toEqual([5, 10])
		expect(leftOf(`(path.subtract ${A} ${B})`)).toBe(0)
		expect(leftOf(`(path.subtract ${B} ${A})`)).toBe(10)
	})

	it('intersects them', () => {
		expect(size(`(path.intersect ${A} ${B})`)).toEqual([5, 10])
	})

	it('excludes where they overlap', () => {
		expect(size(`(path.exclude ${A} ${B})`)).toEqual([15, 10])
	})

	it('shows all that goes in, and moves all of it', () => {
		const combined = grip(`(path.unite ${A} ${B} ${C})`)
		expect(combined.sources).toHaveLength(3)
		expect(combined.move!([1, 1]).map(({ route }) => route[0])).toEqual([0, 1, 2])
	})

	it('can be gone into, to any of them', () => {
		const root = parse(`{u = (path.unite ${A} ${B} ${C})}`)
		expect(innerPathsOf(root, env, 'binding:u')).toEqual([
			'binding:u/arg0',
			'binding:u/arg1',
			'binding:u/arg2',
		])
	})
})

/** Toward an angle in degrees, from a place, a good way out. */
const add2 = ([x, y]: readonly [number, number], angle: number): [number, number] => [
	x + 100 * Math.cos((angle * Math.PI) / 180),
	y + 100 * Math.sin((angle * Math.PI) / 180),
]

describe('what else goes around a path', () => {
	const Q = '(path.rect [0 0] [40 20])'
	const ofFilter = (src: string) => evaluate(parse(src), env)
	const FILTERS = [
		`(path.roundCorners ${Q} 5)`,
		`(path.chamfer ${Q} 5)`,
		`(path.mirror ${Q} (line.fromPoints [40 0] [40 20]))`,
		`(path.reflect ${Q} (line.fromPoints [40 0] [40 20]))`,
		`(path.kaleidoscope ${Q} [20 10] 6)`,
		`(path.kaleidoscopeTile ${Q} (path.rect [0 0] [40 20]) (rect [-40 -20] [120 60]))`,
		`(path.zigzag ${Q} 2 10)`,
		`(path.wave ${Q} 2 10)`,
		`(path.twirl ${Q} [20 10] 30 90)`,
		`(path.bulge ${Q} [20 10] 30 0.5)`,
		`(path.pixelate ${Q} (rect [0 0] [10 10]))`,
		`(path.pixelate ${Q} (rect [0 0] [10 10]) "overlap" "cells")`,
		`(path.dash ${Q} [5 5])`,
		`(path.subdivide ${Q} 2)`,
		`(path.flatten ${Q} 1)`,
		`(path.reverse ${Q})`,
		`(path.close ${Q})`,
		`(path.convexHull ${Q})`,
	]

	it.each(FILTERS)('%s comes to a path, without a problem', src => {
		const { value, diagnostics } = ofFilter(src)
		expect(diagnostics).toEqual([])
		expect(toD((value as PathValue).path)).toMatch(/^M/)
	})

	it.each(FILTERS)('%s shows what it is of, and moves it', src => {
		const held = grip(src)
		expect(held.sources).toHaveLength(1)
		expect(held.move!([1, 1])[0]!.route[0]).toBe(0)
	})

	it('has a mirror go both ways, and a reflection only the other', () => {
		const widthOf = (src: string): number => {
			const [[left], [right]] = bounds((ofFilter(src).value as PathValue).path)
			return right - left
		}
		expect(widthOf(`(path.mirror ${Q} (line.fromPoints [40 0] [40 20]))`)).toBe(80)
		expect(widthOf(`(path.reflect ${Q} (line.fromPoints [40 0] [40 20]))`)).toBe(40)
	})

	it('starts a mirror on the side of what it mirrors', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.mirror')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('(line.fromPoints [40 0] [40 20])')
	})

	it('has what it mirrors go on being called what it was, in there', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.mirror')!
		const next = wrappedAt(parse(`{c = (path.circle [10 10] 5) d = (path.circle /c/center: 1)}`), env, 'binding:c', filter, 'c')!
		expect(print(next)).toMatch(/c = \(path\.mirror c = \(path\.circle/)
		expect(evaluate(next, env).diagnostics.filter(({ level }) => level === 'error')).toEqual([])
	})

	it('has what is in a mirror named again, and what went to it follow', () => {
		const root = parse('{c = (path.mirror c = (path.circle [0 0] 5) (line.fromPoints [0 0] [0 1])) d = (path.circle /c/c/center: 1)}')
		const next = renameBindingAt(root, env, 'binding:c/arg0', 'inner')!
		expect(print(next)).toContain('(path.mirror inner = (path.circle')
		expect(print(next)).toContain('/main/c/inner/center:')
		expect(evaluate(next, env).diagnostics.filter(({ level }) => level === 'error')).toEqual([])
	})

	it('has what is mirrored in a style called what the style is', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.mirror')!
		const next = wrappedAt(parse(`{c = (style ${Q} fill: "#000000")}`), env, 'binding:c/arg0', filter, 'c')!
		expect(print(next)).toMatch(/c = \(style \(path\.mirror c = \(path\.rect/)
	})

	it('starts a kaleidoscope around the middle of what it reflects', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.kaleidoscope')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('[20 10] 6')
	})

	it('starts tiling with a tile around what it reflects, and all that is next to that', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.kaleidoscopeTile')!
		expect(filter.more).toEqual([])
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('(path.rect [0 0] [40 20]) (rect [-40 -20] [120 60])')
		const { value, diagnostics } = evaluate(next, env)
		expect(diagnostics).toEqual([])
		expect(value).not.toBeUndefined()
	})

	it('starts pixelating with a cell at the corner of what it turns into cells', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.pixelate')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('(rect [0 0] [2.5 2.5])')
		expect(evaluate(next, env).diagnostics).toEqual([])
	})

	it('fills the cells that the mode says, with anchors where it says', () => {
		const circle = '(path.circle [20 20] 13)'
		const cell = '(rect [0 0] [10 10])'
		const d = (args: string) => toD((ofFilter(`(path.pixelate ${circle} ${cell} ${args})`).value as PathValue).path)
		expect(d('')).toBe(d('"center" "corners"'))
		expect(d('"overlap"')).not.toBe(d('"center"'))
		expect(d('"full"')).not.toBe(d('"center"'))
		expect(d('"center" "cells"').length).toBeGreaterThan(d('"center" "corners"').length)
	})

	it('leaves a path as it is while its cell has no size, or is too small for it', () => {
		const same = toD((ofFilter(Q).value as PathValue).path)
		const of = (cell: string) => toD((ofFilter(`(path.pixelate ${Q} ${cell})`).value as PathValue).path)
		expect(of('(rect [0 0] [0 10])')).toBe(same)
		expect(of('(rect [0 0] [0.001 0.001])')).toBe(same)
	})

	it('holds a cell by the handles of a rectangle, and moves the picture with its grid', () => {
		const src = `(path.pixelate ${Q} (rect [0 0] [10 10]))`
		const held = grip(src)
		expect(held.handles.some(({ corner }) => corner)).toBe(true)
		const moved = changed(parse(`{c = ${src}}`), env, 'binding:c', held.move!([3, 4]))
		expect(print(moved.ast!)).toContain('(path.pixelate (path.rect [3 4] [40 20]) (rect [3 4] [10 10]))')
	})

	it('makes twice as many of a thing as there are mirrors', () => {
		const inWedge = '(path.circle [50 10] 5)'
		const { curves } = (ofFilter(`(path.kaleidoscope ${inWedge} [0 0] 4)`).value as PathValue).path
		expect(curves).toHaveLength(8)
	})

	it('has how many mirrors there are by a dial, and turns by the first of them', () => {
		const { handles, guides } = grip(`(path.kaleidoscope ${Q} [20 10] 3 30)`)
		expect(handles.map(({ kind }) => kind)).toEqual(['point', 'direction', 'dia'])
		expect(guides).toHaveLength(2)
		const [center, turn, dial] = handles
		expect(center!.to([1, 2], [20, 10])).toEqual([{ route: [1], value: [1, 2] }])
		expect(turn!.to([20, 110], turn!.at!)).toEqual([{ route: [3], value: 90 }])
		// Having gone 45 degrees from the first mirror, which is as far apart as 4 of them are.
		expect(dial!.to(add2([20, 10], 75), dial!.at!)).toEqual([{ route: [2], value: 4 }])
	})

	describe('moved or turned as a whole', () => {
		const SOURCES = [
			'(path.circle [50 10] 5)',
			'(path.ngon [60 15] 12 5 10)',
			'(path.star [60 15] 12 5 5)',
			'(path.ellipse [60 15] [14 6] 25)',
			'(path.polygon [40 5] [80 8] [70 30])',
		]
		const of = (ast: AST) => (valueOfRow(ast, env, 'binding:c') as PathValue).path
		const expectSame = (a: PathValue['path'], b: PathValue['path']) => {
			const [[left, top], [right, bottom]] = bounds(a)
			const [[l, t], [r, under]] = bounds(b)
			for (const [x, y] of [[left, l], [top, t], [right, r], [bottom, under]] as const) expect(x).toBeCloseTo(y, 6)
			expect(a.curves.length).toBe(b.curves.length)
		}

		it.each(SOURCES)('moves all of a kaleidoscope of %s', source => {
			const root = parse(`{c = (path.kaleidoscope ${source} [10 20] 3 5)}`)
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.move!([30, -40]))
			expectSame(of(ast!), transform(of(root), [1, 0, 0, 1, 30, -40]))
		})

		it('moves all of a tiling', () => {
			const root = parse('{c = (path.kaleidoscopeTile (path.circle [5 5] 8) (path.rect [0 0] [10 10]) (rect [1 1] [38 18]))}')
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.move!([30, -40]))
			expectSame(of(ast!), transform(of(root), [1, 0, 0, 1, 30, -40]))
		})

		it.each(SOURCES)('turns all of a kaleidoscope of %s', source => {
			const root = parse(`{c = (path.kaleidoscope ${source} [10 20] 3 5)}`)
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.box!.turned!(90, [100, 50]))
			// 90 degrees around [100 50] takes (x, y) to (150 - y, x - 50)
			expectSame(of(ast!), transform(of(root), [0, 1, -1, 0, 150, -50]))
		})

		it('has what turns all of it, as well as what turns only the mirrors', () => {
			const root = parse('{c = (path.kaleidoscope (path.circle [50 10] 5) [0 0] 3 0)}')
			const { handles } = gripAt(root, env, 'binding:c')!
			expect(handles.filter(({ kind }) => kind === 'direction').map(({ rotates }) => rotates === true)).toEqual([false, true])
			const whole = handles.find(({ rotates }) => rotates)!
			const { ast } = changed(root, env, 'binding:c', whole.to([0, 100], whole.at!))
			expectSame(of(ast!), transform(of(root), [0, 1, -1, 0, 0, 0]))
		})
	})

	it('tiles what is in the tile, and goes as far as the area', () => {
		const widthOf = (area: string): number => {
			const [[left], [right]] = bounds(
				(ofFilter(`(path.kaleidoscopeTile (path.circle [5 5] 2) (path.rect [0 0] [10 10]) ${area})`).value as PathValue).path
			)
			return right - left
		}
		// Between the first, at 3 to 7, and the last, at 43 to 47
		expect(widthOf('(rect [1 1] [48 8])')).toBeCloseTo(44)
		expect(widthOf('(rect [1 1] [8 8])')).toBeCloseTo(4)
	})

	it.each([
		['a triangle that is a third of a turn', '(path.ngon [0 0] 50 3)', 6],
		['a triangle written out', '(path.polygon [0 0] [50 0] [0 50])', 8],
	])('can tile with %s', (_, cell, around) => {
		const [tile] = [cell]
		const p = (ofFilter(
			`(path.kaleidoscopeTile (path.circle [8 8] 1) ${tile} (rect [-300 -300] [600 600]))`
		).value as PathValue).path
		expect(p.curves.length).toBeGreaterThan(around)
	})

	it.each(['(path.ngon [0 0] 50 5)', '(path.circle [0 0] 50)', '(path.rect [0 0] [0 0])'])(
		'leaves it as it is, with a tile whose reflections do not fit together, %s',
		cell => {
			const { value, diagnostics } = ofFilter(`(path.kaleidoscopeTile ${Q} ${cell} (rect [0 0] [100 100]))`)
			expect(diagnostics).toEqual([])
			expect(toD((value as PathValue).path)).toBe(toD((ofFilter(Q).value as PathValue).path))
		}
	)

	it('has the handles of the tile and of the area', () => {
		const { handles, sources } = grip(`(path.kaleidoscopeTile ${Q} (path.rect [0 0] [40 20]) (rect [-40 -20] [120 60]))`)
		expect(sources).toHaveLength(1)
		const routes = new Set(handles.flatMap(handle => (handle.at === undefined ? [] : handle.to(handle.at, handle.at))).map(({ route }) => route[0]))
		expect([...routes].sort()).toEqual([1, 2])
	})

	it('starts what goes around a center at the middle of it', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.twirl')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('[20 10] 30')
	})

	it.each([
		['path.roundCorners', '10'],
		['path.chamfer', '10'],
		['path.twirl', '90'],
		['path.bulge', '0.5'],
		['path.offset', '10'],
		['path.zigzag', '5 20'],
	])('starts %s at something that shows, and not at nothing', (name, written) => {
		const filter = filtersFor([ofFilter(Q).value], env).find(it => it.name === name)!
		const next = print(wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!)
		expect(next).toContain(`${written})`)
	})

	it('pulls the radius of its corners, from a corner', () => {
		const [handle] = grip(`(path.roundCorners ${Q} 5)`).handles
		expect(handle!.at).toEqual([35, 0])
		expect(handle!.to([30, 0], [35, 0])).toEqual([{ route: [1], value: 10 }])
	})
})

describe('changing only how a path is painted', () => {
	it('leaves the path as it was, not worked out again', () => {
		const session = new Session(env)
		const painted = (fill: string) =>
			session.setAst(
				new LetAST(
					bound((parse(`{u = (style (path.unite ${RECT} ${CIRCLE}) fill: "${fill}")}`) as LetAST)),
					null
				)
			)
		painted('#ff0000')
		const before = pathOfRow(session.ast(), session.env, 'binding:u')
		painted('#00ff00')
		expect(before).not.toBeNull()
		expect(pathOfRow(session.ast(), session.env, 'binding:u')!.path).toBe(before!.path)
	})
})

describe('what is copied by a matrix', () => {
	const pieces = (src: string): number =>
		(evaluate(parse(src), env).value as PathValue).path.curves.length
	const span = (src: string): readonly [number, number] => {
		const [[left], [right]] = bounds((evaluate(parse(src), env).value as PathValue).path)
		return [left, right]
	}
	const BY = '[1 0 0 1 20 0]'

	it('has one for each number of times in the range, the ends included', () => {
		expect(pieces(`(path.replicate ${RECT} ${BY} 0 3)`)).toBe(4)
		expect(pieces(`(path.replicate ${RECT} ${BY} 2 2)`)).toBe(1)
	})

	it('starts where it says, and leaves the path out if 0 is not in the range', () => {
		expect(span(`(path.replicate ${RECT} ${BY} 0 3)`)).toEqual([0, 70])
		expect(span(`(path.replicate ${RECT} ${BY} 1 3)`)).toEqual([20, 70])
	})

	it('goes back by the inverse below 0', () => {
		expect(span(`(path.replicate ${RECT} ${BY} -2 1)`)).toEqual([-40, 30])
		expect(span(`(path.replicate ${RECT} ${BY} -2 -1)`)).toEqual([-40, -10])
	})

	it('is the same range whichever end comes first', () => {
		expect(span(`(path.replicate ${RECT} ${BY} 3 1)`)).toEqual([20, 70])
	})

	it('applies the matrix to what it has come to, each time', () => {
		expect(span(`(path.replicate ${RECT} [2 0 0 2 0 0] 2 2)`)).toEqual([0, 40])
	})

	it('leaves out going back by what cannot be undone', () => {
		expect(pieces(`(path.replicate ${RECT} [0 0 0 0 0 0] -2 1)`)).toBe(2)
	})

	it('stops somewhere', () => {
		expect(pieces(`(path.replicate ${RECT} ${BY} 0 1000000)`)).toBe(1001)
	})

	it('starts as a matrix that can be read, a little to the right', () => {
		const filter = filtersFor([evaluate(parse(RECT), env).value], env).find(({ name }) => name === 'path.replicate')!
		const next = wrappedAt(parse(`{c = ${RECT}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('(mat2d.trs [50 0]) 0 3')
		expect(check(next, env).filter(({ level }) => level === 'error')).toEqual([])
	})

	it('has what it starts as be what it would fall back to', () => {
		const { value } = evaluate(parse('(mat2d.trs [50 0])'), env)
		expect(value).toEqual([1, 0, 0, 1, 50, 0])
		expect(span(`(path.replicate ${RECT} () 0 1)`)).toEqual([0, 60])
	})

	it('is held at the next copy when it is written as a call, too', () => {
		const held = grip(`(path.replicate ${RECT} (mat2d.trs [20 0]) 0 3)`)
		const center = held.handles.find(({ kind, stays }) => kind === 'translate' && !stays)!
		expect(center.at).toEqual([25, 5])
		expect(center.to([35, 15], [25, 5])).toEqual([{ route: [1, 0], value: [30, 10] }])
	})

	it('says what is left unsaid of the call, in order', () => {
		const { value } = evaluate(parse('(mat2d.trs [10 20] 90 [2 2])'), env)
		const [a, b, c, d, tx, ty] = value as number[]
		expect([a, d, tx, ty].map(n => Math.round(n * 1e6) / 1e6)).toEqual([0, 0, 10, 20])
		expect([b, c].map(n => Math.round(n * 1e6) / 1e6)).toEqual([2, -2])
		const held = grip(`(path.replicate ${RECT} (mat2d.trs [0 0]) 0 3)`)
		const axis = held.handles.find(({ kind }) => kind === 'chevron')!
		expect(axis.to(axis.at!, axis.at!).map(({ route }) => route)).toEqual([[1, 1], [1, 2]])
	})

	it('is held at the next copy, and pulling that says where it goes', () => {
		const held = grip(`(path.replicate ${RECT} ${BY} 0 3)`)
		const center = held.handles.find(({ kind }) => kind === 'translate')!
		expect(center.at).toEqual([25, 5])
		expect(center.to([35, 15], [25, 5])).toEqual([{ route: [1], value: [1, 0, 0, 1, 30, 10] }])
	})

	it('goes by what a matrix is, rather than its six numbers', () => {
		const by = filtersFor([evaluate(parse(RECT), env).value], env)
			.find(({ name }) => name === 'path.replicate')!.fn.paramTypes[1]!
		expect(summaryOf(by)).toBe('Transform')
		expect(by.meta?.get('icon')).toBeDefined()
	})

	it('has each part of a matrix taken hold of as what it is', () => {
		const { paramTypes } = evaluate(parse('mat2d.trs'), env).value as TypedHostFn
		expect(isTranslatable(paramTypes[0]!)).toBe(true)
		expect(isAngleInput(paramTypes[1]!)).toBe(true)
		expect(isSizeInput(paramTypes[2]!)).toBe(true)
		expect(paramTypes[2]!.default).toEqual([1, 1])
	})

	it('shows what it copies, and moves that rather than the matrix', () => {
		const held = grip(`(path.replicate ${RECT} ${BY} 0 3)`)
		expect(held.sources).toHaveLength(1)
		expect(held.handles.length).toBeGreaterThan(0)
		expect(held.move?.([5, 5])?.[0]?.route[0]).toBe(0)
	})
})

describe('painting what refers to the corners of what is also painted', () => {
	/** Two polygons, and a line from a corner of one to a corner of the other. */
	const joined = (): AST => {
		const root = parse(
			'{a = (path.ngon [0 0] 50 5 10) b = (path.ngon [200 0] 50 5 70) l = (path.line [60 0] [140 0])}'
		)
		const snaps = snapPointsOf(root, env, sceneOf(root, env))
		const corner = (row: string) => snaps.find(point => point.code !== undefined && isPlaceOf(point, row))!
		return linked(linked(root, env, 'binding:l', 0, corner('binding:a'))!, env, 'binding:l', 1, corner('binding:b'))!
	}
	const drawnOf = (root: AST, row: string) => toD(pathOfRow(root, env, row)!.path)
	const errors = (root: AST) => check(root, env).filter(({ level }) => level === 'error')
	const painted = (root: AST, rows: readonly string[], stroke: string): AST =>
		rows.reduce((program, row) => withPaint(program, env, row, { stroke }), root)
	const ROWS = ['binding:a', 'binding:b', 'binding:l']

	it('keeps the line where it is, in whichever order they are painted', () => {
		const root = joined()
		for (const rows of [ROWS, [...ROWS].reverse(), ['binding:l'], ['binding:a']]) {
			const next = painted(root, rows, '#000000')
			expect(errors(next)).toEqual([])
			expect(drawnOf(next, 'binding:l')).toBe(drawnOf(root, 'binding:l'))
		}
	})

	it('comes back to what was written once it is no longer painted', () => {
		const root = joined()
		expect(print(painted(painted(root, ROWS, '#000000'), ROWS, 'none'))).toBe(print(root))
	})

	it('has the line follow what is moved, as before', () => {
		const next = painted(joined(), ROWS, '#000000')
		const moved = changed(next, env, 'binding:a', gripAt(next, env, 'binding:a')!.move!([10, 0])).ast!
		expect(drawnOf(moved, 'binding:l')).not.toBe(drawnOf(next, 'binding:l'))
		expect(errors(moved)).toEqual([])
	})
})

describe('putting a filter around what is referred to', () => {
	it('leaves what refers to its center where it was', () => {
		const root = parse('{a = (path.circle [10 0] 5) p = (path.circle ./a:/center 2)}')
		const filter = filtersFor([evaluate(parse('(path.circle [0 0] 1)'), env).value], env).find(({ name }) => name === 'path.offset')!
		const next = wrappedAt(root, env, 'binding:a', filter)!
		expect(check(next, env).filter(({ level }) => level === 'error')).toEqual([])
		expect(toD(pathOfRow(next, env, 'binding:p')!.path)).toBe(toD(pathOfRow(root, env, 'binding:p')!.path))
	})
})

describe('what wants a path, of what has a style', () => {
	const STYLED = '(style (path.circle [0 0] 5) fill: "#ff0000")'
	const errors = (root: AST) => check(root, env).filter(({ level }) => level === 'error')
	const picked = (src: string, source: string, target: string) => {
		const next = referenceAt(parse(src), env, source, target)!
		expect(errors(next)).toEqual([])
		return print(next)
	}

	it('refers to the path in it when one is picked', () => {
		expect(picked(`{a = ${STYLED} o = (path.offset ${RECT} 5)}`, 'binding:o/arg0', 'binding:a')).toContain(
			'o = (path.offset ../a/path: 5)'
		)
	})

	it('finds it however a style is given it', () => {
		const given = '(style fill: "#ff0000" path: (path.circle [0 0] 5))'
		expect(picked(`{a = ${given} o = (path.offset ${RECT} 5)}`, 'binding:o/arg0', 'binding:a')).toContain(
			'o = (path.offset ../a/path: 5)'
		)
	})

	it('still refers by name to a path with no style, or where any value will do', () => {
		expect(picked(`{a = ${RECT} o = (path.offset ${RECT} 5)}`, 'binding:o/arg0', 'binding:a')).toContain(
			'o = (path.offset a 5)'
		)
		expect(picked(`{a = ${STYLED} o = 0}`, 'binding:o', 'binding:a')).toContain('o = /main/a')
	})

	it('goes no further in than a style, to what only happens to fit', () => {
		const next = referenceAt(parse(`{a = ${CIRCLE} p = (path.circle [0 0] 1)}`), env, 'binding:p/arg0', 'binding:a')!
		expect(print(next)).toContain('p = (path.circle a 1)')
	})

	describe('once what is referred to by name is given one', () => {
		const SRC = `{a = ${RECT} o = (path.offset a 5) u = (path.unite ${CIRCLE} a) same = a}`
		const styled = () => withPaint(parse(SRC), env, 'binding:a', { fill: '#ff0000' })

		it('goes to the path in it, drawing as it did', () => {
			const next = styled()
			expect(print(next)).toContain('o = (path.offset ../a/path: 5)')
			expect(print(next)).toContain('../a/path:)')
			expect(errors(next)).toEqual([])
			for (const row of ['binding:o', 'binding:u']) {
				expect(toD(pathOfRow(next, env, row)!.path)).toBe(toD(pathOfRow(parse(SRC), env, row)!.path))
			}
		})

		it('leaves a name where it can be what it is', () => {
			expect(print(styled())).toContain('same = a')
		})

		it('is by name again when the style is gone', () => {
			expect(print(withPaint(styled(), env, 'binding:a', { fill: 'none' }))).toBe(print(parse(SRC)))
		})

		it('can still be taken hold of through the path', () => {
			const next = styled()
			const held = gripAt(next, env, 'binding:o')!
			expect(held.sources).toHaveLength(1)
			const moved = changed(next, env, 'binding:o', held.move!([1, 0])).ast!
			expect(errors(moved)).toEqual([])
			expect(print(moved)).toContain('(path.rect [1 0] [10 10])')
		})
	})

	it('leaves a name to what a filter comes to, which fits as well', () => {
		const root = parse(`{a = ${RECT} o = (path.offset a 5)}`)
		const filter = filtersFor([evaluate(parse(RECT), env).value], env).find(({ name }) => name === 'path.offset')!
		expect(print(wrappedAt(root, env, 'binding:a', filter)!)).toContain('o = (path.offset a 5)')
	})
})

describe('what a matrix goes around', () => {
	const applied = (src: string, [x, y]: readonly [number, number]) => {
		const m = evaluate(parse(src), env).value as number[]
		return [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!].map(n => Number(n.toFixed(6)) + 0)
	}
	const handles = (src: string) => grip(src).handles

	it('leaves its pivot where it is, but for how far it moves', () => {
		expect(applied('(mat2d.trs [10 0] 90 [2 2] [100 100])', [100, 100])).toEqual([110, 100])
		expect(applied('(mat2d.trs [0 0] 90 [1 1] [100 100])', [110, 100])).toEqual([100, 110])
	})

	it('is the origin until it is said', () => {
		expect(evaluate(parse('(mat2d.trs [10 0] 90 [2 2] [0 0])'), env).value).toEqual(
			evaluate(parse('(mat2d.trs [10 0] 90 [2 2])'), env).value
		)
	})

	it('is where its origin is held, which is where the pivot goes', () => {
		expect(handles('(mat2d.trs [10 0])').find(h => h.name === 'origin')!.at).toEqual([10, 0])
		expect(handles('(mat2d.trs [10 0] 0 [1 1] [5 5])').find(h => h.name === 'origin')!.at).toEqual([15, 5])
	})

	it('goes with Option, leaving what it is applied to where it is, and saying what comes before it', () => {
		for (const src of ['(mat2d.trs [10 0])', '(mat2d.trs [10 0] 90 [2 3] [5 5])']) {
			const root = parse(`{c = ${src}}`)
			const origin = gripAt(root, env, 'binding:c')!.handles.find(h => h.name === 'origin')!
			const { ast: next } = changed(root, env, 'binding:c', origin.to([30, 40], origin.at!, { symmetric: true }))
			const written = print(next!).match(/\(mat2d\.trs .*\)/)![0]
			const was = applied(src, [7, -3])
			expect(applied(written, [7, -3]).map(n => Number(n.toFixed(4)))).toEqual(was.map(n => Number(n.toFixed(4))))
			expect(handles(written).find(h => h.name === 'origin')!.at!.map(n => Number(n.toFixed(6)))).toEqual([30, 40])
		}
		const root = parse('{c = (mat2d.trs [10 0])}')
		const origin = gripAt(root, env, 'binding:c')!.handles.find(h => h.name === 'origin')!
		expect(print(changed(root, env, 'binding:c', origin.to([30, 40], [10, 0], { symmetric: true })).ast!)).toContain(
			'(mat2d.trs [10 0] 0 [1 1] [20 40])'
		)
	})

	it('scales along each axis by its arrow, and both by as much with Shift', () => {
		const [x, y] = handles('(mat2d.trs [0 0] 0 [1 2])').filter(h => h.kind === 'chevron')
		expect(x!.at).toEqual([80, 0])
		expect(y!.at!.map(n => Number(n.toFixed(6)) + 0)).toEqual([0, 160])
		expect(x!.to([160, 30], x!.at!)).toEqual([{ route: [1], value: 0 }, { route: [2], value: [2, 2] }])
		expect(x!.to([160, 30], x!.at!, { even: true })).toEqual([{ route: [1], value: 0 }, { route: [2], value: [2, 4] }])
		expect(y!.to([30, 80], y!.at!)).toEqual([{ route: [1], value: 0 }, { route: [2], value: [1, 1] }])
	})

	it('turns by what is a little past the end of its X axis', () => {
		const turner = handles('(mat2d.trs [0 0] 0 [1 1])').find(h => h.rotates)!
		expect(turner.at![0]).toBeGreaterThan(80)
		expect(turner.to([0, 100], turner.at!)).toEqual([{ route: [1], value: 90 }])
	})
})

describe('what is moved, where it refers to a place on something else', () => {
	const at = (source: string, move: readonly [number, number]) => {
		const root = parse(`{a = ${source} b = (path.circle [0 0] 20)}`)
		const snap = snapPointsOf(root, env, sceneOf(root, env)).find(point => point.code !== undefined && isPlaceOf(point, 'binding:a'))!
		const next = linked(root, env, 'binding:b', 0, snap)!
		return { snap, ...changed(next, env, 'binding:b', gripAt(next, env, 'binding:b')!.move!(move as [number, number])) }
	}

	it.each([
		['(path.circle [100 100] 50)', '(path.circle [110 105] 50)'],
		['(path.ellipse [100 100] [50 50] 30)', '(path.ellipse [110 105] [50 50] 30)'],
		['(path.ngon [100 100] 50 5)', '(path.ngon [110 105] 50 5)'],
	])('moves %s with it, and leaves the rest of it as it is', (source, moved) => {
		const { ast, problem } = at(source, [10, 5])
		expect(problem).toBe(null)
		expect(print(ast!)).toContain(`a = ${moved}`)
	})

	it('leaves half as what the middle of a line is', () => {
		const root = parse('{a = (path.line [50 60] [150 90]) b = (path.circle [0 0] 20)}')
		const middle = snapPointsOf(root, env, sceneOf(root, env)).find(point => point.label === 'middle' && point.code !== undefined && isPlaceOf(point, 'binding:a'))!
		const next = linked(root, env, 'binding:b', 0, middle)!
		const moved = changed(next, env, 'binding:b', gripAt(next, env, 'binding:b')!.move!([10, 5]))
		expect(moved.problem).toBe(null)
		expect(print(moved.ast!)).toContain('(vec2.midpoint ../../a/start: ../../a/end:)')
		expect(print(moved.ast!)).toContain('(path.line [50 60] [170 100])')
	})

	it('can refer to the top of a circle, where going round is not exact', () => {
		const root = parse('{a = (path.circle [100 100] 50) b = (path.circle [0 0] 20)}')
		const top = snapPointsOf(root, env, sceneOf(root, env)).find(point => point.label === 'top' && point.code !== undefined && isPlaceOf(point, 'binding:a'))!
		expect(print(linked(root, env, 'binding:b', 0, top)!)).toContain('(- ../../../a/center:/1 ../../../a/radius:)')
	})

	it.each([[10, 0], [0, 5], [-7.5, 3.25]] as const)('moves it by %s, %s just as well', (x, y) => {
		expect(at('(path.ellipse [100 100] [50 50] 30)', [x, y]).problem).toBe(null)
	})
})

describe('what is across a line', () => {
	const across = (line: string) => grip(`(path.mirror ${RECT} ${line})`)
	const on = (src: string) => bounds((evaluate(parse(src), env).value as PathValue).path)

	it('takes a line, and has no ends of its own', () => {
		const { paramNames } = evaluate(parse('path.mirror'), env).value as TypedHostFn
		expect(paramNames).toEqual(['path', 'line', 'flip'])
	})

	it('has the handles of how the line comes about', () => {
		expect(across('(line.fromPoints [10 0] [10 10])').handles.map(({ kind }) => kind)).toEqual(['point', 'point'])
		expect(across('(line.at [10 0] 90)').handles.map(({ kind }) => kind)).toEqual(['point', 'direction'])
		expect(across('[[10 0] [0 10]]').handles.map(({ kind }) => kind)).toEqual(['point', 'point'])
	})

	it('writes to what the line is made of', () => {
		const [start] = across('(line.fromPoints [10 0] [10 10])').handles
		expect(start!.to([20, 0], [10, 0])).toEqual([{ route: [1, 0], value: [20, 0] }])
	})

	it('keeps the side of the line its way says', () => {
		const [[, top], [, bottom]] = on(`(path.mirror (path.rect [0 0] [10 2]) (line.fromPoints [10 5] [0 5]))`)
		expect(top).toBeCloseTo(0)
		expect(bottom).toBeCloseTo(10)
		expect(on(`(path.mirror (path.rect [0 0] [10 2]) (line.fromPoints [0 5] [10 5]))`)[0][1]).toBe(Infinity)
	})

	it('keeps the other side with flip, the line staying as it is', () => {
		const [[, top], [, bottom]] = on(`(path.mirror (path.rect [0 0] [10 2]) (line.fromPoints [0 5] [10 5]) flip: true)`)
		expect(top).toBeCloseTo(0)
		expect(bottom).toBeCloseTo(10)
		expect(on(`(path.mirror (path.rect [0 0] [10 2]) (line.fromPoints [10 5] [0 5]) flip: true)`)[0][1]).toBe(Infinity)
		// Its handles are still those of the line.
		expect(grip(`(path.mirror ${RECT} (line.fromPoints [10 0] [10 10]) flip: true)`).handles.map(({ kind }) => kind)).toEqual(['point', 'point'])
	})

	it('has nothing to turn over in a reflection, where both sides are kept', () => {
		const held = grip(`(path.reflect ${RECT} (line.fromPoints [10 0] [10 10]))`)
		expect(held.handles.map(({ kind }) => kind)).toEqual(['point', 'point'])
	})

	describe('moved as a whole', () => {
		const moved = (src: string, delta: [number, number]) => {
			const root = parse(`{c = ${src}}`)
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.move!(delta))
			return bounds(pathOfRow(ast!, env, 'binding:c')!.path)
		}
		const boundsOf = (src: string) => bounds(pathOfRow(parse(`{c = ${src}}`), env, 'binding:c')!.path)
		const expectMoved = (src: string) => {
			const [[left, top], [right, bottom]] = boundsOf(src)
			const [[l, t], [r, b]] = moved(src, [30, -20])
			for (const [was, is] of [[left + 30, l], [top - 20, t], [right + 30, r], [bottom - 20, b]]) {
				expect(is).toBeCloseTo(was!)
			}
		}

		it('moves the line with it, however that comes about', () => {
			expectMoved(`(path.mirror ${RECT} (line.fromPoints [20 0] [20 10]))`)
			expectMoved(`(path.mirror ${RECT} (line.at [20 0] 90))`)
			expectMoved(`(path.mirror ${RECT} [[20 0] [0 10]])`)
			expectMoved(`(path.reflect ${RECT} (line.fromPoints [20 0] [20 10]))`)
		})

		it('moves every line of mirrors within mirrors, under what is around them', () => {
			expectMoved(`(style (path.roundCorners (path.mirror (path.mirror (path.mirror (path.ellipse [-113.3 -6.6] [72.9 54.6] -24.5) (line.fromPoints [-28.1 -41.3] [-134.3 84.5])) (line.fromPoints [-0.8 -58.9] [-1.7 93.5])) (line.fromPoints [-78.5 -36.4] [178.6 -37.4])) 12) fill: "#fba79d")`)
		})

		it('moves a line that is named elsewhere', () => {
			const root = parse(`{l = (line.fromPoints [20 0] [20 10]) c = (path.mirror ${RECT} l)}`)
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.move!([5, 0]))
			const [[left], [right]] = bounds(pathOfRow(ast!, env, 'binding:c')!.path)
			expect(left).toBeCloseTo(5)
			expect(right).toBeCloseTo(45)
		})
	})

	describe('what else has a place of its own', () => {
		it('says the place of a wave by its name, when moved for the first time', () => {
			const root = parse(`{c = (path.wave ${RECT} 2 10)}`)
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.move!([30, -20]))
			expect(print(ast!)).toContain('origin: [30 -20]')
			const again = changed(ast!, env, 'binding:c', gripAt(ast!, env, 'binding:c')!.move!([1, 1]))
			expect(print(again.ast!)).toContain('origin: [31 -19]')
		})

		const moved = (src: string, delta: [number, number]) => {
			const root = parse(`{c = ${src}}`)
			const { ast } = changed(root, env, 'binding:c', gripAt(root, env, 'binding:c')!.move!(delta))
			return bounds(pathOfRow(ast!, env, 'binding:c')!.path)
		}
		it.each([
			`(path.wave ${RECT} 2 10)`,
			`(path.wave ${RECT} 2 10 phase: 40 angle: 30 origin: [5 5])`,
			`(path.twirl ${RECT} [5 5] 8 90)`,
			`(path.bulge ${RECT} [5 5] 8 0.5)`,
			`(path.shadowFrom ${RECT} [-20 -20] 2)`,
			`(path.ray ${RECT} [-20 5] [0 5])`,
		])('moves it with the path: %s', src => {
			const [[left, top], [right, bottom]] = bounds(pathOfRow(parse(`{c = ${src}}`), env, 'binding:c')!.path)
			const [[l, t], [r, b]] = moved(src, [30, -20])
			for (const [is, was] of [[l, left + 30], [t, top - 20], [r, right + 30], [b, bottom - 20]]) {
				expect(is).toBeCloseTo(was!)
			}
		})
	})

	it('leaves it as it is, across a line that goes nowhere', () => {
		expect(on(`(path.mirror ${RECT} (line.fromPoints [5 5] [5 5]))`)).toEqual(on(RECT))
	})
})

describe('the box around what is selected', () => {
	const shapesOf = (src: string) => sceneOf(parse(src), env)
	const SRC = '{a = (path.rect [0 0] [10 10]) b = (path.circle [50 50] 10) p = (style (path.rect [100 0] [10 10]) fill: "#000000")}'

	it('goes around one, or all of several', () => {
		expect(boundsOfRows(shapesOf(SRC), ['binding:a'])).toEqual([[0, 0], [10, 10]])
		const [[left, top], [right, bottom]] = boundsOfRows(shapesOf(SRC), ['binding:a', 'binding:b'])!
		expect([left, top]).toEqual([0, 0])
		expect(right).toBeCloseTo(60)
		expect(bottom).toBeCloseTo(60)
	})

	it('goes around what has a style, and what is in a group', () => {
		expect(boundsOfRows(shapesOf(SRC), ['binding:p'])).toEqual([[100, 0], [110, 10]])
		const grouped = '{g = {a = (path.rect [0 0] [10 10]) b = (path.rect [20 20] [10 10])}}'
		expect(boundsOfRows(shapesOf(grouped), ['binding:g'])).toEqual([[0, 0], [30, 30]])
	})

	it('is nothing for what has no size to go around', () => {
		expect(boundsOfRows(shapesOf(SRC), [])).toBeNull()
		expect(boundsOfRows(shapesOf('{n = 1 a = (path.rect [0 0] [1 1])}'), ['binding:n'])).toBeNull()
	})
})

describe('what each thing says to the box around it', () => {
	const held = (src: string) => grip(src)
	const dragged = (src: string, way: 'corner' | 'side', to: [number, number], how = {}) => {
		const root = parse(`{c = ${src}}`)
		const g = gripAt(root, env, 'binding:c')!
		const box = boundsOfRows(sceneOf(root, env), ['binding:c'])!
		const handles = boxHandlesOf(box, g.box!)
		const handle = handles.find(({ corner }) => (way === 'corner' ? corner : !corner))!
		const { ast } = changed(root, env, 'binding:c', handle.to(to, handle.at!, how))
		return print(ast!)
	}

	it('is something from all that comes to a path', () => {
		const { members } = evaluate(parse('path'), env).value as { members: Record<string, unknown> }
		const silent = Object.entries(members)
			.filter(([, fn]) => (fn as TypedHostFn).returnType === evaluate(parse('path'), env).value)
			.filter(([, fn]) => !BOX_ANSWERS.has(fn))
			.map(([name]) => name)
		expect(silent).toEqual([])
	})

	it('has the sides only for what can go by a different scale each way', () => {
		const handlesOf = (src: string) => boxHandlesOf([[0, 0], [10, 10]], held(src).box!)
		expect(handlesOf('(path.rect [0 0] [10 10])')).toHaveLength(8)
		expect(handlesOf('(path.ellipse [5 5] [5 5])')).toHaveLength(8)
		expect(handlesOf('(path.d "M0 0 L10 10")')).toHaveLength(8)
		expect(handlesOf('(path.circle [5 5] 5)')).toHaveLength(4)
		expect(handlesOf('(path.ngon [5 5] 5 5)')).toHaveLength(4)
		expect(handlesOf('(path.ellipse [5 5] [5 3] 30)')).toHaveLength(8)
		expect(handlesOf('(path.superellipse [5 5] [5 3] 2)')).toHaveLength(8)
	})

	describe('of what comes of something else, by what that comes of', () => {
		const R = '(path.rect [0 0] [40 20])'
		const E = '(path.ellipse [20 10] [20 10] 30)'
		const expectScaled = (src: string, s = 2, about: [number, number] = [3, 7]) => {
			const root = parse(`{c = ${src}}`)
			const answer = gripAt(root, env, 'binding:c')!.box!
			expect(answer, src).toBeDefined()
			const before = bounds(pathOfRow(root, env, 'binding:c')!.path)
			const { ast } = changed(root, env, 'binding:c', answer.scaled(s, s, about))
			const [[l, t], [r, b]] = bounds(pathOfRow(ast!, env, 'binding:c')!.path)
			const at = ([x, y]: readonly number[]) => [about[0] + (x! - about[0]) * s, about[1] + (y! - about[1]) * s]
			const [[el, et], [er, eb]] = [at(before[0]), at(before[1])]
			for (const [is, was] of [[l, el], [t, et], [r, er], [b, eb]]) {
				expect(Math.abs(is! - was!), src).toBeLessThan(0.1)
			}
		}

		it.each([
			`(path.offset ${R} 5)`,
			`(path.offsetStroke ${R} 4)`,
			`(path.roundCorners ${R} 3)`,
			`(path.roundCorners ${R})`,
			`(path.chamfer ${R} 3)`,
			`(path.mirror ${R} (line.fromPoints [50 0] [50 10]))`,
			`(path.mirror ${R} (line.at [50 0] 90))`,
			`(path.mirror ${R} [[50 0] [0 10]])`,
			`(path.reflect ${R} (line.fromPoints [50 0] [50 10]))`,
			`(path.zigzag ${R} 2 10)`,
			`(path.zigzag ${R})`,
			`(path.wave ${R} 2 10)`,
			`(path.wave ${R} 2 10 phase: 40 angle: 30 origin: [5 5])`,
			`(path.dash ${R} [10 5] 3)`,
			`(path.repeatAlong ${R} (path.circle [0 0] 2) spacing: 15)`,
			`(path.twirl ${R} [20 10] 30 40)`,
			`(path.bulge ${R} [20 10] 30 0.4)`,
			`(path.dash ${R} [10 5])`,
			`(path.dash ${R})`,
			`(path.subdivide ${R} 3)`,
			`(path.flatten ${E})`,
			`(path.reverse ${R})`,
			`(path.close ${R})`,
			`(path.convexHull ${R} (path.rect [50 50] [5 5]))`,
			`(path.unite ${R} (path.rect [10 10] [50 50]))`,
			`(path.subtract ${R} (path.rect [10 5] [5 5]))`,
			`(path.intersect ${R} (path.rect [10 5] [50 50]))`,
			`(path.exclude ${R} (path.rect [10 5] [50 50]))`,
			`(path.blend ${R} (path.rect [50 50] [10 10]) 0.5)`,
			`(path.blendSteps ${R} (path.rect [50 50] [10 10]) 2)`,
			`(path.repeatAlong ${R} (path.circle [0 0] 2) 5 3)`,
			`(path.shadow ${R} [10 20])`,
			`(path.shadowFrom ${R} [-20 -20] 2)`,
			`(path.ray ${R} [-20 10] [0 10])`,
			`(path.transform ${R} [0 1 -1 0 30 5])`,
			`(path.arcThrough [0 0] [10 10] [20 0])`,
			`(path.dubinsChain [[[0 0] 0] [[50 50] 0]] 10)`,
			`(path.roundCorners (path.mirror (path.mirror ${R} (line.fromPoints [50 0] [50 10])) (line.fromPoints [10 40] [0 40])) 3)`,
		])('comes out as much larger: %s', src => expectScaled(src))

		it('goes on to what bounds are of, which come to a rectangle and not a path', () => {
			const root = parse(`{c = (path.bounds ${R})}`)
			const { ast } = changed(root, env, 'binding:c', held(`(path.bounds ${R})`).box!.scaled(2, 2, [0, 0]))
			expect(print(ast!)).toContain('(path.rect [0 0] [80 40])')
		})

		it('goes for a program as it was pasted', () => {
			expectScaled(`(style (path.roundCorners (path.mirror (path.mirror (path.mirror (path.ellipse [-113.3 -6.6] [72.9 54.6] -24.5) (line.fromPoints [-28.1 -41.3] [-134.3 84.5])) (line.fromPoints [-0.8 -58.9] [-1.7 93.5])) (line.fromPoints [-78.5 -36.4] [178.6 -37.4])) 12) fill: "#fba79d")`)
		})

		it('has the sides for what only goes on from what it is made of', () => {
			expect(held(`(path.reverse ${R})`).box!.even).toBe(false)
			expect(held(`(path.unite ${R} (path.rect [1 1] [1 1]))`).box!.even).toBe(false)
			expect(held(`(path.unite ${R} (path.circle [1 1] 1))`).box!.even).toBe(true)
			expect(held(`(path.offset ${R} 5)`).box!.even).toBe(true)
			expect(held(`(path.mirror ${R} (line.fromPoints [50 0] [50 10]))`).box!.even).toBe(true)
		})

		it('goes along what it is made of only if that says so of all of it', () => {
			expect(held(`(path.roundCorners ${E} 3)`).box!.angle).toBe(30)
			expect(held(`(path.mirror ${E} (line.at [50 0] 90))`).box!.angle).toBeUndefined()
			const two = held(`(path.unite ${E} ${R})`).box!
			expect(two.angle).toBeUndefined()
			expect(two.even).toBe(true)
		})

		it('has nothing to say, if what is in it has not', () => {
			expect(held(`(path.offset (path.replicate ${R} [1 0 0 1 50 0] 0 2) 5)`).box).toBeUndefined()
			expect(held(`(path.replicate ${R} [1 0 0 1 50 0] 0 2)`).box).toBeUndefined()
		})

		it('does not ask more for being asked from further in', () => {
			let src = R
			for (let i = 0; i < 24; i++) src = `(path.reverse ${src})`
			expect(held(src).box!.scaled(2, 2, [0, 0])).toHaveLength(2)
		})
	})

	it('passes through a style, to what is in it', () => {
		const answer = held('(style (path.rect [0 0] [10 10]) fill: "#000000")').box!
		expect(answer.even).toBe(false)
		expect(answer.scaled(2, 1, [0, 0])[1]).toEqual({ route: [0, 1], value: [20, 10] })
	})

	it('is scaled from the corner across', () => {
		expect(dragged('(path.rect [0 0] [10 10])', 'corner', [-10, -10])).toContain('(path.rect [-10 -10] [20 20])')
		expect(dragged('(path.d "M0 0 L10 10")', 'corner', [-10, -10])).toContain('M -10,-10 L 10,10')
	})

	it('goes by one scale, for what can only go by that', () => {
		const next = dragged('(path.circle [10 10] 10)', 'corner', [-10, 0])
		expect(next).toContain('(path.circle [5 5] 15)')
	})

	it('goes with an ellipse that is turned, along its axes', () => {
		const root = parse('{c = (path.ellipse [0 0] [20 10] 90)}')
		const answer = gripAt(root, env, 'binding:c')!.box!
		expect(answer.angle).toBe(90)
		const box = boundsOfRows(sceneOf(root, env), ['binding:c'], 90)!
		expect(box[0][0]).toBeCloseTo(-20)
		expect(box[0][1]).toBeCloseTo(-10)
		expect(box[1][0]).toBeCloseTo(20)
		expect(box[1][1]).toBeCloseTo(10)
		// Pulling the side along its own axis, which is down the canvas.
		const side = boxHandlesOf(box, answer).find(({ corner, at }) => !corner && Math.abs(at![1] - 20) < 1e-6)!
		const [center, radius] = side.to([0, 30], side.at!) as { value: number[] }[]
		expect(radius!.value[0]).toBeCloseTo(25)
		expect(radius!.value[1]).toBeCloseTo(10)
		expect(center!.value[0]).toBeCloseTo(0)
		expect(center!.value[1]).toBeCloseTo(5)
	})

	it('goes from the middle, with OPT', () => {
		expect(dragged('(path.rect [0 0] [10 10])', 'corner', [-5, -5], { symmetric: true })).toContain(
			'(path.rect [-5 -5] [20 20])'
		)
	})
})

describe('blending by steps', () => {
	const A = '(path.rect [0 0] [10 10])'
	const B = '(path.rect [100 0] [10 10])'
	const pathOfIt = (src: string) => (evaluate(parse(src), env).value as PathValue).path

	it('is both of them, and as many as it says between', () => {
		expect(pathOfIt(`(path.blendSteps ${A} ${B} 3)`).curves).toHaveLength(5)
		expect(pathOfIt(`(path.blendSteps ${A} ${B} 0)`).curves).toHaveLength(2)
	})

	it('has them evenly between', () => {
		const lefts = pathOfIt(`(path.blendSteps ${A} ${B} 1)`).curves.map(
			({ vertices }) => Math.min(...vertices.map(({ point }) => point[0]))
		)
		expect(lefts).toEqual([0, 50, 100])
	})

	it('goes by whole steps, and none for fewer than none', () => {
		expect(pathOfIt(`(path.blendSteps ${A} ${B} 1.6)`).curves).toHaveLength(4)
		expect(pathOfIt(`(path.blendSteps ${A} ${B} -2)`).curves).toHaveLength(2)
	})

	it('shows and moves both of what it goes between', () => {
		const held = grip(`(path.blendSteps ${A} ${B} 3)`)
		expect(held.sources).toHaveLength(2)
		expect(held.move!([1, 1]).map(({ route }) => route[0])).toEqual([0, 1])
	})

	it('is among what two paths can be put into', () => {
		const names = filtersFor([evaluate(parse(A), env).value, evaluate(parse(B), env).value], env).map(({ name }) => name)
		expect(names).toContain('path.blendSteps')
	})
})

describe('going one step on what is in a modifier', () => {
	const stepped = (src: string, row = 'binding:a') => {
		const next = withSlotCommand(parse(src), env, [row], 'step')
		return next === null ? null : print(next).replace(/\s+/g, ' ')
	}

	it('works out what is selected, not what is in it', () => {
		const next = stepped('{a = (path.offset (path.circle [10 10] 5) 2)}')
		expect(next).toMatch(/a = \(path\.d "M 17,10/)
		expect(stepped('{a = (path.blend (path.circle [10 10] 5) (path.rect [0 0] [5 5]) 0.5)}')).toMatch(/a = \(path\.d "/)
	})

	it('goes by what it is given, when it comes back as itself', () => {
		expect(stepped('{a = (style (path.circle [10 10] 5) fill: "#000000")}')).toContain('(style (path.ellipse [10 10] [5 5]) fill: ')
		expect(stepped('{a = (path.square [0 0] 10)}')).toContain('(path.rect [0 0] [10 10])')
	})

	it('works out the modifier, when there is nothing left in it to step', () => {
		const next = stepped('{a = (path.offset (path.d "M 0,0 L 10,0 L 10,10 Z") 2)}')
		expect(next).toMatch(/a = \(path\.d "/)
		expect(next).not.toContain('offset')
	})

	it('works out the modifier around what has come to as much as it can', () => {
		const arcs = '(path.d "M 200,150 A 50,50 0 0 1 100,150 A 50,50 0 0 1 200,150 Z")'
		expect(stepped(`{a = (path.offset ${arcs} 10)}`)).not.toContain('offset')
	})

	it('leaves alone what is locked, and a name', () => {
		expect(stepped('{a = (path.offset @(path.circle [10 10] 5) 2)}')).not.toContain('offset')
		expect(stepped('{c = (path.circle [10 10] 5) a = (path.offset c 2)}')).not.toContain('(path.offset (path')
	})
})

describe('the convex hull of several', () => {
	const A = '(path.rect [0 0] [10 10])'
	const B = '(path.rect [100 50] [10 10])'
	const C = '(path.circle [50 200] 10)'
	const box = (src: string) => bounds((evaluate(parse(src), env).value as PathValue).path)

	it('fits all that it is given, however many', () => {
		expect(box(`(path.convexHull ${A})`)).toEqual([[0, 0], [10, 10]])
		expect(box(`(path.convexHull ${A} ${B})`)).toEqual([[0, 0], [110, 60]])
		const [, [, bottom]] = box(`(path.convexHull ${A} ${B} ${C})`)
		expect(bottom).toBeCloseTo(210)
	})

	it('is one shape, and not one for each', () => {
		const { path } = evaluate(parse(`(path.convexHull ${A} ${B})`), env).value as PathValue
		expect(path.curves).toHaveLength(1)
	})

	it('shows and moves all of them', () => {
		const held = grip(`(path.convexHull ${A} ${B})`)
		expect(held.sources).toHaveLength(2)
		expect(held.move!([1, 1]).map(({ route }) => route[0])).toEqual([0, 1])
	})

	it('numbers them, as all of one kind, and adds another path', () => {
		const { slots, append } = viewOf(parse(`(path.convexHull ${A} ${B})`), env)
		expect(slots.map(({ label }) => label)).toEqual(['0', '1'])
		expect(append?.label.toLowerCase()).toBe('path')
		// As nothing yet, rather than an empty path that looks like one given.
		expect(print(append!.add())).toBe(`(path.convexHull ${A} ${B} ())`)
	})

	it('comes to nothing, of nothing', () => {
		expect(box('(path.convexHull)')[0][0]).toBe(Infinity)
	})

	it('is among what several paths can be put into', () => {
		const values = [A, B, C].map(src => evaluate(parse(src), env).value)
		expect(filtersFor(values, env).map(({ name }) => name)).toContain('path.convexHull')
	})
})

describe('a shadow and a ray', () => {
	const A = '(path.rect [0 0] [10 10])'
	const box = (src: string) => bounds((evaluate(parse(src), env).value as PathValue).path)

	it('has a shadow reach as far as it goes', () => {
		expect(box(`(path.shadow ${A} [20 0])`)).toEqual([[0, 0], [30, 10]])
		expect(box(`(path.shadow ${A} [0 0])`)).toEqual([[0, 0], [10, 10]])
	})

	it('takes hold of a shadow where it goes to', () => {
		const held = grip(`(path.shadow ${A} [20 0])`)
		expect(held.handles[0]!.at).toEqual([25, 5])
		expect(held.handles[0]!.to([35, 15], [25, 5])).toEqual([{ route: [1], value: [30, 10] }])
		expect(held.sources).toHaveLength(1)
	})

	it('has a shadow from a light go out from it', () => {
		const [[left], [right]] = box(`(path.shadowFrom ${A} [-10 5] 2)`)
		expect(left).toBeCloseTo(0)
		expect(right).toBeCloseTo(30)
	})

	it('takes hold of a light, and how far it reaches', () => {
		const [light, reach] = grip(`(path.shadowFrom ${A} [-10 5] 2)`).handles
		expect(light!.to([0, 0], [-10, 5])).toEqual([{ route: [1], value: [0, 0] }])
		expect(reach!.at).toEqual([20, 5])
		expect(reach!.to([35, 5], [20, 5])).toEqual([{ route: [2], value: 3 }])
	})

	it('stops a ray where it first hits', () => {
		expect(box(`(path.ray ${A} [-20 5] [-10 5])`)).toEqual([[-20, 5], [0, 5]])
	})

	it('has a ray go on, if it hits nothing, and be nothing if it goes no way', () => {
		const [, [right]] = box(`(path.ray ${A} [20 5] [30 5])`)
		expect(right).toBeGreaterThan(10000)
		expect(box(`(path.ray ${A} [20 5] [20 5])`)[0][0]).toBe(Infinity)
	})

	it('starts from around what it is of', () => {
		for (const [name, written] of [['path.ray', '[-40 5] [5 5]'], ['path.shadowFrom', '[-40 -40]']] as const) {
			const filter = filtersFor([evaluate(parse(A), env).value], env).find(f => f.name === name)!
			expect(print(wrappedAt(parse(`{c = ${A}}`), env, 'binding:c', filter)!)).toContain(written)
		}
	})
})

describe('repeating along a path', () => {
	const LINE = '(path.line [0 0] [100 0])'
	const STAMP = '(path.rect [500 500] [4 4])'
	const of = (src: string) => (evaluate(parse(src), env).value as PathValue).path

	it('has as many as it says, from one end to the other of what is open', () => {
		expect(of(`(path.repeatAlong ${LINE} ${STAMP} 3)`).curves).toHaveLength(3)
		const [[left], [right]] = bounds(of(`(path.repeatAlong ${LINE} ${STAMP} 3 0 false)`))
		expect(left).toBeCloseTo(-2)
		expect(right).toBeCloseTo(102)
	})

	it('has the middle of a shape on the path, wherever it was drawn', () => {
		const [[, top], [, bottom]] = bounds(of(`(path.repeatAlong ${LINE} ${STAMP} 1 0 false)`))
		expect(top).toBeCloseTo(-2)
		expect(bottom).toBeCloseTo(2)
	})

	it('leaves no copy on top of another, around what is closed', () => {
		const ring = of(`(path.repeatAlong (path.circle [0 0] 50) ${STAMP} 4 0 false)`)
		const middles = ring.curves.map(curve => {
			const [[l, t], [r, b]] = bounds({ curves: [curve] })
			return [Math.round((l + r) / 2), Math.round((t + b) / 2)].join()
		})
		expect(new Set(middles).size).toBe(4)
	})

	it('says nothing is wrong, with only what it has to be given', () => {
		for (const src of [`(path.repeatAlong ${LINE} ${STAMP})`, `(path.repeatAlong ${LINE} ${STAMP} 3)`]) {
			expect(evaluate(parse(src), env).diagnostics.filter(({ level }) => level === 'error')).toEqual([])
		}
		expect(of(`(path.repeatAlong ${LINE} ${STAMP})`).curves).toHaveLength(10)
	})

	it('starts from what can be seen, for what it is not given', () => {
		expect(of('(path.repeatAlong)').curves).toHaveLength(10)
		const filter = filtersFor([evaluate(parse(LINE), env).value], env).find(f => f.name === 'path.repeatAlong')!
		expect(filter.more).toEqual([])
		const next = print(wrappedAt(parse(`{c = ${LINE}}`), env, 'binding:c', filter)!)
		expect(next).toContain('(path.repeatAlong (path.line [0 0] [100 0]) (path.circle [0 0] 10))')
		expect(check(parse(next), env).filter(({ level }) => level === 'error')).toEqual([])
	})

	it('goes by no copies for fewer than none', () => {
		expect(of(`(path.repeatAlong ${LINE} ${STAMP} 0)`).curves).toHaveLength(0)
	})

	it('shows what it goes along and what it copies', () => {
		const held = grip(`(path.repeatAlong ${LINE} ${STAMP} 3)`)
		expect(held.sources).toHaveLength(2)
	})

	it('can have what is selected put into it', () => {
		const values = [LINE, STAMP].map(src => evaluate(parse(src), env).value)
		expect(filtersFor(values, env).map(({ name }) => name)).toContain('path.repeatAlong')
	})
})

describe('the points of a path', () => {
	const d = (data: string) => `(path.d "${data}")`
	const gripOf = (data: string) => gripAt(parse(`{c = ${d(data)}}`), env, 'binding:c')!
	const pointsOf = (data: string) => gripOf(data).handles.filter(({ vertex }) => vertex !== undefined)
	const gone = (data: string, removing: readonly string[]) => {
		const [first] = pointsOf(data)
		const [change] = first!.to(first!.at!, first!.at!, { removing })
		return change === undefined ? null : (change.value as string)
	}

	it('have the places of what is not a path beside them, for the tool that goes by them, which moves them as one', () => {
		const root = parse('{a = (path.circle [10 10] 5) b = (path.line [0 0] [20 0])}')
		const parts = gripOfPointsOrNot(gripOfRows(root, env, ['binding:a', 'binding:b']), true)!
		const places = parts.grip.handles.map((handle, i) => [parts.rowOf[i], placePartOf(handle)] as const).filter(([, place]) => place !== undefined)
		expect(places).toEqual([
			['binding:a', 'arg0'],
			['binding:b', 'arg0'],
			['binding:b', 'arg1'],
		])
		// Nothing that pulls a length or turns, which is not a place.
		expect(parts.grip.handles.every(handle => placePartOf(handle) !== undefined)).toBe(true)
		// Around the circle's center and one end of the line, with both going together.
		const boxed = withBoxOfParts(parts, [{ row: 'binding:a', parts: ['arg0'] }, { row: 'binding:b', parts: ['arg1'] }])!
		expect(boxed.around).toEqual([[10, 0], [20, 10]])
	})

	it('have their box go on being turned as they have been, and pulled along its own sides', () => {
		const root = parse('{a = (path.line [0 0] [10 10]) b = (path.circle [10 0] 5)}')
		const parts = gripOfPointsOrNot(gripOfRows(root, env, ['binding:a', 'binding:b']), true)!
		const chosen = [{ row: 'binding:a', parts: ['arg0', 'arg1'] }, { row: 'binding:b', parts: ['arg0'] }]
		const boxed = withBoxOfParts(parts, chosen, 45)!
		expect(boxed.angle).toBe(45)
		const [[left, top], [right, bottom]] = boxed.around!
		// Along the line, and across it to where the circle's center is.
		expect([left, top, right, bottom].map(n => Math.round(n * 1000) / 1000)).toEqual([0, -7.071, 14.142, 0])
		// The side across from the first point, pulled out along the line, takes the end out along it too.
		const side = boxed.grip.handles.find(
			({ across, at, corner }) => across && !corner && at !== undefined && Math.abs(at[0] - 12.5) < 1e-6 && Math.abs(at[1] - 7.5) < 1e-6
		)!
		const changes = side.to([side.at![0] + 5, side.at![1] + 5], side.at!)
		const moved = changed(root, env, 'binding:a', changes).ast!
		const [, end] = gripAt(moved, env, 'binding:a')!.handles.filter(({ place }) => typeof place === 'number').map(({ at }) => at!)
		expect(end![0]).toBeCloseTo(end![1])
		expect(end![0]).toBeGreaterThan(10)
	})

	it('are not there for the tool that goes by the whole of things, and are all there is for the one that goes by them', () => {
		const data = 'M0,0 C10,0 10,10 20,10 L30,0'
		const root = parse(`{c = (style ${d(data)} fill: "#000")}`)
		const held = gripOfRows(root, env, ['binding:c'])!
		const whole = gripOfPointsOrNot(held, false)!
		expect(whole.grip.handles).toEqual([])
		expect(whole.grip.guides).toEqual([])
		expect(whole.rowOf).toEqual([])
		const points = gripOfPointsOrNot(held, true)!
		expect(points.grip.handles.filter(({ vertex }) => vertex !== undefined)).toHaveLength(3)
		expect(points.grip.handles.filter(({ control }) => control)).toHaveLength(2)
		expect(points.grip.guides).toHaveLength(2)
		expect(points.rowOf).toHaveLength(7)
	})

	it('still has the box around it, without its points', () => {
		const root = parse(`{c = ${d('M0,0 L10,0 L10,10')}}`)
		const shapes = sceneOf(root, env)
		const boxed = withBoxHandles(gripOfPointsOrNot(gripOfRows(root, env, ['binding:c']), false), shapes, ['binding:c'])!
		expect(boxed.grip.handles.filter(({ corner }) => corner)).toHaveLength(4)
	})

	it('goes, with those either side of it joined by a line', () => {
		expect(gone('M0,0 L10,0 L10,10', ['0:1'])).toBe('M 0,0 L 10,10')
	})

	it('goes from the start or the end of what is open', () => {
		expect(gone('M0,0 L10,0 L10,10', ['0:0'])).toBe('M 10,0 L 10,10')
		expect(gone('M0,0 L10,0 L10,10', ['0:2'])).toBe('M 0,0 L 10,0')
	})

	it('goes round what is closed, from its first as from any other', () => {
		expect(gone('M0,0 L10,0 L10,10 L0,10 Z', ['0:0'])).toBe('M 10,0 L 10,10 L 0,10 Z')
		expect(gone('M0,0 L10,0 L10,10 L0,10 Z', ['0:2'])).toBe('M 0,0 L 10,0 L 0,10 Z')
	})

	it('leaves a curve going out of the one before and into the one after', () => {
		expect(gone('M0,0 C1,1 2,2 3,3 C4,4 5,5 6,6', ['0:1'])).toBe('M 0,0 C 1,1 5,5 6,6')
		expect(gone('M0,0 L3,3 C4,4 5,5 6,6', ['0:1'])).toBe('M 0,0 C 0,0 5,5 6,6')
		expect(gone('M0,0 C1,1 2,2 3,3 L6,6', ['0:1'])).toBe('M 0,0 C 1,1 6,6 6,6')
	})

	it('goes several at once, and leaves out what is left with too little to be anything', () => {
		expect(gone('M0,0 L1,0 L2,0 L3,0', ['0:1', '0:2'])).toBe('M 0,0 L 3,0')
		expect(gone('M0,0 L1,0 M5,5 L6,6 L7,7', ['0:0'])).toBe('M 5,5 L 6,6 L 7,7')
		expect(gone('M0,0 L1,0 L2,2 Z', ['0:0'])).toBe('M 1,0 L 2,2')
	})

	it('has nothing to do where that is all there is', () => {
		expect(gone('M0,0 L1,0', ['0:0'])).toBeNull()
	})

	const anchors = (data: string) => gripOf(data).handles.filter(({ vertex }) => vertex !== undefined)
	const segments = (data: string) => gripOf(data).handles.filter(({ segment }) => segment !== undefined)
	const written = (changes: readonly { value: unknown }[]) => changes[0]!.value as string

	it('go together, each by as far as it has been taken, with what controls them', () => {
		const [first] = anchors('M0,0 C1,0 2,0 3,0 L9,9')
		const moved = first!.to([10, 0], [0, 0], { moving: ['0:0', '0:1'] })
		expect(written(moved)).toBe('M 10,0 C 11,0 12,0 13,0 L 9,9')
	})

	it('has a segment between each of them, under them, going round what is closed', () => {
		expect(segments('M0,0 L1,0 L1,1').map(({ segment }) => segment)).toEqual(['segment 0:1', 'segment 0:2'])
		expect(segments('M0,0 L1,0 L1,1 Z').map(({ segment }) => segment)).toEqual(['segment 0:0', 'segment 0:1', 'segment 0:2'])
		const root = parse(`{c = ${d('M0,0 L1,0')}}`)
		const { handles } = gripOfPointsOrNot(gripOfRows(root, env, ['binding:c']), true)!.grip
		expect(handles.findIndex(({ segment }) => segment)).toBeLessThan(handles.findIndex(({ vertex }) => vertex))
	})

	it('moves both ends of a straight segment', () => {
		const [segment] = segments('M0,0 L10,0 L10,10')
		expect(written(segment!.to([5, 7], [5, 0]))).toBe('M 0,7 L 10,7 L 10,10')
	})

	it('moves the ends of the segment that closes it', () => {
		const [closing] = segments('M0,0 L10,0 L10,10 Z')
		expect(written(closing!.to([5, 7], [5, 5]))).toBe('M 0,2 L 10,0 L 10,12 Z')
	})

	it('bends a curved segment, where it was taken going to where it is pulled and its ends staying', () => {
		const data = 'M0,0 C0,10 10,10 10,0'
		const [segment] = segments(data)
		// Its middle is at [5 7.5].
		const value = written(segment!.to([5, 17.5], [5, 7.5]))
		expect(value.startsWith('M 0,0 C ')).toBe(true)
		expect(value.endsWith(' 10,0')).toBe(true)
		const [[, , , bottom]] = [bounds(fromD(value)).flat()]
		expect(bottom).toBeCloseTo(17.5, 1)
	})

	it('goes as a segment, leaving apart what it was between', () => {
		expect(gone('M0,0 L1,0 L2,0 L3,0', ['segment 0:2'])).toBe('M 0,0 L 1,0 M 2,0 L 3,0')
		expect(gone('M0,0 L1,0 L2,0', ['segment 0:1'])).toBe('M 1,0 L 2,0')
	})

	it('opens what is closed, from the segment that went', () => {
		expect(gone('M0,0 L1,0 L1,1 Z', ['segment 0:1'])).toBe('M 1,0 L 1,1 L 0,0')
		expect(gone('M0,0 L1,0 L1,1 Z', ['segment 0:0'])).toBe('M 0,0 L 1,0 L 1,1')
	})

	it('are found by where they are on the canvas, for each row, along with the places of what is not a path', () => {
		const root = parse(`{a = ${d('M0,0 L10,0 L10,10')} b = ${d('M100,100 L105,105')} c = (path.rect [0 0] [5 5])}`)
		// The rectangle's corner is a place, its origin, and is gone round like a point, and so are
		// its other corners, which are worked out from it, by their names.
		expect(pointsWithin(root, env, ['binding:a', 'binding:b', 'binding:c'], [-1, -1], [10, 5])).toEqual([
			{ row: 'binding:a', points: ['0:0', '0:1'] },
			{ row: 'binding:c', points: ['arg0', '@top right', '@bottom left', '@bottom right'] },
		])
		expect(pointsWithin(root, env, ['binding:c'], [1, 1], [10, 10])).toEqual([{ row: 'binding:c', points: ['@bottom right'] }])
		expect(pointsWithin(root, env, ['binding:a', 'binding:b'], [110, 110], [8, 8])).toEqual([
			{ row: 'binding:a', points: ['0:2'] },
			{ row: 'binding:b', points: ['0:0', '0:1'] },
		])
	})

	describe('in a box', () => {
		const held = (data: string, parts: readonly string[]) => {
			const root = parse(`{c = ${d(data)}}`)
			return { root, ...withBoxOfParts(gripOfPointsOrNot(gripOfRows(root, env, ['binding:c']), true), [{ row: 'binding:c', parts }])! }
		}
		const SQUARE = 'M0,0 C0,-5 10,-5 10,0 L10,10 L0,10 Z'

		it('goes around those chosen, by where they are, and not what controls them', () => {
			expect(held(SQUARE, ['0:0', '0:1']).around).toEqual([[0, 0], [10, 0]])
			expect(held(SQUARE, ['segment 0:2']).around).toEqual([[10, 0], [10, 10]])
		})

		it('has nothing around only one place', () => {
			const { around, grip } = held(SQUARE, ['0:1'])
			expect(around).toBeNull()
			expect(grip.handles.some(({ corner }) => corner)).toBe(false)
		})

		it('scales those chosen and what controls them, and leaves the rest', () => {
			const { grip } = held(SQUARE, ['0:0', '0:1'])
			const side = grip.handles.find(({ name, at }) => name === 'box' && at![0] === 10 && at![1] === 0)!
			expect(side.to([20, 0], side.at!)[0]!.value).toBe('M 0,0 C 0,-5 20,-5 20,0 L 10,10 L 0,10 Z')
		})

		it('turns those chosen around its middle', () => {
			const { grip } = held('M0,0 L10,0 L5,5', ['0:0', '0:1'])
			const turner = grip.handles.find(({ outsideCorner }) => outsideCorner)!
			const value = turner.to([turner.pivot![0], turner.pivot![1] + 10], turner.at!)[0]!.value as string
			expect(value.endsWith('L 5,5')).toBe(true)
			expect(value).not.toBe('M 0,0 L 10,0 L 5,5')
		})
	})

	describe('by their numbers', () => {
		const SRC = `{a = ${d('M0,0 L10,0 L10,20')} b = ${d('M100,100 L110,100')}}`
		const root = parse(SRC)
		const dOf = (ast: AST | null, name: string) => print(bound((ast as LetAST)).find(([bound]) => bound === name)![1])

		it('are of the box around some of them', () => {
			const parts = [{ row: 'binding:a', parts: ['0:0', '0:1'] }]
			expect(boxMeasured(root, env, { parts })).toEqual([[0, 0], [10, 0]])
			expect(hasSizeMeasured(root, env, { parts })).toBe(true)
			expect(dOf(withBoxMeasured(root, env, { parts }, [5, 7, 20, 0]), 'a')).toBe('(path.d "M 5,7 L 25,7 L 10,20")')
		})

		it('are only where it is, of one', () => {
			const parts = [{ row: 'binding:a', parts: ['0:1'] }]
			expect(hasSizeMeasured(root, env, { parts })).toBe(false)
			expect(dOf(withBoxMeasured(root, env, { parts }, [3, 4, 0, 0]), 'a')).toBe('(path.d "M 0,0 L 3,4 L 10,20")')
		})

		it('go across rows', () => {
			const parts = [{ row: 'binding:a', parts: ['0:0'] }, { row: 'binding:b', parts: ['0:1'] }]
			const next = withBoxMeasured(root, env, { parts }, [10, 10, 220, 200])
			expect(dOf(next, 'a')).toBe('(path.d "M 10,10 L 10,0 L 10,20")')
			expect(dOf(next, 'b')).toBe('(path.d "M 100,100 L 230,210")')
		})

		it('are of what a whole row comes to, scaled and moved', () => {
			const rows = ['binding:a']
			expect(boxMeasured(root, env, { rows })).toEqual([[0, 0], [10, 20]])
			expect(hasSizeMeasured(root, env, { rows })).toBe(true)
			expect(dOf(withBoxMeasured(root, env, { rows }, [1, 2, 20, 40]), 'a')).toBe('(path.d "M 1,2 L 21,2 L 21,42")')
		})

		it('are only those that a drag has changed', () => {
			const box = [[0, 0], [10, 20]] as const
			expect(numbersDifferent(box, [[5, 0], [15, 20]])).toEqual([0])
			expect(numbersDifferent(box, [[0, 5], [10, 25]])).toEqual([1])
			expect(numbersDifferent(box, [[5, 5], [15, 25]])).toEqual([0, 1])
			expect(numbersDifferent(box, [[0, 0], [30, 20]])).toEqual([2])
			expect(numbersDifferent(box, [[-5, 0], [10, 20]])).toEqual([0, 2])
			expect(numbersDifferent(box, box)).toEqual([])
		})

		it('say what stayed where it was, when a side is pulled', () => {
			const box = [[0, 0], [10, 20]] as const
			expect(whatStayed(box, [[0, 0], [30, 20]])).toEqual([0, 0])
			expect(whatStayed(box, [[-5, 0], [10, 20]])).toEqual([1, 0])
			expect(whatStayed(box, [[0, -5], [10, 20]])).toEqual([0, 1])
			expect(whatStayed(box, [[-5, 0], [15, 20]])).toEqual([0.5, 0])
		})

		it('put a corner where it is said, the one across from it staying', () => {
			const box = [[0, 0], [10, 20]] as const
			expect(boxWithCornerAt(box, [1, 1], [0, 0], [30, 40])).toEqual([0, 0, 30, 40])
			expect(boxWithCornerAt(box, [0, 0], [1, 1], [-5, 5])).toEqual([-5, 5, 15, 15])
			expect(boxWithCornerAt(box, [0, 1], [1, 0], [2, 8])).toEqual([2, 0, 8, 8])
			// As far as nothing, and no further.
			expect(boxWithCornerAt(box, [1, 1], [0, 0], [-3, 40])).toEqual([0, 0, 0, 40])
			// Around its middle, with OPT.
			expect(boxWithCornerAt(box, [1, 0], [0.5, 1], [15, 0])).toEqual([-5, 0, 20, 20])
		})

		it('come to what was typed, and not to all but that', () => {
			const box = parse(`{a = ${d('M500,300 L760,300 L760,560 L500,560 Z')}}`)
			const next = withBoxMeasured(box, env, { rows: ['binding:a'] }, [500, 300, 300, 260])
			expect(dOf(next, 'a')).toBe('(path.d "M 500,300 L 800,300 L 800,560 L 500,560 Z")')
		})

		it('go by what was pulled', () => {
			const box = [[0, 0], [10, 20]] as const
			expect(placeOfNumbers(box, [0, 1], [0, 0], [1, 1])).toEqual({ at: [0, 0], side: 'above' })
			expect(placeOfNumbers(box, [0, 1], [1, 0], [0, 1])).toEqual({ at: [10, 0], side: 'above' })
			expect(placeOfNumbers(box, [0, 1], [0, 1], [1, 0])).toEqual({ at: [0, 20], side: 'below' })
			expect(placeOfNumbers(box, [0, 1], [1, 1], [0, 0])).toEqual({ at: [10, 20], side: 'below' })
			expect(placeOfNumbers(box, [2], undefined, [1, 0])).toEqual({ at: [0, 10], side: 'left' })
			expect(placeOfNumbers(box, [2], undefined, [0, 0])).toEqual({ at: [10, 10], side: 'right' })
			expect(placeOfNumbers(box, [3], undefined, [0, 1])).toEqual({ at: [5, 0], side: 'above' })
			expect(placeOfNumbers(box, [3], undefined, [0, 0])).toEqual({ at: [5, 20], side: 'below' })
			expect(placeOfNumbers(box, [0, 1])).toEqual({ at: [10, 20], side: 'corner' })
		})

		it('are of several rows together', () => {
			const rows = ['binding:a', 'binding:b']
			const next = withBoxMeasured(root, env, { rows }, [0, 0, 55, 50])
			expect(dOf(next, 'b')).toBe('(path.d "M 50,50 L 55,50")')
		})
	})

	it('still moves by a point, and takes what controls it along', () => {
		const [, second] = pointsOf('M0,0 C1,0 2,0 3,0')
		expect(second!.to([3, 10], second!.at!)[0]!.value).toBe('M 0,0 C 1,0 2,10 3,10')
	})
})

describe('a path closed', () => {
	it('goes back from its last point to its first, and moves as what it closes does', () => {
		const root = parse('{c = (path.close (path.polyline [0 0] [10 0] [10 10]))}')
		const { value } = evaluate(parse('(path.close (path.polyline [0 0] [10 0] [10 10]))'), env)
		expect(toD((value as PathValue).path)).toBe('M 0,0 L 10,0 L 10,10 Z')
		// What it closes is shown as it was, and gone into to be changed, as with any filter of a path.
		const grip = gripAt(root, env, 'binding:c')!
		expect(grip.sources).toHaveLength(1)
		expect(print(changed(root, env, 'binding:c', grip.move!([5, 5])).ast!)).toContain('(path.close (path.polyline [5 5] [15 5] [15 15]))')
	})

	it('leaves what is closed as it is', () => {
		const { value } = evaluate(parse('(path.close (path.rect [0 0] [10 10]))'), env)
		expect(toD((value as PathValue).path)).toBe(toD((evaluate(parse('(path.rect [0 0] [10 10])'), env).value as PathValue).path))
	})
})

describe('pasted onto an input of a type of the canvas', () => {
	const root = parse(`{
		shape = (style (path.circle [3 4] 10) fill: "red")
		other = (path.mirror (path.rect [0 0] [1 1]) [[1 2] [0 1]])
		m = (path.mirror (path.d "") [[0 0] [1 0]])
	}`)
	const pasted = (from: string, to: string) =>
		print(pastedArguments(root, env, [to], copiedRows(root, env, [from]))!)

	it('is the path of a shape, for a path', () => {
		expect(pasted('binding:shape', 'binding:m/arg0')).toContain('m = (path.mirror (path.circle [3 4] 10) [[0 0] [1 0]])')
	})

	it('is the line or the point in it, for a line or a point', () => {
		expect(pasted('binding:other', 'binding:m/arg1')).toContain('m = (path.mirror (path.d "") [[1 2] [0 1]])')
		expect(pasted('binding:shape', 'binding:other/arg0/arg0')).toContain('other = (path.mirror (path.rect [3 4] [1 1])')
	})
})

describe('a matrix', () => {
	it('starts as one that does nothing, written as how it is easiest to change one', () => {
		const root = parse('{a = (path.transform (path.circle [0 0] 10))}')
		const a = reach(root, env, 'binding:a')!.chain.at(-1)!
		const missing = viewOf(a.ast, a.env).missing.find(m => m.parameter === 'by')!
		expect(print(defaultFor(missing.expected, a.env))).toBe('(mat2d.trs [0 0])')
	})

	it('has its numbers named as SVG names them', () => {
		const root = parse('{a = (path.transform (path.circle [0 0] 10) [1 0 0 1 5 6])}')
		const by = reach(root, env, 'binding:a/arg1')!.chain.at(-1)!
		expect(viewOf(by.ast, by.env, by.expected).slots.map(s => s.label)).toEqual(['a', 'b', 'c', 'd', 'tx', 'ty'])
	})

	it('cast as one, is its six numbers, and no more can be added', () => {
		const root = parse('{m = ^mat2d [1 0 0 1 0 0]}')
		const inside = reach(root, env, 'binding:m/arg0')!.chain.at(-1)!
		const view = viewOf(inside.ast, inside.env, inside.expected)
		expect(view.slots.map(s => s.label)).toEqual(['a', 'b', 'c', 'd', 'tx', 'ty'])
		expect(view.append).toBeNull()
		expect(reach(root, env, 'binding:m/arg0/4')!.chain.at(-1)!.label).toBe('tx')
	})
})

describe('a square stepped to a rect', () => {
	const about = (wrapped: (call: string) => string) =>
		`{main = [a = ${wrapped('(path.square [(- /main/x/origin:/0 (/ ../../../size: 2)) (- /main/x/origin:/1 (/ ../../../size: 2))] 120)')} x = (axes @[10 20])]}`

	it.each([
		['by itself', (call: string) => call],
		['in a style', (call: string) => `(style ${call} fill: "#000000")`],
	])('goes on being about its middle, %s, by what it was written to go by', (_, wrapped) => {
		const root = parse(about(wrapped))
		const next = withSlotCommand(root, env, ['binding:a'], 'step')!
		expect(print(next)).toContain('(path.rect [(- /main/x/origin:/0 (/ ../../../size:/0 2)) (- /main/x/origin:/1 (/ ../../../size:/1 2))] [120 120])')
		const [was, now] = [evaluate(root, env), evaluate(next, env)]
		expect(now.diagnostics).toEqual([])
		expect(JSON.stringify(now.value)).toBe(JSON.stringify(was.value))
	})
})

describe('what a type is, said where a value of it is inspected', () => {
	const about = (row: string) => {
		const root = parse('{r = (path.rect [0 0] [10 10]) t = (path.transform (path.circle [0 0] 3) [1 0 0 1 0 0])}')
		const slot = reach(root, env, row)!.chain.at(-1)!
		return aboutType(slot.expected, slot.env)
	}

	it('is what it is called, what it is, and its icon', () => {
		const point = about('binding:r/arg0')!
		expect(point.label).toBe('Point')
		expect(point.doc).toMatch(/place on the canvas/)
		expect(point.icon).toBeTruthy()
	})

	it('is said of each type of the canvas a value is wanted as', () => {
		expect(about('binding:r/arg1')).toMatchObject({ label: 'Size', icon: 'ph:frame-corners' })
		expect(about('binding:t/arg1')).toMatchObject({ label: 'Matrix', icon: 'tabler:matrix' })
		expect(about('binding:t/arg1')!.doc).toMatch(/where the origin goes/)
	})
})

describe('a path trimmed', () => {
	const LINE = '(path.line [0 0] [100 0])'
	const lengthOf = (src: string) => {
		const [[left], [right]] = bounds((evaluate(parse(src), env).value as PathValue).path)
		return right - left
	}

	it('is the part of it from start to end of the way along it, all of it with neither said', () => {
		expect(lengthOf(`(path.trim ${LINE} 0.25 0.75)`)).toBeCloseTo(50)
		expect(lengthOf(`(path.trim ${LINE})`)).toBeCloseTo(100)
		expect(lengthOf(`(path.trim ${LINE} end: 0.1)`)).toBeCloseTo(10)
	})

	it('has its start and end shown as percentages, from 0 to 1', () => {
		const [, start, end] = viewOf(parse(`(path.trim ${LINE} 0.25 0.75)`), env).slots
		expect(numberOptionsAt(start!)).toMatchObject({ min: 0, max: 1, suffix: '%' })
		expect(numberOptionsAt(end!)).toMatchObject({ min: 0, max: 1, suffix: '%' })
	})

	it('has its start and end taken along the path, as far along as where they are let go', () => {
		const held = grip(`(path.trim ${LINE} 0.25 0.75)`)
		const [start, end] = held.handles
		expect(start!.at![0]).toBeCloseTo(25)
		expect(end!.at![0]).toBeCloseTo(75)
		const [change] = end!.to([40, 30], end!.at!)
		expect(change!.route).toEqual([2])
		expect(change!.value as number).toBeCloseTo(0.4)
	})
})

describe('a rect, where a path is wanted', () => {
	it('is taken as its outline, by what takes a path', () => {
		const offset = evaluate(parse('(path.offset (rect [0 0] [10 10]) 5)'), env)
		expect(offset.diagnostics).toEqual([])
		expect(bounds((offset.value as PathValue).path)).toEqual([[-5, -5], [15, 15]])
		expect(lengthOf('(path.trim (rect [0 0] [100 100]) 0 0.25)')).toBeCloseTo(100)
	})

	it('fits a path when the program is checked, and stays a rect as one', () => {
		const rect = evaluate(parse('rect'), env).value as TypeValue
		const path = evaluate(parse('path'), env).value as TypeValue
		expect(typeFits(rect, path)).toBe(true)
		expect(typeFits(path, rect)).toBe(false)
		const cast = evaluate(parse('^path (rect [0 0] [10 10])'), env)
		expect(cast.diagnostics).toEqual([])
		expect(isRect(cast.value)).toBe(true)
	})

	function lengthOf(src: string): number {
		const [[left], [right]] = bounds((evaluate(parse(src), env).value as PathValue).path)
		return right - left
	}
})

describe('a range', () => {
	it('is a type a program can say, from 0 to 1 until it is said', () => {
		expect(evaluate(parse('^range [0.2 0.6]'), env).value).toEqual([0.2, 0.6])
		expect((evaluate(parse('range'), env).value as TypeValue).default).toEqual([0, 1])
	})

	it('goes into what takes its two numbers, spread', () => {
		const spread = evaluate(parse('{r = ^range [0.25 0.75] (path.trim (path.line [0 0] [100 0]) ...r)}'), env)
		expect(spread.diagnostics).toEqual([])
		const [[left], [right]] = bounds((spread.value as PathValue).path)
		expect(right - left).toBeCloseTo(50)
	})
})

describe('a type that is called', () => {
	it('has each of its parts wanted as what its constructor takes, as a rect has a point and a size', () => {
		const root = parse('{a = (artboard (rect [-4 -2] [773 648]) [])}')
		const area = reach(root, env, 'binding:a/arg0')!.chain.at(-1)!
		const [origin, size] = viewOf(area.ast, area.env, area.expected).slots
		expect(aboutType(origin!.expected, origin!.env)?.label).toBe('Point')
		expect(aboutType(size!.expected, size!.env)?.label).toBe('Size')
		expect(isTranslatable(origin!.expected)).toBe(true)
	})
})

describe('the handles of a wave', () => {
	const src = '{c = (path.wave (path.line [0 0] [100 0]) 5 40)}'
	const root = parse(src)
	const handles = gripAt(root, env, 'binding:c')!.handles
	const named = (name: string) => handles.find(handle => handle.name === name)!
	const pulled = (name: string, to: Vec) => print(changed(root, env, 'binding:c', named(name).to(to, named(name).at!)).ast!)

	it('are where it is measured from, its first crest, and a wavelength along', () => {
		expect(handles.find(({ place }) => place === 5)!.at).toEqual([0, 0])
		const crest = named('crest').at!
		expect(crest[0]).toBeCloseTo(10)
		expect(crest[1]).toBeCloseTo(5)
		expect(named('wavelength').at![0]).toBeCloseTo(40)
	})

	it('have its crest pulled across be how far it goes, and along be its phase', () => {
		expect(pulled('crest', [10, 8])).toContain('(path.wave (path.line [0 0] [100 0]) 8 40)')
		expect(pulled('crest', [20, 5])).toContain('(path.wave (path.line [0 0] [100 0]) 5 40 -90)')
	})

	it('have a wave as long, and going the way, as the handle is from where it is measured', () => {
		expect(pulled('wavelength', [0, 60])).toContain('(path.wave (path.line [0 0] [100 0]) 5 60 angle: 90)')
	})
})

describe('what turns a circle', () => {
	const turners = (src: string) => {
		const root = parse(`{c = ${src}}`)
		const boxed = withBoxHandles(gripOfRows(root, env, ['binding:c']), sceneOf(root, env), ['binding:c'])!
		return boxed.grip.handles.filter(({ outsideCorner }) => outsideCorner).length
	}

	it('is there where it goes through places, which turning it turns', () => {
		expect(turners('(path.circleFromDiameter [0 0] [10 0])')).toBe(4)
		expect(turners('(path.circleThrough [0 0] [10 0] [5 5])')).toBe(4)
	})

	it('is not there for one around its center, which would come to the same', () => {
		expect(turners('(path.circle [0 0] 5)')).toBe(0)
	})
})
