import {
	buildPrelude,
	type Env,
	evaluate,
	expandLadder,
	type LetAST,
	parse,
	print,
	solve,
	toAst,
} from '@glisp/lang'
import {
	extractedAt,
	inspectRows,
	isMixed,
	merged,
	withValuesAt,
} from '@glisp/tweeq/multiRows'
import { capitalCase, enumIconsOf, inspectionOf, isSizeInput, isTranslatable, titleOf, viewOf } from '@glisp/tweeq/structure'
import { describe, expect, it } from 'vitest'

import {
	iconOfPath,
	isPath,
	LINE_CAPS,
	LINE_JOINS,
	lineCapType,
	lineJoinType,
	PathValue,
	type Vec,
	withGraphics,
	NO_PAINT,
	type Paint,
} from './graphics'
import {
	type Anchor,
	changed,
	dOfAnchors,
	dragStep,
	drawn,
	drawnFrom,
	gripAt,
	hasInside,
	type Shape,
	linked,
	nameFor,
	nearestSnap,
	paintedRow,
	penned,
	readoutOf,
	roundedChanges,
	roundedTo,
	rowsChanged,
	rowsWithin,
	sceneOf,
	snapPointsOf,
	withPaint,
} from './scene'

const env: Env = withGraphics(buildPrelude())
const scene = (src: string) =>
	sceneOf(parse(src), env).map(({ row, draw }) => `${row} ${draw}`)

describe('path', () => {
	it('makes paths that a type can tell', () => {
		expect(isPath(evaluate(parse('(path.circle [0 0] 10)'), env).value)).toBe(true)
		expect(evaluate(parse('(: 1 path)'), env).value).toEqual(new PathValue({ curves: [] } as never))
	})

	it('is a type that functions come with', () => {
		const { value } = evaluate(
			parse('{f = (=> (p: path): path p) (f (path.circle [0 0] 1))}'),
			env
		)
		expect(isPath(value)).toBe(true)
	})
})

describe('iconOfPath', () => {
	const icon = (src: string) => iconOfPath(evaluate(parse(src), env).value)

	it('is the shape itself, centered, whatever its size', () => {
		const small = icon('(path.rect [0 0] [10 10])')
		expect(small).toMatch(/^stroke:M/)
		expect(icon('(path.rect [100 100] [800 800])')).toBe(small)
	})

	it('keeps the proportions', () => {
		const coords = icon('(path.rect [0 0] [100 50])')!.match(/-?[\d.]+/g)!.map(Number)
		const ys = coords.filter((_, i) => i % 2 === 1)
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(9)
	})

	it('is nothing for what is not a path, or has no size', () => {
		expect(iconOfPath(1)).toBeNull()
		expect(icon('(: 1 path)')).toBeNull()
	})
})

describe('sceneOf', () => {
	it('has what comes to something to draw, and no more', () => {
		expect(scene('{r = 10 c = (path.circle [0 0] r) s = [1 2]}')).toEqual(['binding:c path'])
	})

	it('goes by the type, as not every vec2 is a point', () => {
		expect(scene('{a = (: [1 2] point) b = (: [1 2] vec2)}')).toEqual(['binding:a point'])
	})

	it('goes through a name, and into a vector', () => {
		expect(scene('{c = (path.circle [0 0] 1) d = c}')).toEqual(['binding:c path', 'binding:d path'])
		expect(scene('{v = [(path.circle [0 0] 1) (path.circle [1 1] 1)]}')).toEqual([
			'binding:v path',
			'binding:v path',
		])
	})

	it('goes into a group, and not past a Return', () => {
		expect(scene('{g = {c = (path.circle [0 0] 1)}}')).toEqual(['binding:g/binding:c path'])
		expect(scene('{g = {c = (path.circle [0 0] 1) d = (path.circle [1 1] 1) d}}')).toEqual([
			'binding:g path',
		])
	})

	it('has a path that has been evaluated in place', () => {
		const value = evaluate(parse('(path.rect [0 0] [10 10])'), env).value
		expect(scene(`{c = ${print(toAst(value, env))}}`)).toEqual(['binding:c path'])
	})

	it('leaves out what is bypassed, which can still be referred to', () => {
		expect(scene('{c = #_(path.circle [0 0] 1) d = c}')).toEqual(['binding:d path'])
	})
})

describe('the ladder', () => {
	const ladder = (src: string) => expandLadder(parse(src), env).map(print)

	it('goes from a circle to an ellipse', () => {
		expect(ladder('(path.circle [0 0] 10)')).toEqual([
			'(path.circle [0 0] 10)',
			'(path.ellipse [0 0] [10 10])',
		])
	})

	it('keeps what was written, on the way', () => {
		expect(ladder('(path.circle [0 0] (+ 1 2))')[1]).toBe('(path.ellipse [0 0] [(+ 1 2) (+ 1 2)])')
	})

	it('goes from a rect to its corners', () => {
		expect(ladder('(path.rect [5 5] [10 20])')).toEqual([
			'(path.rect [5 5] [10 20])',
			'(path.polygon [5 5] [15 5] [15 25] [5 25])',
		])
	})

	it('goes from a line to a polyline', () => {
		expect(ladder('(path.line [0 0] [1 1])')).toEqual([
			'(path.line [0 0] [1 1])',
			'(path.polyline [0 0] [1 1])',
		])
	})

	it('goes from an ngon to its vertices', () => {
		expect(ladder('(path.ngon [0 0] 10 4)')[1]).toMatch(/^\(path\.polygon \[10 0\]/)
	})

	it('comes to the same shape on every rung', () => {
		for (const src of ['(path.rect [0 0] [10 20])', '(path.line [0 0] [1 1])']) {
			const [first, second] = expandLadder(parse(src), env)
			expect(iconOfPath(evaluate(second!, env).value)).toBe(iconOfPath(evaluate(first!, env).value))
		}
	})
})

describe('drawing a shape', () => {
	const root = parse('{a = 1}') as LetAST
	const shape = (tool: 'rect' | 'ellipse', to: Vec, even = false) =>
		print(drawn(root, 'x', tool, [10, 10], to, even))

	it('adds a rect from corner to corner', () => {
		expect(shape('rect', [30.126, 50])).toBe('{a = 1 x = (path.rect [10 10] [20.13 40])}')
		expect(shape('rect', [0, 0])).toBe('{a = 1 x = (path.rect [0 0] [10 10])}')
	})

	it('adds an ellipse within those corners', () => {
		expect(shape('ellipse', [30, 50])).toBe('{a = 1 x = (path.ellipse [20 30] [10 20])}')
		expect(shape('ellipse', [-10, -10])).toBe('{a = 1 x = (path.ellipse [0 0] [10 10])}')
	})

	it('adds a polygon out from where it was pressed', () => {
		expect(shape('ngon', [13, 14])).toBe('{a = 1 x = (path.ngon [10 10] 5 5 53.13)}')
		expect(nameFor(root, 'ngon', false)).toBe('ngon1')
	})

	it('is even when asked to, as far as the longer side goes', () => {
		expect(shape('rect', [30, 50], true)).toBe('{a = 1 x = (path.square [10 10] 40)}')
		expect(shape('rect', [-30, 20], true)).toBe('{a = 1 x = (path.square [-30 10] 40)}')
		expect(shape('ellipse', [30, 50], true)).toBe('{a = 1 x = (path.circle [30 30] 20)}')
	})

	it('is named for what it is, and nothing already there', () => {
		expect(nameFor(root, 'rect', false)).toBe('rect1')
		expect(nameFor(parse('{rect1 = 1 rect2 = 2}') as LetAST, 'rect', false)).toBe('rect3')
		expect(nameFor(root, 'ellipse', false)).toBe('ellipse1')
	})

	it('is a circle when an ellipse is even, and counts those on their own', () => {
		expect(nameFor(root, 'ellipse', true)).toBe('circle1')
		expect(nameFor(parse('{ellipse1 = 1 circle1 = 2}') as LetAST, 'ellipse', true)).toBe('circle2')
		expect(nameFor(root, 'rect', true)).toBe('square1')
		expect(nameFor(root, 'rect', false)).toBe('rect1')
	})
})

describe('the pen', () => {
	it('goes straight from where it was only clicked', () => {
		expect(dOfAnchors([{ at: [0, 0] }, { at: [10, 0] }], false)).toBe('M 0,0 L 10,0')
	})

	it('curves where it was pulled, the same both ways', () => {
		expect(dOfAnchors([{ at: [0, 0], out: [5, 0] }, { at: [10, 10] }], false)).toBe(
			'M 0,0 C 5,0 10,10 10,10'
		)
		expect(dOfAnchors([{ at: [0, 0] }, { at: [10, 10], out: [15, 10] }], false)).toBe(
			'M 0,0 C 0,0 5,10 10,10'
		)
	})

	it('closes back to where it started', () => {
		expect(dOfAnchors([{ at: [0, 0] }, { at: [10, 0] }, { at: [10, 10] }], true)).toBe(
			'M 0,0 L 10,0 L 10,10 L 0,0 Z'
		)
	})

	describe('comes to what it can be said to be', () => {
		const root = parse('{a = 1}') as LetAST
		const clicks = (...points: Vec[]): Anchor[] => points.map(at => ({ at }))
		const drawn_ = (anchors: Anchor[], closed = false) => {
			const { ast, name } = penned(root, env, anchors, closed)
			return `${name} = ${print(ast.bindings.at(-1)![1])}`
		}

		it('two clicks are a line', () => {
			expect(drawn_(clicks([0, 0], [1, 1]))).toBe('line1 = (path.line [0 0] [1 1])')
		})

		it('more are a polyline', () => {
			expect(drawn_(clicks([0, 0], [1, 1], [2, 0]))).toBe('polyline1 = (path.polyline [0 0] [1 1] [2 0])')
		})

		it('closed, a polygon', () => {
			expect(drawn_(clicks([0, 0], [1, 1], [2, 0]), true)).toBe('polygon1 = (path.polygon [0 0] [1 1] [2 0])')
		})

		it('one pull, between two places, a curve', () => {
			expect(drawn_([{ at: [0, 0], out: [5, 0] }, { at: [10, 10] }])).toBe(
				'cubic1 = (path.cubic [0 0] [5 0] [10 10] [10 10])'
			)
			expect(drawn_([{ at: [0, 0] }, { at: [10, 10], out: [15, 10] }])).toBe(
				'cubic1 = (path.cubic [0 0] [0 0] [5 10] [10 10])'
			)
		})

		it('anything more, a path', () => {
			expect(drawn_([{ at: [0, 0], out: [5, 0] }, { at: [10, 10] }, { at: [20, 0] }])).toBe(
				'path1 = (path.d "M 0,0 C 5,0 10,10 10,10 L 20,0")'
			)
			expect(drawn_(clicks([0, 0], [1, 1]), true)).toBe('path1 = (path.d "M 0,0 L 1,1 L 0,0 Z")')
		})

		it('counts each kind on its own', () => {
			const taken = parse('{line1 = 1 polyline1 = 2}') as LetAST
			expect(penned(taken, env, clicks([0, 0], [1, 1]), false).name).toBe('line2')
		})

		it('can be taken hold of as what it is', () => {
			const { ast, name } = penned(root, env, clicks([0, 0], [1, 1], [2, 0]), false)
			expect(sceneOf(ast, env).map(s => s.row)).toEqual([`binding:${name}`])
			expect(gripAt(ast, env, `binding:${name}`)!.handles).toHaveLength(3)
		})

		it('refers to what a place was put down on', () => {
			const circle = parse('{c = (path.circle [100 100] 10)}') as LetAST
			const center = nearestSnap(snapPointsOf(circle, env, sceneOf(circle, env)), [100, 100], 1)!
			const { ast } = penned(circle, env, [{ at: [100, 100], snap: center }, { at: [0, 0] }], false)
			expect(print(ast.bindings.at(-1)![1])).toBe('(path.line ../c/center [0 0])')
			const curve = penned(
				circle,
				env,
				[{ at: [0, 0], out: [1, 0] }, { at: [100, 100], snap: center }],
				false
			)
			expect(print(curve.ast.bindings.at(-1)![1])).toContain('[100 100] ../c/center)')
		})

		it('has only the value, as a path has no place to refer from', () => {
			const circle = parse('{c = (path.circle [100 100] 10)}') as LetAST
			const center = nearestSnap(snapPointsOf(circle, env, sceneOf(circle, env)), [100, 100], 1)!
			const { ast } = penned(circle, env, [{ at: [100, 100], snap: center, out: [1, 1] }, { at: [0, 0] }, { at: [5, 5] }], false)
			expect(print(ast.bindings.at(-1)![1])).toMatch(/^\(path\.d "M 100,100/)
		})
	})
})

describe('what a vector is made of', () => {
	const elements = (src: string, arg: number) => {
		const inside = viewOf(parse(src), env).slots[arg]!
		return viewOf(inside.ast, inside.env, inside.expected).slots.map(s => [
			s.label,
			s.numberOptions,
		])
	}

	it('says X and Y, for a point', () => {
		expect(elements('(path.circle [1 2] 3)', 0)).toEqual([
			['X', { leftIcon: 'char:X' }],
			['Y', { leftIcon: 'char:Y' }],
		])
	})

	it('has arrows, for a size', () => {
		expect(elements('(path.rect [0 0] [1 2])', 1)).toEqual([
			['Width', { min: 0, leftIcon: 'ph:arrows-horizontal' }],
			['Height', { min: 0, leftIcon: 'ph:arrows-vertical' }],
		])
	})

	it('has a pad to take a point by, and not a size', () => {
		const [center] = viewOf(parse('(path.circle [1 2] 3)'), env).slots
		const [, rectSize] = viewOf(parse('(path.rect [0 0] [1 2])'), env).slots
		expect(isTranslatable(center!.expected)).toBe(true)
		expect(isTranslatable(rectSize!.expected)).toBe(false)
	})

	it('has a chain for a size, and not for a point', () => {
		const [origin, rectSize] = viewOf(parse('(path.rect [0 0] [1 2])'), env).slots
		expect(isSizeInput(rectSize!.expected)).toBe(true)
		expect(isSizeInput(origin!.expected)).toBe(false)
	})
})

describe('what a row is called, to read', () => {
	const slots = (src: string) => viewOf(parse(src), env).slots

	it('is a name as words', () => {
		expect(capitalCase('topLeft')).toBe('Top Left')
		expect(capitalCase('control1')).toBe('Control 1')
		expect(capitalCase('d')).toBe('D')
		expect(capitalCase('top-left')).toBe('Top Left')
		expect(capitalCase('X')).toBe('X')
	})

	it('is a parameter as words, keeping what code calls it', () => {
		const [origin] = slots('(path.rect [0 0] [1 1])')
		expect(titleOf(origin!)).toBe('Origin')
		expect(origin!.label).toBe('origin')
	})

	it('is the label, if it was given one', () => {
		const inner = (src: string) => {
			const [, call] = slots(src)
			return viewOf(call!.ast, call!.env).slots.map(titleOf)
		}
		expect(inner('{f = (=> (r: ^{label: "dB level"} number): number r) y = (f 1)}')).toEqual(['dB level'])
	})

	it('is what is bound, as it is', () => {
		expect(slots('{topLeft = 1}').map(titleOf)).toEqual(['topLeft'])
	})
})

describe('what heads an inspector', () => {
	const root = parse('{r = (path.rect [0 0] [1 1]) n = 1}')

	it('is its name, and the function it is a call of', () => {
		expect(inspectionOf(root, env, 'binding:r')).toEqual({ name: 'r', fn: 'Rectangle', outer: null })
		expect(inspectionOf(root, env, 'binding:n')).toEqual({ name: 'n', fn: null, outer: null })
	})

	it('goes out to what holds it', () => {
		expect(inspectionOf(root, env, 'binding:r/arg1')).toMatchObject({ name: 'Size', outer: 'binding:r' })
	})

	it('is nothing for a row no longer there', () => {
		expect(inspectionOf(root, env, 'binding:gone')).toBeNull()
	})
})

describe('several rows at once', () => {
	const rows = ['binding:a', 'binding:b']
	const root = parse('{a = (path.rect [0 0] [10 20]) b = (path.rect [5 5] [30 20])}')
	const inspected = inspectRows(root, env, rows)!
	const field = (arg: number, element: number) => inspected.args[arg]!.fields[element]!

	it('have what they say to each argument', () => {
		expect(inspected.fn).toBe('path.rect')
		expect(inspected.label).toBe('Rectangle')
		expect(inspected.args.map(a => a.label)).toEqual(['Origin', 'Size'])
		expect(field(1, 0).values).toEqual([10, 30])
		expect(field(1, 0).label).toBe('Width')
		expect(field(1, 0).options).toEqual({ min: 0, leftIcon: 'ph:arrows-horizontal' })
		expect(isMixed(field(1, 0).values)).toBe(true)
		expect(isMixed(field(1, 1).values)).toBe(false)
	})

	it('are nothing in common unless they are calls of the same', () => {
		expect(inspectRows(parse('{a = (path.rect [0 0] [1 1]) b = (path.circle [0 0] 1)}'), env, rows)).toBeNull()
		expect(inspectRows(parse('{a = 1 b = 2}'), env, rows)).toBeNull()
	})

	it('have numbers as well as vectors', () => {
		const circles = inspectRows(parse('{a = (path.circle [0 0] 1) b = (path.circle [0 0] 2)}'), env, rows)!
		expect(circles.args[1]!.fields[0]!.values).toEqual([1, 2])
	})

	it('come to one value, however that is asked for', () => {
		expect(merged([10, 30, 20], 'first')).toBe(10)
		expect(merged([10, 30, 20], 'last')).toBe(20)
		expect(merged([10, 30, 20], 'ave')).toBe(20)
		expect(merged([10, 30, 20], 'min')).toBe(10)
		expect(merged([10, 30, 20], 'max')).toBe(30)
		expect(merged([1, 2], 'ave')).toBe(1.5)
		expect(merged([0, 0, 1], 'ave')).toBe(0.333)
	})

	it('go back to what each of them is written as', () => {
		const { ast } = withValuesAt(root, env, field(1, 0).places, [7, 8])
		expect(print(ast!)).toBe('{a = (path.rect [0 0] [7 20]) b = (path.rect [5 5] [8 20])}')
	})

	it('say why they cannot, at a pin', () => {
		const pinned = parse('{w = @10 a = (path.rect [0 0] [w 20]) b = (path.rect [5 5] [30 20])}')
		const { ast, problem } = withValuesAt(pinned, env, field(1, 0).places, [7, 8])
		expect(ast).toBeNull()
		expect(problem).toBe('pinned')
	})

	it('can have a number pulled out, that they all refer to', () => {
		const result = extractedAt(root, env, field(1, 0).places, 20, field(1, 0).name)!
		expect(print(result.ast)).toBe(
			'{width = 20 a = (path.rect [0 0] [width 20]) b = (path.rect [5 5] [width 20])}'
		)
		const pulled = inspectRows(result.ast, env, rows)!
		expect(pulled.args[1]!.fields[0]!.values).toEqual([20, 20])
	})

	it('can go on being edited as one, through what was pulled out', () => {
		const { ast: pulled } = extractedAt(root, env, field(1, 0).places, 20, field(1, 0).name)!
		const again = inspectRows(pulled, env, rows)!.args[1]!.fields[0]!
		const { ast } = withValuesAt(pulled, env, again.places, [50, 50])
		expect(print(ast!)).toContain('width = 50')
	})

	it('give what is pulled out a name of its own, ahead of the first of them', () => {
		const taken = parse('{width = 1 a = (path.rect [0 0] [10 20]) b = (path.rect [5 5] [30 20])}')
		const result = extractedAt(taken, env, inspectRows(taken, env, rows)!.args[1]!.fields[0]!.places, 20, 'width')!
		expect(result.name).toBe('width2')
		expect(print(result.ast)).toMatch(/^\{width = 1 width2 = 20 a =/)
	})
})

describe('snapping', () => {
	const root = parse('{c = (path.circle [100 100] 10) r = (path.rect [0 0] [10 10])}') as LetAST
	const points = snapPointsOf(root, env, sceneOf(root, env))

	it('has the places of what is drawn, and what says where they are', () => {
		const has = (point: object) => expect(points).toContainEqual(expect.objectContaining(point))
		has({ at: [100, 100], target: 'binding:c/arg0' })
		has({ at: [110, 100], target: null })
		has({ at: [0, 0], target: 'binding:r/arg0' })
		has({ at: [10, 10], target: null })
	})

	it('has what each kind of thing has to line up with', () => {
		const has = (point: object) => expect(points).toContainEqual(expect.objectContaining(point))
		has({ at: [90, 100], target: null })
		has({ at: [100, 110], target: null })
		has({ at: [5, 5], target: null })
		has({ at: [10, 0], to: [10, 10], target: null })
		const gon = parse('{g = (path.ngon [0 0] 10 4)}')
		const around = snapPointsOf(gon, env, sceneOf(gon, env))
		expect(around.filter(p => p.to !== undefined)).toHaveLength(4)
	})

	it('snaps along a line', () => {
		expect(nearestSnap(points, [12, 7], 2.5)!.at).toEqual([10, 7])
		expect(nearestSnap(points, [12, 7], 2.5)!.beyond).toBeUndefined()
		expect(nearestSnap(points, [12, 7], 1)).toBeNull()
		expect(nearestSnap(points, [12, 7], 2.5)!.target).toBeNull()
	})

	describe('where a line would go, if it went on', () => {
		const edge = { at: [0, 0] as Vec, to: [10, 0] as Vec, target: null, label: 'edge' }

		it('snaps there, saying so, on either side', () => {
			expect(nearestSnap([edge], [20, 1], 2)).toMatchObject({ at: [20, 0], beyond: true, line: [[0, 0], [10, 0]] })
			expect(nearestSnap([edge], [-20, 1], 2)).toMatchObject({ at: [-20, 0], beyond: true })
			expect(nearestSnap([edge], [20, 3], 2)).toBeNull()
		})

		it('has a line itself go before it, and a place before that', () => {
			const other = { at: [19, -5] as Vec, to: [19, 5] as Vec, target: null, label: 'other' }
			expect(nearestSnap([edge, other], [20, 1], 2)).toMatchObject({ at: [19, 1], label: 'other' })
			const place = { at: [20, 2] as Vec, target: null, label: 'place' }
			expect(nearestSnap([edge, place], [20, 1], 2)).toMatchObject({ at: [20, 2], label: 'place' })
		})
	})

	it('has a place go before a line', () => {
		expect(nearestSnap(points, [10.5, 8], 4)!.at).toEqual([10, 10])
	})

	it('says what it is', () => {
		const label = (at: Vec, reach = 2) => nearestSnap(points, at, reach)?.label
		expect(label([100, 100])).toBe('c center')
		expect(label([100, 90])).toBe('c top')
		expect(label([0, 0])).toBe('r top left')
		expect(label([5, 5])).toBe('r center')
		expect(label([10, 3], 1.5)).toBe('r right')
	})

	it('says what line it went along', () => {
		expect(nearestSnap(points, [11, 3], 1.5)).toMatchObject({
			at: [10, 3],
			target: null,
			label: 'r right',
			line: [[10, 0], [10, 10]],
		})
	})

	it('finds the nearest, within reach', () => {
		expect(nearestSnap(points, [102, 101], 8)).toMatchObject({ at: [100, 100], target: 'binding:c/arg0' })
		expect(nearestSnap(points, [50, 50], 8)).toBeNull()
	})

	it('has a rect refer to the center it was drawn from', () => {
		const next = drawnFrom(root, env, 'x', 'rect', points.find(p => p.target === 'binding:c/arg0')!, [130, 120], false)
		expect(print(next.bindings.at(-1)![1])).toBe('(path.rect ../c/center [30 20])')
		const [, , shape] = sceneOf(next, env)
		expect(gripAt(next, env, shape!.row)!.handles[0]!.at).toEqual([100, 110])
	})

	it('moves along with what it refers to', () => {
		const next = drawnFrom(root, env, 'x', 'rect', points.find(p => p.target === 'binding:c/arg0')!, [130, 120], false)
		const { ast } = changed(next, env, 'binding:c', gripAt(next, env, 'binding:c')!.move!([50, 0]))
		expect(gripAt(ast!, env, 'binding:x')!.handles[0]!.at).toEqual([150, 110])
	})

	it('has a polygon refer from its center, whichever way it goes', () => {
		const next = drawnFrom(root, env, 'x', 'ngon', points.find(p => p.target === 'binding:c/arg0')!, [90, 90], false)
		expect(print(next.bindings.at(-1)![1])).toMatch(/^\(path\.ngon \.\.\/c\/center /)
	})

	it('refers from there, whichever way it was drawn', () => {
		const start = points.find(p => p.target === 'binding:c/arg0')!
		const drawnAs = (tool: 'rect' | 'roundRect' | 'ellipse', to: Vec, even = false) =>
			print(drawnFrom(root, env, 'x', tool, start, to, even).bindings.at(-1)![1])
		expect(drawnAs('rect', [130, 120])).toBe('(path.rect ../c/center [30 20])')
		expect(drawnAs('rect', [90, 90])).toBe('(path.rect [90 90] [10 10])')
		expect(drawnAs('rect', [130, 90])).toBe('(path.rect [100 90] [30 10])')
		expect(drawnAs('rect', [90, 90], true)).toBe('(path.square [90 90] 10)')
		expect(drawnAs('roundRect', [90, 90])).toMatch(/^\(path\.roundRect \[90 90\] \[10 10\] /)
		expect(drawnAs('ellipse', [120, 130])).toBe('(path.ellipse ../c/center [20 30])')
		expect(drawnAs('ellipse', [120, 130], true)).toBe('(path.circle ../c/center 30)')
	})

	describe('what no one argument says', () => {
		const at = (where: Vec) => nearestSnap(points, where, 0.5)!
		const refers = (where: Vec) => {
			const next = drawnFrom(root, env, 'x', 'ngon', at(where), [500, 500], false)
			return {
				code: print(next.bindings.at(-1)![1]),
				center: gripAt(next, env, 'binding:x')!.handles.at(-1)!.at,
			}
		}

		it('is worked out from them', () => {
			expect(refers([10, 10])).toMatchObject({ center: [10, 10] })
			expect(refers([10, 10]).code).toContain('(+ ../../../r/origin/0 ../../../r/size/0)')
			expect(refers([5, 5]).center).toEqual([5, 5])
			expect(refers([10, 0]).center).toEqual([10, 0])
			expect(refers([110, 100]).center).toEqual([110, 100])
			expect(refers([100, 90]).center).toEqual([100, 90])
		})

		it('goes along with what it is worked out from', () => {
			const next = drawnFrom(root, env, 'x', 'ngon', at([10, 10]), [500, 500], false)
			const { ast } = changed(next, env, 'binding:r', gripAt(next, env, 'binding:r')!.move!([3, 4]))
			expect(gripAt(ast!, env, 'binding:x')!.handles.at(-1)!.at).toEqual([13, 14])
		})

		it('has a handle dragged to it refer too', () => {
			const next = linked(root, env, 'binding:c', 0, at([10, 10]))!
			expect(print(next)).toContain('(path.circle [(+ ../../../r/origin/0 ../../../r/size/0)')
			expect(gripAt(next, env, 'binding:c')!.handles.at(-1)!.at).toEqual([10, 10])
		})

		it('has only the value, when what it comes from is out of reach', () => {
			const hidden = parse('{p = [0 0] r = (path.rect p [10 10]) c = (path.circle [50 50] 1)}') as LetAST
			const near = nearestSnap(snapPointsOf(hidden, env, sceneOf(hidden, env)), [10, 10], 0.5)!
			const next = drawnFrom(hidden, env, 'x', 'ngon', near, [90, 90], false)
			expect(print(next.bindings.at(-1)![1])).toMatch(/^\(path\.ngon \[10 10\]|\(path\.ngon \[\(\+/)
		})
	})

	describe('a handle', () => {
		const center = { at: [100, 100], target: 'binding:c/arg0', label: 'c center' } as const

		it('has what it was dragged to refer to it', () => {
			const next = linked(root, env, 'binding:r', 0, center)!
			expect(print(next)).toBe('{c = (path.circle [100 100] 10) r = (path.rect ../c/center [10 10])}')
		})

		it('does not, for a place that no row says', () => {
			expect(linked(root, env, 'binding:r', 0, { at: [110, 100], target: null, label: '' })).toBeNull()
		})

		it('does not, for what already refers to it', () => {
			const around = parse('{c = (path.circle ../r/origin 10) r = (path.rect [0 0] [10 10])}')
			expect(linked(around, env, 'binding:r', 0, { at: [0, 0], target: 'binding:c/arg0', label: '' })).toBeNull()
		})

		it('has nothing of its own row to snap to', () => {
			const others = snapPointsOf(root, env, sceneOf(root, env), new Set(['binding:c']))
			expect(others.every(p => p.target !== 'binding:c/arg0')).toBe(true)
			expect(others.length).toBeGreaterThan(0)
		})
	})

	describe('what is moving', () => {
		const moved = (src: string, row: string) => {
			const before = parse(src)
			const { ast } = changed(before, env, row, gripAt(before, env, row)!.move!([5, 5]))
			return [...rowsChanged(before, ast!, env)]
		}

		it('is the row itself', () => {
			expect(moved('{a = (path.circle [0 0] 1) b = (path.circle [9 9] 1)}', 'binding:a')).toEqual(['binding:a'])
		})

		it('is what refers to it, as well', () => {
			expect(
				moved('{a = (path.circle [0 0] 1) b = (path.rect ../a/center [1 1]) c = (path.circle [9 9] 1)}', 'binding:a')
			).toEqual(['binding:a', 'binding:b'])
		})

		it('is what has another name, and what it is another name of', () => {
			expect(moved('{a = (path.circle [0 0] 1) b = a}', 'binding:b')).toEqual(['binding:a', 'binding:b'])
		})

		it('is the row that holds what was taken hold of', () => {
			const before = parse('{a = (path.circle [0 0] 1)}')
			const { ast } = changed(before, env, 'binding:a/arg0', [{ route: [], value: [5, 5] }])
			expect([...rowsChanged(before, ast!, env)]).toEqual(['binding:a'])
		})
	})

	it('has only the value, for a place that no row says', () => {
		expect(print(drawnFrom(root, env, 'x', 'rect', { at: [10, 10], target: null, label: '' }, [20, 20], false).bindings.at(-1)![1])).toBe(
			'(path.rect [10 10] [10 10])'
		)
	})
})

describe('what a handle has changed', () => {
	const readout = (src: string, index: number, to: Vec, row = 'binding:c') => {
		const root = parse(src)
		const changes = gripAt(root, env, row)!.handles[index]!.to(to, to)
		return readoutOf(changed(root, env, row, changes).ast!, env, row, changes, root)
	}

	it('is what it is called, and what it is now', () => {
		expect(readout('{c = (path.circle [0 0] 10)}', 0, [30, 0])).toEqual(['Radius 30'])
		expect(readout('{c = (path.circle [0 0] 10)}', 1, [5, 6])).toEqual(['Center 5, 6'])
	})

	it('has each thing, once', () => {
		expect(readout('{c = (path.rect [0 0] [10 10])}', 4, [-5, -6])).toEqual([
			'X -5',
			'Width 15',
			'Y -6',
			'Height 16',
		])
	})

	it('leaves out what is not any different', () => {
		expect(readout('{c = (path.rect [0 0] [10 10])}', 7, [20, 30])).toEqual(['Width 20', 'Height 30'])
	})

	it('is only the part of a vector that was taken hold of', () => {
		expect(readout('{c = (path.rect [0 0] [10 10])}', 2, [25, 99])).toEqual(['Width 25'])
		expect(readout('{c = (path.rect [0 0] [10 10])}', 3, [99, 25])).toEqual(['Height 25'])
		expect(readout('{c = (path.rect [0 0] [10 10])}', 0, [-5, 99])).toEqual(['X -5', 'Width 15'])
		expect(readout('{c = (path.ellipse [0 0] [10 20])}', 0, [30, 99])).toEqual(['Width 30'])
	})

	it('has what it is, until anything is different', () => {
		expect(readout('{c = (path.circle [0 0] 10)}', 0, [10, 0])).toEqual(['Radius 10'])
	})

	it('comes to what it refers to, as well', () => {
		expect(readout('{r = 10 c = (path.circle [0 0] r)}', 0, [30, 0])).toEqual(['Radius 30'])
	})

	it('goes down to the call that makes a matrix', () => {
		expect(readout('{c = (path.transform (path.circle [0 0] 1) (mat2d.rotate 0))}', 0, [0, 80])).toEqual([
			'Angle 90',
		])
	})

	it('leaves out what is not numbers', () => {
		expect(readout('{c = (path.d "M 0,0 L 10,0")}', 1, [5, 5])).toEqual([])
	})

	it('is rounded to read', () => {
		const root = parse('{c = (path.circle [0 0] 1)}')
		const next = parse('{c = (path.circle [0 0] 1.23456)}')
		const changes = gripAt(root, env, 'binding:c')!.handles[0]!.to([9, 0], [9, 0])
		expect(readoutOf(next, env, 'binding:c', changes)).toEqual(['Radius 1.235'])
	})
})

describe('a square', () => {
	it('is a rect, on the way', () => {
		expect(expandLadder(parse('(path.square [1 2] (+ 1 2))'), env).map(print)[1]).toBe(
			'(path.rect [1 2] [(+ 1 2) (+ 1 2)])'
		)
	})

	it('can be referred to, by its corners', () => {
		const root = parse('{s = (path.square [10 10] 20) c = (path.circle [0 0] 1)}') as LetAST
		const near = nearestSnap(snapPointsOf(root, env, sceneOf(root, env)), [30, 30], 0.5)!
		const next = drawnFrom(root, env, 'x', 'ngon', near, [90, 90], false)
		expect(gripAt(next, env, 'binding:x')!.handles.at(-1)!.at).toEqual([30, 30])
	})

	it('refers from where it starts, out toward the bottom right, and not otherwise', () => {
		const root = parse('{c = (path.circle [100 100] 10)}') as LetAST
		const center = nearestSnap(snapPointsOf(root, env, sceneOf(root, env)), [100, 100], 1)!
		const drawnAs = (to: Vec) => print(drawnFrom(root, env, 'x', 'rect', center, to, true).bindings.at(-1)![1])
		expect(drawnAs([130, 120])).toBe('(path.square ../c/center 30)')
		expect(drawnAs([70, 80])).toBe('(path.square [70 70] 30)')
		expect(drawnAs([130, 80])).toBe('(path.square [100 70] 30)')
	})
})

describe('how finely a pointer says anything', () => {
	it('goes by the zoom and the screen, in powers of ten', () => {
		expect(dragStep(1, 1)).toBe(1)
		expect(dragStep(1, 2)).toBeCloseTo(0.1)
		expect(dragStep(4, 1)).toBeCloseTo(0.1)
		expect(dragStep(20, 1)).toBeCloseTo(0.01)
		expect(dragStep(0.05, 1)).toBe(10)
	})

	it('rounds without leaving anything behind', () => {
		expect(roundedTo(88.490715445, 0.1)).toBe(88.5)
		expect(roundedTo(0.30000000000000004, 0.1)).toBe(0.3)
		expect(roundedTo(137.86, 1)).toBe(138)
		expect(roundedTo(137.86, 10)).toBe(140)
	})

	it('rounds what is to change, wherever a number is in it', () => {
		const unset = Symbol.for('glisp.unset')
		expect(
			roundedChanges(
				[
					{ route: [0], value: [1.234, unset] },
					{ route: [1], value: 'M 1.234,5.678 A 1.234,1.234 0 0 1 2,3 Z' },
				],
				0.1
			)
		).toEqual([
			{ route: [0], value: [1.2, unset] },
			{ route: [1], value: 'M 1.2,5.7 A 1.2,1.2 0 0 1 2,3 Z' },
		])
	})
})

describe('color', () => {
	const value = (src: string) => evaluate(parse(src), env).value

	it('is made of what it has', () => {
		expect(value('(color.rgb 1 0 0)')).toBe('#ff0000')
		expect(value('(color.gray 0)')).toBe('#000000')
		expect(value('(color.hsl 120 1 0.5)')).toBe('#00ff00')
		expect(value('(color.alpha (color.rgb 1 0 0) 0.5)')).toBe('#ff000080')
	})

	it('is worked out from others', () => {
		expect(value('(color.invert "#000000")')).toBe('#ffffff')
		expect(value('(color.mix "#000000" "#ffffff" 0)')).toBe('#000000')
		expect(value('(color.mix "#000000" "#ffffff" 1)')).toBe('#ffffff')
		const lighter = value('(color.brighten "#444444" 1)') as string
		expect(lighter > '#444444').toBe(true)
		expect((value('(color.darken "#444444" 1)') as string) < '#444444').toBe(true)
	})

	it('is a type that what is not one falls back from', () => {
		expect(value('(: "#ff0000" color)')).toBe('#ff0000')
		expect(value('(: "red" color)')).toBe('red')
		expect(value('(: 1 color)')).toBe('#000000')
	})

	it('goes back through what it was made of', () => {
		const edited = (src: string, color: string) => {
			const root = parse(src)
			const [slot] = viewOf(root, env).slots
			return print(solve(root, env, slot!.ast, color).ast!)
		}
		expect(edited('{c = (color.gray 0)}', '#ffffff')).toContain('(color.gray 1)')
		expect(edited('{c = (color.invert "#000000")}', '#000000')).toContain('(color.invert "#ffffff")')
	})
})

describe('painting', () => {
	const row = 'binding:c'
	const root = parse('{c = (path.circle [0 0] 10)}')

	it('is drawn as it says', () => {
		const painted = parse('{c = (style (path.circle [0 0] 10) "#ff0000" "none" 2)}')
		expect(sceneOf(painted, env)[0]!.paint).toMatchObject({ fill: '#ff0000', stroke: 'none', width: 2 })
		expect(sceneOf(root, env)[0]!.paint).toBeUndefined()
	})

	it('wraps what has none, and goes on in it', () => {
		const once = withPaint(root, env, row, { fill: '#ff0000' })
		expect(print(once)).toBe('{c = (style (path.circle [0 0] 10) fill="#ff0000")}')
		const twice = withPaint(once, env, row, { stroke: '#000000', width: 2 })
		expect(print(twice)).toBe('{c = (style (path.circle [0 0] 10) fill="#ff0000" stroke="#000000" width=2)}')
	})

	it('says how its line ends, turns and breaks', () => {
		const line = withPaint(root, env, row, { stroke: '#000000', cap: 'round', dash: [4, 2] })
		expect(print(line)).toBe('{c = (style (path.circle [0 0] 10) stroke="#000000" cap="round" dash=[4 2])}')
		expect(sceneOf(line, env)[0]!.paint).toMatchObject({ cap: 'round', join: 'miter', dash: [4, 2] })
		expect(evaluate(line, env).diagnostics).toEqual([])
		expect(print(withPaint(line, env, row, { cap: 'butt', join: 'bevel' }))).toBe(
			'{c = (style (path.circle [0 0] 10) stroke="#000000" join="bevel" dash=[4 2])}'
		)
	})

	it('has an icon for each way a line ends and turns, where an editor can read it', () => {
		expect(enumIconsOf(lineCapType)).toHaveLength(LINE_CAPS.length)
		expect(enumIconsOf(lineJoinType)).toHaveLength(LINE_JOINS.length)
		const call = parse('(style (path.line [0 0] [1 1]) cap="round")')
		const slot = viewOf(call, env).slots.find(s => s.key === 'kw:cap')!
		expect(viewOf(slot.ast, slot.env, slot.expected).editor).toMatchObject({
			kind: 'enum',
			value: 'round',
			icons: enumIconsOf(lineCapType),
		})
	})

	it('has what is passed by name, and takes what it was given in order', () => {
		const given = parse('{c = (style (path.circle [0 0] 10) "#ff0000" "#000000" 2 "round")}')
		expect(print(withPaint(given, env, row, { width: 3 }))).toBe(
			'{c = (style (path.circle [0 0] 10) fill="#ff0000" stroke="#000000" width=3 cap="round")}'
		)
	})

	it('is let go of, once there is nothing to it', () => {
		const once = withPaint(root, env, row, { fill: '#ff0000' })
		expect(print(withPaint(once, env, row, { fill: 'none' }))).toBe('{c = (path.circle [0 0] 10)}')
	})

	it('keeps what a color refers to, that is not being changed', () => {
		const refers = parse('{k = "#00ff00" c = (style (path.circle [0 0] 1) k "none" 0)}')
		expect(print(withPaint(refers, env, row, { width: 3 }))).toContain('(style (path.circle [0 0] 1) fill=k width=3)')
	})

	it('has handles as what it is the style of has', () => {
		const painted = withPaint(root, env, row, { fill: '#ff0000' })
		const handle = gripAt(painted, env, row)!.handles[0]!
		expect(print(changed(painted, env, row, handle.to([30, 0], [30, 0])).ast!)).toContain('(path.circle [0 0] 30)')
		expect(print(changed(painted, env, row, gripAt(painted, env, row)!.move!([1, 2])).ast!)).toContain('(path.circle [1 2] 10)')
	})

	it('is nothing a path knows about', () => {
		const styled = evaluate(parse('(style (path.rect [0 0] [1 1]) "#ff0000" "none" 0)'), env).value
		expect(isPath(styled)).toBe(false)
		expect(iconOfPath(styled)).toMatch(/^stroke:/)
	})

	it('is looked past, to inspect what is in it', () => {
		const painted = withPaint(root, env, row, { fill: '#ff0000' })
		expect(paintedRow(painted, env, row)).toBe('binding:c/arg0')
		expect(paintedRow(root, env, row)).toBe('binding:c')
	})

	it('is what things in it can still be snapped to, and refer to', () => {
		const painted = withPaint(root, env, row, { fill: '#ff0000' }) as LetAST
		const points = snapPointsOf(painted, env, sceneOf(painted, env))
		const center = points.find(p => p.target !== null)!
		expect(center.target).toBe('binding:c/arg0/arg0')
		const next = drawnFrom(painted, env, 'x', 'rect', center, [20, 20], false)
		expect(print(next.bindings.at(-1)![1])).toBe('(path.rect ../c/path/center [20 20])')
		expect(gripAt(next, env, 'binding:x')!.handles[4]!.at).toEqual([0, 0])
	})

	it('comes along when it is evaluated', () => {
		const painted = '(style (path.rect [0 0] [1 1]) "#ff0000" "none" 0)'
		expect(print(toAst(evaluate(parse(painted), env).value, env))).toBe(
			'(style (path.d "M 0,0 L 1,0 L 1,1 L 0,1 Z") fill="#ff0000" width=0)'
		)
	})
})

describe('rowsWithin', () => {
	const scene = sceneOf(
		parse('{a = (path.rect [0 0] [10 10]) b = (path.rect [20 20] [10 10]) p = (: [50 50] point)}'),
		env
	)

	it('has what it touches, whichever way it was drawn', () => {
		expect(rowsWithin(scene, [5, 5], [25, 25])).toEqual(['binding:a', 'binding:b'])
		expect(rowsWithin(scene, [25, 25], [5, 5])).toEqual(['binding:a', 'binding:b'])
		expect(rowsWithin(scene, [12, 12], [18, 18])).toEqual([])
		expect(rowsWithin(scene, [49, 49], [51, 51])).toEqual(['binding:p'])
	})
})

describe('grips', () => {
	const row = 'binding:c'
	/** What taking the handle at `index` to `to` makes of the program. */
	const pulled = (src: string, index: number, to: Vec, from: Vec = to, at = row) => {
		const root = parse(src)
		const handle = gripAt(root, env, at)!.handles[index]!
		const { ast, problem } = changed(root, env, at, handle.to(to, from))
		return ast === null ? problem : print(ast)
	}
	const kinds = (src: string) => gripAt(parse(src), env, row)!.handles.map(h => h.kind)

	it('are where the arguments say', () => {
		expect(gripAt(parse('{r = 10 c = (path.circle [100 100] r)}'), env, row)!.handles.map(h => h.at)).toEqual([
			[110, 100],
			[100, 100],
		])
		expect(gripAt(parse('{c = 1}'), env, row)).toBeNull()
	})

	it('go back to what the arguments come from', () => {
		const source = '{r = 10 c = (path.circle [100 100] r)}'
		expect(pulled(source, 0, [130, 100])).toBe('{r = 30 c = (path.circle [100 100] r)}')
		expect(pulled(source, 1, [5, 6])).toBe('{r = 10 c = (path.circle [5 6] r)}')
	})

	it('stop at a pin', () => {
		expect(pulled('{r = @10 c = (path.circle [100 100] r)}', 0, [130, 100])).toBe('pinned')
	})

	it('pull an ellipse one way at a time', () => {
		const source = '{c = (path.ellipse [0 0] [10 20])}'
		expect(kinds(source)).toEqual(['arrow', 'arrow', 'translate'])
		expect(pulled(source, 0, [30, 99])).toBe('{c = (path.ellipse [0 0] [30 20])}')
		expect(pulled(source, 1, [99, 40])).toBe('{c = (path.ellipse [0 0] [10 40])}')
	})

	it('resize a rect by a corner, the opposite one staying where it is', () => {
		const source = '{c = (path.rect [0 0] [10 10])}'
		expect(pulled(source, 4, [-5, -6])).toBe('{c = (path.rect [-5 -6] [15 16])}')
		expect(pulled(source, 5, [20, -6])).toBe('{c = (path.rect [0 -6] [20 16])}')
		expect(pulled(source, 6, [-5, 20])).toBe('{c = (path.rect [-5 0] [15 20])}')
		expect(pulled(source, 7, [20, 30])).toBe('{c = (path.rect [0 0] [20 30])}')
	})

	it('resize a rect about its center, when asked to', () => {
		const root = parse('{c = (path.rect [0 0] [10 10])}')
		const symmetric = (index: number, to: Vec) => {
			const handle = gripAt(root, env, row)!.handles[index]!
			return print(changed(root, env, row, handle.to(to, to, { symmetric: true })).ast!)
		}
		expect(symmetric(2, [12, 99])).toBe('{c = (path.rect [-2 0] [14 10])}')
		expect(symmetric(0, [-2, 99])).toBe('{c = (path.rect [-2 0] [14 10])}')
		expect(symmetric(3, [99, 15])).toBe('{c = (path.rect [0 -5] [10 20])}')
		expect(symmetric(7, [12, 15])).toBe('{c = (path.rect [-2 -5] [14 20])}')
	})

	it('take a rect by the middle of each side, the far side staying where it is', () => {
		const source = '{c = (path.rect [0 0] [10 10])}'
		expect(gripAt(parse(source), env, row)!.handles.slice(0, 4).map(h => [h.kind, h.at])).toEqual([
			['offset', [0, 5]],
			['offset', [5, 0]],
			['offset', [10, 5]],
			['offset', [5, 10]],
		])
		expect(pulled(source, 0, [-5, 99])).toBe('{c = (path.rect [-5 0] [15 10])}')
		expect(pulled(source, 1, [99, -5])).toBe('{c = (path.rect [0 -5] [10 15])}')
		expect(pulled(source, 2, [20, 99])).toBe('{c = (path.rect [0 0] [20 10])}')
		expect(pulled(source, 3, [99, 20])).toBe('{c = (path.rect [0 0] [10 20])}')
	})

	it('take a point of as many as there are', () => {
		const source = '{c = (path.polyline [0 0] [1 1] [2 2])}'
		expect(kinds(source)).toEqual(['point', 'point', 'point'])
		expect(pulled(source, 2, [5, 5])).toBe('{c = (path.polyline [0 0] [1 1] [5 5])}')
	})

	it('have a whole number of sides, of at least three, on an ngon', () => {
		const [, , sides] = viewOf(parse('(path.ngon [0 0] 10 6)'), env).slots
		expect(sides!.numberOptions).toEqual({ min: 3, step: 1 })
	})

	it('count the sides of an ngon by how far round', () => {
		const source = '{c = (path.ngon [0 0] 10 6)}'
		expect(kinds(source)).toEqual(['point', 'dia', 'translate'])
		expect(pulled(source, 1, [0, 50])).toBe('{c = (path.ngon [0 0] 10 4)}')
	})

	it('turn the ends of an arc by the short way', () => {
		const source = '{c = (path.arc [0 0] 10 170 200)}'
		expect(pulled(source, 2, [-10, -1])).toMatch(/\(path\.arc \[0 0\] 10 170 18\d\.\d+\)/)
	})

	it('take a curve by where it goes through, where what pulls it is in the same place', () => {
		const source = '{c = (path.cubic [0 0] [0 0] [5 5] [9 0])}'
		const { handles } = gripAt(parse(source), env, row)!
		const atStart = handles.flatMap((h, i) => (h.at![0] === 0 ? [i] : []))
		// The last of them is what is found first.
		expect(pulled(source, atStart.at(-1)!, [1, 1])).toBe('{c = (path.cubic [1 1] [0 0] [5 5] [9 0])}')
	})

	it('take a square by a corner or side, as one size', () => {
		const source = '{c = (path.square [0 0] 10)}'
		expect(pulled(source, 0, [20, 99])).toBe('{c = (path.square [0 0] 20)}')
		expect(pulled(source, 1, [99, 30])).toBe('{c = (path.square [0 0] 30)}')
		expect(pulled(source, 2, [-5, -2])).toBe('{c = (path.square [-5 -5] 15)}')
		expect(pulled(source, 3, [20, 40])).toBe('{c = (path.square [0 0] 40)}')
		const root = parse(source)
		expect(print(changed(root, env, row, gripAt(root, env, row)!.move!([3, 4])).ast!)).toBe('{c = (path.square [3 4] 10)}')
	})

	it('show what controls a curve', () => {
		const grip = gripAt(parse('{c = (path.cubic [0 0] [1 0] [2 0] [3 0])}'), env, row)!
		expect(grip.handles).toHaveLength(4)
		expect(grip.guides).toHaveLength(2)
	})

	it('take a point that is all there is', () => {
		expect(pulled('{c = (: [1 2] point)}', 0, [5, 6])).toBe('{c = (: [5 6] point)}')
		expect(pulled('{d = (: [1 2] point) c = d}', 0, [5, 6])).toBe('{d = (: [5 6] point) c = d}')
	})

	describe('a path as its data', () => {
		const data = (src: string) => print(toAst(evaluate(parse(src), env).value, env))

		it('is what a path is written as', () => {
			expect(data('(path.rect [0 0] [10 10])')).toBe('(path.d "M 0,0 L 10,0 L 10,10 L 0,10 Z")')
		})

		it('comes to the same path', () => {
			const again = evaluate(parse(data('(path.ellipse [0 0] [10 20])')), env).value
			expect(print(toAst(again, env))).toBe(data('(path.ellipse [0 0] [10 20])'))
		})

		it('is taken by its vertices', () => {
			const source = '{c = (path.d "M 0,0 L 10,0")}'
			expect(kinds(source)).toEqual(['point', 'point'])
			expect(pulled(source, 1, [5, 5])).toBe('{c = (path.d "M 0,0 L 5,5")}')
		})

		it('is moved as a whole', () => {
			const root = parse('{c = (path.d "M 0,0 L 10,0")}')
			const { ast } = changed(root, env, row, gripAt(root, env, row)!.move!([1, 2]))
			expect(print(ast!)).toBe('{c = (path.d "M 1,2 L 11,2")}')
		})

		it('moves an arc by where it goes, leaving its radii', () => {
			const root = parse(`{c = ${data('(path.ellipse [0 0] [10 20])')}}`)
			const { ast } = changed(root, env, row, gripAt(root, env, row)!.move!([1, 2]))
			expect(print(ast!)).toBe('{c = (path.d "M 11,2 A 10,20 0 0 1 -9,2 A 10,20 0 0 1 11,2 Z")}')
		})

		describe('with a curve', () => {
			const source = '{c = (path.d "M 0,0 C 1,0 2,0 3,0")}'

			it('is taken by what controls it too, with lines to them', () => {
				const grip = gripAt(parse(source), env, row)!
				expect(grip.handles.map(h => h.at)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
				expect(grip.guides).toHaveLength(2)
			})

			it('takes the controls along with a vertex', () => {
				expect(pulled(source, 3, [13, 0])).toBe('{c = (path.d "M 0,0 C 1,0 12,0 13,0")}')
				expect(pulled(source, 0, [10, 0])).toBe('{c = (path.d "M 10,0 C 11,0 2,0 3,0")}')
			})

			it('moves a control on its own', () => {
				expect(pulled(source, 1, [5, 5])).toBe('{c = (path.d "M 0,0 C 5,5 2,0 3,0")}')
			})
		})

		it('is the last rung, from a circle on', () => {
			const ladder = expandLadder(parse('(path.circle [0 0] 5)'), env).map(print)
			expect(ladder.at(-1)).toBe('(path.ellipse [0 0] [5 5])')
			expect(data(ladder.at(-1)!)).toMatch(/^\(path\.d "M 5,0 A/)
		})
	})

	describe('a transformed path', () => {
		it('is taken by its matrix, as written out', () => {
			const source = '{c = (path.transform (path.circle [0 0] 1) [1 0 0 1 10 20])}'
			expect(kinds(source)).toEqual(['path', 'point', 'point', 'point', 'translate'])
			expect(pulled(source, 4, [30, 40])).toBe(
				'{c = (path.transform (path.circle [0 0] 1) [1 0 0 1 30 40])}'
			)
			expect(pulled(source, 3, [170, 180])).toBe(
				'{c = (path.transform (path.circle [0 0] 1) [2 0 0 2 10 20])}'
			)
		})

		it('is turned by a ring, from where it was taken', () => {
			const next = pulled('{c = (path.transform (path.circle [0 0] 1) [1 0 0 1 0 0])}', 0, [0, 40], [40, 0])!
			const [, a, b] = /\[(\S+) (\S+) /.exec(next.slice(next.indexOf('1)')))!
			expect(Number(a)).toBeCloseTo(0)
			expect(Number(b)).toBeCloseTo(1)
		})

		it('is taken by the call that makes the matrix', () => {
			expect(pulled('{c = (path.transform (path.circle [0 0] 1) (mat2d.translate [1 2]))}', 0, [5, 6])).toBe(
				'{c = (path.transform (path.circle [0 0] 1) (mat2d.translate [5 6]))}'
			)
			expect(pulled('{c = (path.transform (path.circle [0 0] 1) (mat2d.scale [1 1]))}', 0, [160, 99])).toBe(
				'{c = (path.transform (path.circle [0 0] 1) (mat2d.scale [2 1]))}'
			)
			expect(pulled('{c = (path.transform (path.circle [0 0] 1) (mat2d.rotate 0))}', 0, [0, 80])).toBe(
				'{c = (path.transform (path.circle [0 0] 1) (mat2d.rotate 90))}'
			)
		})

		it('says where what is inside it is', () => {
			const root = parse('{c = (path.transform (path.circle [0 0] 1) [2 0 0 2 10 20])}')
			expect(gripAt(root, env, 'binding:c/arg0')!.transform).toEqual([2, 0, 0, 2, 10, 20])
			expect(gripAt(root, env, 'binding:c')!.transform).toEqual([1, 0, 0, 1, 0, 0])
		})
	})
})

describe('what cannot be worked out', () => {
	const row = 'binding:c'
	const held = (src: string) => gripAt(parse(src), env, row)!

	it('has a handle where the default is, rather than failing', () => {
		expect(held('{c = (path.circle [../nope/x 5] 1)}').handles.at(-1)!.at).toEqual([0, 0])
		expect(held('{c = (path.circle ../nope/center 1)}').handles.at(-1)!.at).toEqual([0, 0])
		expect(held('{c = (path.circle [0 0] ../nope)}').handles[0]!.at).toEqual([0, 0])
		expect(held('{c = (path.rect "x" [1 1])}').handles).toHaveLength(8)
		expect(held('{c = (path.polyline [../nope 0] [1 1])}').handles).toHaveLength(2)
	})

	it('can be drawn, snapped to and moved all the same', () => {
		const root = parse('{c = (path.circle [(+ ../../../gone/origin/0 1) ../../gone/origin/1] 10)}')
		expect(sceneOf(root, env)).toHaveLength(1)
		expect(snapPointsOf(root, env, sceneOf(root, env)).length).toBeGreaterThan(0)
		expect(gripAt(root, env, row)!.move!([1, 2])).toHaveLength(1)
	})
})

describe('moving the whole', () => {
	const move = (src: string, row = 'binding:c') => {
		const root = parse(src)
		const { ast, problem } = changed(root, env, row, gripAt(root, env, row)!.move!([10, 20]))
		return ast === null ? problem : print(ast)
	}

	it('moves what goes along, and not what is the shape\'s size', () => {
		expect(move('{r = 10 c = (path.circle [100 100] r)}')).toBe('{r = 10 c = (path.circle [110 120] r)}')
	})

	it('moves every point that makes a shape', () => {
		expect(move('{c = (path.rect [0 0] [10 10])}')).toBe('{c = (path.rect [10 20] [10 10])}')
		expect(move('{c = (path.polygon [0 0] [1 1])}')).toBe('{c = (path.polygon [10 20] [11 21])}')
	})

	it('goes back through what it refers to', () => {
		expect(move('{p = [1 2] c = (path.circle p 5)}')).toBe('{p = [11 22] c = (path.circle p 5)}')
		expect(move('{a = (path.circle [0 0] 1) c = a}')).toBe('{a = (path.circle [10 20] 1) c = a}')
	})

	it('says why it cannot, at a pin', () => {
		expect(move('{p = @[1 2] c = (path.circle p 5)}')).toBe('pinned')
	})

	it('moves the matrix of a transformed path, or if that cannot, what is inside', () => {
		expect(move('{c = (path.transform (path.circle [0 0] 1) (mat2d.translate [1 2]))}')).toBe(
			'{c = (path.transform (path.circle [0 0] 1) (mat2d.translate [11 22]))}'
		)
		expect(move('{c = (path.transform (path.circle [0 0] 1) (mat2d.scale [2 2]))}')).toBe(
			'{c = (path.transform (path.circle [5 10] 1) (mat2d.scale [2 2]))}'
		)
	})

	it('starts from where it began, not from where it has got to', () => {
		const root = parse('{c = (path.circle [0 0] 1)}')
		const { move: by } = gripAt(root, env, 'binding:c')!
		const once = changed(root, env, 'binding:c', by!([5, 5])).ast!
		expect(print(changed(once, env, 'binding:c', by!([7, 7])).ast!)).toBe('{c = (path.circle [7 7] 1)}')
	})
})

describe('whether a shape has an inside to take hold of', () => {
	const shape = (paint?: Paint): Shape => ({
		row: 'binding:a',
		draw: 'path',
		value: null,
		...(paint === undefined ? {} : { paint }),
	})

	it('has none, with nothing to paint it', () => {
		expect(hasInside(shape())).toBe(false)
		expect(hasInside(shape(NO_PAINT))).toBe(false)
	})

	it('has one, with a fill or a line', () => {
		expect(hasInside(shape({ ...NO_PAINT, fill: '#000000' }))).toBe(true)
		expect(hasInside(shape({ ...NO_PAINT, stroke: '#000000' }))).toBe(true)
	})
})
