import { type AST, buildPrelude, type Env, evaluate, expandLadder, LetAST, print } from '@glisp/lang'
import { bound, parse } from './program.testing'
import { numberOptionsAt, textOf, viewOf } from '@glisp/tweeq/structure'
import { tangent as tangentOf } from 'pave/path/location'
import { nearest as nearestOn } from 'pave/path/queries'
import { describe, expect, it } from 'vitest'

import { iconOfPath, onlyShapes, otherControl, type Vec, withGraphics } from './graphics'
import { anchorsAlong, boxHandlesOf, cornerTurners, changed, dimensionAt, dOfAnchors, dimensionsMoved, dimensionsOf, drawn, drawnFrom, evenlyFrom, facesWhenDrawn, gripAt, linked, nameFor, placesTakenBy, rowsOfHandle, type ShapeTool, snapPointsOf, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const ROW = 'binding:c'

const SHAPES = [
	'(path.star [50 50] 40 18 5)',
	'(path.capsule [25 70] [75 30] 15)',
	'(path.roundRect [10 10] [80 60] 12)',
	'(path.superellipse [50 50] [40 30] 2)',
	'(path.fan [50 50] 20 40 0 90)',
	'(path.spiral [50 50] 4 42 5)',
	'(path.clothoid [10 80] 0 150 0 0.1)',
]

const failures = (src: string) => evaluate(parse(src), env).diagnostics

describe('the shapes from pave', () => {
	it.each(SHAPES)('%s draws something', src => {
		expect(failures(src)).toEqual([])
		expect(iconOfPath(evaluate(parse(src), env).value)).not.toBeNull()
	})

	it.each(SHAPES)('%s can be taken hold of and moved', src => {
		const root = parse(`{c = ${src}}`)
		const grip = gripAt(root, env, ROW)!
		expect(grip.handles.length).toBeGreaterThan(0)
		expect(grip.move).toBeDefined()
		expect(changed(root, env, ROW, grip.move!([1, 2])).ast).not.toBeNull()
	})

	it.each([
		'(path.star [0 0] -1 -1 0)',
		'(path.star [0 0] 10 5 2.5)',
		'(path.star [0 0] 10 5 (/ 1 0))',
		'(path.capsule [0 0] [10 0] -5)',
		'(path.capsule [5 5] [5 5] 5)',
		'(path.roundRect [0 0] [0 0] 5)',
		'(path.roundRect [10 10] [-5 -5] 100)',
		'(path.superellipse [0 0] [0 0] 2)',
		'(path.superellipse [0 0] [10 10] 0)',
		'(path.superellipse [0 0] [10 10] -2)',
		'(path.superellipse [0 0] [10 10] (/ 1 0))',
		'(path.fan [0 0] 0 10 0 0)',
		'(path.fan [0 0] -1 -1 0 720)',
		'(path.spiral [0 0] 0 0 3)',
		'(path.spiral [0 0] 5 5 0)',
		'(path.spiral [0 0] -5 10 (/ 1 0))',
		'(path.clothoid [0 0] 0 0 0 0)',
		'(path.clothoid [0 0] 0 -5 0 1)',
		'(path.clothoid [0 0] 0 (/ 1 0) 0 1)',
	])('%s comes to a path, whatever it is asked for', src => {
		expect(failures(src)).toEqual([])
		expect(gripAt(parse(`{c = ${src}}`), env, ROW)).not.toBeNull()
	})

	it('goes from a star to its vertices', () => {
		const [, next] = expandLadder(parse('(path.star [0 0] 10 5 2)'), env)
		expect(print(next!)).toMatch(/^\(path\.polygon \[10 0\]/)
		expect(iconOfPath(evaluate(next!, env).value)).toBe(
			iconOfPath(evaluate(parse('(path.star [0 0] 10 5 2)'), env).value)
		)
	})
})

describe('taking hold of them', () => {
	const dragged = (src: string, index: number, to: (at: Vec) => Vec): string => {
		const root = parse(`{c = ${src}}`)
		const handle = gripAt(root, env, ROW)!.handles[index]!
		const at = handle.at!
		const next = changed(root, env, ROW, handle.to(to(at), at)).ast as LetAST
		return print(bound(next)[0]![1])
	}

	it('pulls the two radii of a star apart', () => {
		expect(dragged('(path.star [0 0] 40 20 5)', 0, ([x, y]) => [x + 10, y])).toBe(
			'(path.star [0 0] 50 20 5)'
		)
		const inner = dragged('(path.star [0 0] 40 20 5)', 1, ([x, y]) => [x * 1.5, y * 1.5])
		expect(inner).toMatch(/^\(path\.star \[0 0\] 40 30(\.0+\d*)? 5\)$/)
	})

	it('widens a capsule from either side', () => {
		const grip = gripAt(parse('{c = (path.capsule [0 0] [100 0] 10)}'), env, ROW)!
		const arrow = grip.handles.at(-1)!
		expect(arrow.at).toEqual([50, -10])
		expect(arrow.to([50, 25], arrow.at!)).toEqual([{ route: [2], value: 25 }])
	})

	it('rounds the corners of a rect, starting from none, up to half of its side', () => {
		const src = '(path.roundRect [0 0] [100 40] 0)'
		const root = parse(`{c = ${src}}`)
		const grip = gripAt(root, env, ROW)!
		const corner = grip.handles.at(-1)!
		const [ax, ay] = corner.at!
		expect(Math.hypot(ax, ay)).toBeCloseTo(6)
		expect(ax).toBeCloseTo(ay)
		const [{ value }] = corner.to([ax + 1, ay + 1], corner.at!) as [{ value: number }]
		expect(value).toBeCloseTo(1 / (1 - Math.SQRT1_2))
		expect(corner.to([90, 90], corner.at!)).toEqual([{ route: [2], value: 20 }])
		expect(corner.to([0, 0], corner.at!)).toEqual([{ route: [2], value: 0 }])
	})

	it('holds how round a corner is on the curve of it, and goes along with the hand', () => {
		const corner = gripAt(parse('{c = (path.roundRect [0 0] [200 200] 60)}'), env, ROW)!.handles.at(-1)!
		const [ax, ay] = corner.at!
		expect(Math.hypot(ax - 60, ay - 60)).toBeCloseTo(60)
		expect(ax).toBeCloseTo(ay)
		const r = 80
		const along = r * (1 - Math.SQRT1_2)
		const [{ value }] = corner.to([along, along], corner.at!) as [{ value: number }]
		expect(value).toBeCloseTo(r)
	})

	it('is on the curve however small a corner it is usual to round', () => {
		const corner = gripAt(parse('{c = (path.roundRect [0 0] [200 200] 16)}'), env, ROW)!.handles.at(-1)!
		const [ax, ay] = corner.at!
		expect(Math.hypot(ax - 16, ay - 16)).toBeCloseTo(16)
	})

	it('keeps what a rect can do on a rect with round corners', () => {
		const rect = gripAt(parse('{c = (path.rect [0 0] [100 40])}'), env, ROW)!
		const round = gripAt(parse('{c = (path.roundRect [0 0] [100 40] 5)}'), env, ROW)!
		expect(round.handles.slice(0, -1).map(h => h.name)).toEqual(rect.handles.map(h => h.name))
		expect(round.handles[0]!.to([-10, 20], [0, 20])).toEqual(rect.handles[0]!.to([-10, 20], [0, 20]))
	})

	it('finds the shape of a superellipse from how far out it is pulled', () => {
		const grip = gripAt(parse('{c = (path.superellipse [0 0] [10 10] 1)}'), env, ROW)!
		const handle = grip.handles[0]!
		expect(handle.at![0]).toBeCloseTo(10 * Math.SQRT1_2)
		const [{ value }] = handle.to(handle.at!, handle.at!) as [{ value: number }]
		expect(value).toBeCloseTo(1)
		const [{ value: squircle }] = handle.to([8.409, 8.409], handle.at!) as [{ value: number }]
		expect(squircle).toBeCloseTo(2, 2)
	})

	it('winds a spiral on from where it ends', () => {
		const handle = gripAt(parse('{c = (path.spiral [0 0] 0 10 2)}'), env, ROW)!.handles[1]!
		expect(handle.at![0]).toBeCloseTo(10)
		expect(handle.to([0, 20], handle.at!)).toEqual([
			{ route: [2], value: 20 },
			{ route: [3], value: 2.25 },
		])
	})

	it('lengthens a clothoid from where it ends, the way it is going', () => {
		const root = parse('{c = (path.clothoid [0 0] 0 100 0 0)}')
		const handle = gripAt(root, env, ROW)!.handles[0]!
		expect(handle.at![0]).toBeCloseTo(100)
		expect(handle.to([130, 50], handle.at!)).toEqual([{ route: [2], value: 130 }])
	})

	it('grows a rect down from a corner, and not up, when its height is the way to another', () => {
		// The height reaches a square below: pulling the bottom down keeps the top where the hand
		// left it, and the square goes down, rather than the top going up for the height to grow.
		const root = parse('{c = (path.rect [0 -20] [100 (- ../../../s/origin:/1 ../../origin:/1)]) s = (path.square [0 100] 50)}')
		const corner = gripAt(root, env, ROW)!.handles.find(h => h.name === 'bottom left')!
		expect(corner.at).toEqual([0, 100])
		const next = changed(root, env, ROW, corner.to([0, 150], corner.at!)).ast as LetAST
		expect(print(bound(next)[0]![1])).toBe('(path.rect [0 -20] [100 (- ../../../s/origin:/1 ../../origin:/1)])')
		expect(print(bound(next)[1]![1])).toBe('(path.square [0 150] 50)')
	})
})

describe('drawing them', () => {
	it.each<ShapeTool>(['star', 'roundRect', 'superellipse', 'capsule', 'fan', 'spiral', 'clothoid'])(
		'draws a %s, even from nothing',
		tool => {
			const root = parse('{a = 1}') as LetAST
			const name = nameFor(root, tool, false)
			expect(name).toBe(`${tool}1`)
			for (const to of [[60, 40], [10, 10], [-30, -20]] as Vec[]) {
				const next = drawn(root, name, tool, [10, 10], to, false)
				expect(evaluate(next, env).diagnostics).toEqual([])
				expect(gripAt(next, env, `binding:${name}`)!.handles.length).toBeGreaterThan(0)
			}
		}
	)

	it('starts each from where it was dragged from', () => {
		const root = parse('{a = 1}') as LetAST
		const source = (tool: ShapeTool) =>
			print(bound(drawn(root, 'x', tool, [10, 10], [40, 50], false)).at(-1)![1])
		expect(source('star')).toBe('(path.star [10 10] 50 22.5 5 53.13)')
		expect(source('capsule')).toBe('(path.capsule [10 10] [40 50] 12.5)')
		expect(source('spiral')).toBe('(path.spiral [10 10] 0 50 3)')
		expect(source('roundRect')).toBe('(path.roundRect [10 10] [30 40] 6)')
		expect(source('superellipse')).toBe('(path.superellipse [25 30] [15 20] 2)')
	})
})

describe('which way a polygon or a star faces', () => {
	const source = (root: AST) => print(bound((root as LetAST)).at(-1)![1])
	const pull = (src: string, index: number, to: Vec, even = false) => {
		const root = parse(`{c = ${src}}`)
		const handle = gripAt(root, env, ROW)!.handles[index]!
		const { ast, problem } = changed(root, env, ROW, handle.to(to, handle.at!, { even }))
		expect(problem).toBeNull()
		return source(ast!)
	}
	const firstVertex = (src: string) =>
		(evaluate(parse(src), env).value as { path: { curves: { vertices: { point: Vec }[] }[] } }).path
			.curves[0]!.vertices[0]!.point

	it.each([
		['(path.ngon [0 0] 10 4 90)', 'an ngon'],
		['(path.star [0 0] 10 5 3 90)', 'a star'],
	])('%s has its first vertex that way, as %s', src => {
		const [x, y] = firstVertex(src)
		expect(x).toBeCloseTo(0)
		expect(y).toBeCloseTo(10)
	})

	it('is +X unless it is said', () => {
		expect(firstVertex('(path.ngon [0 0] 10 4)')).toEqual([10, 0])
		expect(firstVertex('(path.star [0 0] 10 5 3)')).toEqual([10, 0])
	})

	it('can be said by name', () => {
		const [x, y] = firstVertex('(path.ngon [0 0] 10 4 angle: 90)')
		expect(x).toBeCloseTo(0)
		expect(y).toBeCloseTo(10)
		const root = parse('{c = (path.ngon [0 0] 20 4 angle: 90)}')
		const at = gripAt(root, env, ROW)!.handles[0]!.at!
		expect(at[0]).toBeCloseTo(0)
		expect(at[1]).toBeCloseTo(20)
		const { ast } = changed(root, env, ROW, [{ route: [3], value: 45 }])
		expect(source(ast!)).toBe('(path.ngon [0 0] 20 4 angle: 45)')
	})

	it('comes out the same on the next rung', () => {
		for (const src of ['(path.ngon [0 0] 10 5 30)', '(path.star [0 0] 10 5 5 30)']) {
			const [first, second] = expandLadder(parse(src), env)
			const numbers = (ast: AST) =>
				iconOfPath(evaluate(ast, env).value)!.match(/-?[\d.]+/g)!.map(Number)
			const expected = numbers(first!)
			numbers(second!).forEach((n, i) => expect(n).toBeCloseTo(expected[i]!, 6))
		}
	})

	it('turns with the vertex it is pulled by, even where nothing has said it yet', () => {
		expect(pull('(path.ngon [0 0] 20 5)', 0, [0, 30])).toBe('(path.ngon [0 0] 30 5 90)')
		expect(pull('(path.ngon [0 0] 20 5 90)', 0, [30, 0])).toBe('(path.ngon [0 0] 30 5 0)')
		expect(pull('(path.star [0 0] 20 5 5)', 0, [0, -30])).toBe('(path.star [0 0] 30 5 5 -90)')
	})

	it('says it inside a style too', () => {
		const src = '(style (path.ngon [0 0] 20 5) fill: "red")'
		expect(pull(src, 0, [0, 30])).toBe('(style (path.ngon [0 0] 30 5 90) fill: "red")')
	})

	it('goes by 45 degrees with Shift', () => {
		expect(pull('(path.ngon [0 0] 10 5)', 0, [20, 18], true)).toMatch(/^\(path\.ngon \[0 0\] [\d.]+ 5 45\)$/)
		expect(pull('(path.ngon [0 0] 10 5 90)', 0, [20, 2], true)).toMatch(/^\(path\.ngon \[0 0\] [\d.]+ 5 0\)$/)
	})

	it('keeps its dial and its inner points turned with it', () => {
		const grip = gripAt(parse('{c = (path.star [0 0] 10 5 4 90)}'), env, ROW)!
		const inner = grip.handles[1]!.at!
		expect(Math.atan2(inner[1], inner[0]) * (180 / Math.PI)).toBeCloseTo(135)
		const dial = grip.handles[2]!
		expect(Math.atan2(dial.at![1], dial.at![0]) * (180 / Math.PI)).toBeCloseTo(180)
		expect(dial.to(dial.at!, dial.at!)).toEqual([{ route: [3], value: 4 }])
	})

	it('is drawn the way it is dragged, and by 45 degrees if even', () => {
		const root = parse('{a = 1}') as LetAST
		const of = (tool: ShapeTool, to: Vec, even = false) => source(drawn(root, 'x', tool, [0, 0], to, even))
		expect(of('ngon', [0, -50])).toBe('(path.ngon [0 0] 50 5 -90)')
		expect(of('ngon', [50, 0])).toBe('(path.ngon [0 0] 50 5)')
		expect(of('star', [0, 50])).toBe('(path.star [0 0] 50 22.5 5 90)')
		expect(of('ngon', [30, -40], true)).toBe('(path.ngon [0 0] 50 5 -45)')
	})
})

describe('what only says which way', () => {
	it('is a direction, on a clothoid and on a rotation', () => {
		const kinds = (src: string) => gripAt(parse(`{c = ${src}}`), env, ROW)!.handles.map(h => h.kind)
		expect(kinds('(path.clothoid [0 0] 30 100 0 0.01)')).toContain('direction')
		expect(kinds('(mat2d.rotate 30)')).toEqual(['direction'])
	})

	it('faces the way it says, and goes by 45 degrees with Shift', () => {
		const handle = gripAt(parse('{c = (path.clothoid [0 0] 30 100 0 0)}'), env, ROW)!.handles[1]!
		expect(handle.angle).toBe(30)
		expect(handle.to([0, 10], handle.at!)).toEqual([{ route: [1], value: 90 }])
		expect(handle.to([10, 8], handle.at!, { even: true })).toEqual([{ route: [1], value: 45 }])
	})
})

describe('a capsule, evenly', () => {
	it('is drawn at 45 degrees', () => {
		const root = parse('{a = 1}') as LetAST
		const source = print(bound(drawn(root, 'x', 'capsule', [0, 0], [30, 40], true)).at(-1)![1])
		expect(source).toMatch(/^\(path\.capsule \[0 0\] \[35\.3\d* 35\.3\d*\] 12\.5\)$/)
		expect(print(bound(drawn(root, 'x', 'capsule', [0, 0], [30, 40], false)).at(-1)![1])).toBe(
			'(path.capsule [0 0] [30 40] 12.5)'
		)
	})

	it('has its ends dragged by 45 degrees around the other', () => {
		const grip = gripAt(parse('{c = (path.capsule [0 0] [100 0] 10)}'), env, ROW)!
		const [{ value }] = grip.handles[1]!.to([60, 50], [100, 0], { even: true }) as [{ value: Vec }]
		expect(value[0]).toBeCloseTo(value[1])
		expect(Math.hypot(value[0], value[1])).toBeCloseTo(Math.hypot(60, 50))
		expect(grip.handles[1]!.to([60, 50], [100, 0])).toEqual([{ route: [1], value: [60, 50] }])
		const [{ value: first }] = grip.handles[0]!.to([40, 40], [0, 0], { even: true }) as [{ value: Vec }]
		expect(first[0]).toBeCloseTo(100 - Math.hypot(60, 40) * Math.SQRT1_2)
	})
})

describe('the numbers of what is moved', () => {
	const moved = (src: string, delta: Vec) => {
		const root = parse(`{c = ${src}}`)
		const changes = gripAt(root, env, ROW)!.move!(delta)
		const next = changed(root, env, ROW, changes).ast!
		return dimensionsMoved(next, env, ROW, changes).map(({ label, value }) => `${label} ${value}`)
	}

	it('are of the one place that says where it is', () => {
		expect(moved('(path.rect [0 0] [10 10])', [1, 2])).toEqual(['X 1', 'Y 2'])
		expect(moved('(path.circle [0 0] 10)', [1, 2])).toEqual(['X 1', 'Y 2'])
		expect(moved('(path.ngon [0 0] 10 5)', [1, 2])).toEqual(['X 1', 'Y 2'])
	})

	it('are none, if no one place does', () => {
		expect(moved('(path.polyline [0 0] [10 0] [10 10])', [1, 2])).toEqual([])
		expect(moved('(path.cubic [0 0] [1 0] [2 0] [3 0])', [1, 2])).toEqual([])
		expect(moved('(path.capsule [0 0] [10 0] 5)', [1, 2])).toEqual([])
	})

	it('are of the vertex itself, if that is what is dragged', () => {
		const root = parse('{c = (path.polyline [0 0] [10 0] [10 10])}')
		const changes = gripAt(root, env, ROW)!.handles[1]!.to([20, 5], [10, 0])
		const next = changed(root, env, ROW, changes).ast!
		const said = dimensionsOf(next, env, ROW, changes, root)
		expect(said.every(({ route }) => route[0] === 1)).toBe(true)
		expect(said.map(({ label, value }) => `${label} ${value}`)).toEqual(['X 20', 'Y 5'])
	})
})

describe('what is still a handle, with a tool in hand', () => {
	const shaping = (src: string) =>
		gripAt(parse(`{c = ${src}}`), env, ROW)!.handles.map(onlyShapes)

	it('is the way a clothoid goes, but not where it starts or ends', () => {
		const grip = gripAt(parse('{c = (path.clothoid [0 0] 0 100 0 0.01)}'), env, ROW)!
		expect(grip.handles.map(h => [h.kind, onlyShapes(h)])).toEqual([
			['arrow', false],
			['direction', true],
			['translate', false],
		])
	})

	it('is the controls of a curve, but not its anchors', () => {
		const grip = gripAt(parse('{c = (path.cubic [0 0] [1 1] [2 2] [3 3])}'), env, ROW)!
		expect(grip.handles.map(h => [h.place, onlyShapes(h)])).toEqual([
			[1, true],
			[2, true],
			[0, false],
			[3, false],
		])
		const d = gripAt(parse('{c = (path.d "M0 0C1 1 2 2 3 3")}'), env, ROW)!
		expect(d.handles.filter(h => !h.segment).map(h => [h.name, onlyShapes(h)])).toEqual([
			['anchor', false],
			['control', true],
			['control', true],
			['anchor', false],
		])
		// Data still being written is not a path yet, and there is nothing to hold of it.
		expect(gripAt(parse('{c = (path.d "L1 1")}'), env, ROW)?.handles ?? []).toEqual([])
	})

	it('is how many, or how far, but not a corner or a vertex', () => {
		expect(shaping('(path.ngon [0 0] 20 5)')).toEqual([false, true, true, false])
		expect(shaping('(path.star [0 0] 20 10 5)')).toEqual([false, false, true, true, false])
		expect(shaping('(path.circle [0 0] 20)')).toEqual([false, false])
		expect(shaping('(path.capsule [0 0] [50 0] 10)')).toEqual([false, false, true])
		expect(shaping('(path.superellipse [0 0] [20 20] 2)')[0]).toBe(true)
		expect(shaping('(path.roundRect [0 0] [50 50] 5)').at(-1)).toBe(true)
		expect(shaping('(path.rect [0 0] [50 50])').every(only => !only)).toBe(true)
	})
})

describe('what moves an outline out along its normal', () => {
	const offsets = (src: string) =>
		gripAt(parse(`{c = ${src}}`), env, ROW)!.handles.filter(h => h.kind === 'offset')

	it('is on a circle, an arc, a fan and a capsule', () => {
		expect(offsets('(path.circle [0 0] 20)')).toHaveLength(1)
		expect(offsets('(path.arc [0 0] 20 0 90)')).toHaveLength(1)
		expect(offsets('(path.fan [0 0] 20 40 0 90)')).toHaveLength(2)
		expect(offsets('(path.capsule [0 0] [50 0] 10)')).toHaveLength(1)
	})

	it('faces that way, and changes the radius', () => {
		const [inner, outer] = offsets('(path.fan [0 0] 20 40 0 90)')
		expect(inner!.angle).toBe(45)
		expect(outer!.angle).toBe(45)
		expect(outer!.to([0, 60], outer!.at!)).toEqual([{ route: [2], value: 60 }])
		expect(inner!.to([0, 30], inner!.at!)).toEqual([{ route: [1], value: 30 }])
	})
})

describe('how an angle or a radius is shown', () => {
	const slotsOf = (src: string) => viewOf(parse(src), env).slots

	it.each([
		['(path.roundRect [0 0] [10 10] 2)', 2, 'tabler:border-radius'],
		['(path.ngon [0 0] 10 5 30)', 3, 'ph:angle'],
	])('%s has it on the row, not in the input', (src, arg, icon) => {
		const slot = slotsOf(src)[arg]!
		expect(textOf(slot.expected?.meta?.get('icon'))).toBe(icon)
		expect(numberOptionsAt(slot).leftIcon).toBeUndefined()
	})

	it('goes by how its name begins, for a radius', () => {
		const root = parse('{c = (path.circle [0 0] 10)}')
		const radius = dimensionAt(root, env, ROW, { route: [1] })!
		expect(radius.label).toBe('Radius')
		expect(radius.options.leftIcon).toBeUndefined()
	})

	it('has it in the input where there is no row', () => {
		const root = parse('{c = (path.roundRect [0 0] [10 10] 2)}')
		expect(dimensionAt(root, env, ROW, { route: [2] })!.options.leftIcon).toBe('tabler:border-radius')
	})
})

describe('the line that something going by even angles is on', () => {
	it('goes through what it turns around', () => {
		const pivots = (src: string) => gripAt(parse(`{c = ${src}}`), env, ROW)!.handles.map(h => h.pivot)
		expect(pivots('(path.ngon [1 2] 20 5)')[0]).toEqual([1, 2])
		expect(pivots('(path.star [1 2] 20 10 5)')[0]).toEqual([1, 2])
		expect(pivots('(path.capsule [1 2] [50 2] 10)').slice(0, 2)).toEqual([[50, 2], [1, 2]])
		expect(pivots('(path.clothoid [1 2] 0 100 0 0)')[1]).toEqual([1, 2])
	})

	it('comes to where it is drawn to, on an even angle', () => {
		const [x, y] = evenlyFrom([10, 10], [40, 50])
		expect(x - 10).toBeCloseTo(y - 10)
		expect(Math.hypot(x - 10, y - 10)).toBeCloseTo(50)
		expect(evenlyFrom([0, 0], [10, 1])[1]).toBeCloseTo(0)
	})

	it('is only for what faces the way it is drawn', () => {
		expect(facesWhenDrawn('ngon')).toBe(true)
		expect(facesWhenDrawn('capsule')).toBe(true)
		expect(facesWhenDrawn('rect')).toBe(false)
		expect(facesWhenDrawn('spiral')).toBe(false)
	})
})

describe('what is moved lines up', () => {
	const root = parse('{c = (path.rect [0 0] [100 100])}')
	const own = snapPointsOf(root, env, sceneOf(root, env)).filter(point => point.to === undefined)

	it('by the place it was taken by', () => {
		const taken = placesTakenBy(own, [1, 2], 8)
		expect(taken.length).toBeGreaterThan(0)
		expect(taken.every(({ at }) => at[0] === 0 && at[1] === 0)).toBe(true)
	})

	it('by nothing, if it was taken anywhere else', () => {
		expect(placesTakenBy(own, [30, 0], 8)).toEqual([])
	})
})

describe('a polygon and a polyline', () => {
	it.each(['polygon', 'polyline'])('call what %s goes through its points', name => {
		const view = viewOf(parse(`(path.${name} [0 0] [1 1])`), env)
		expect(view.append?.label).toBe('points')
		expect(view.slots.map(slot => slot.label)).toEqual(['0', '1'])
	})

	it.each(['polygon', 'polyline'])('are empty as %s, with no points', name => {
		const { value, diagnostics } = evaluate(parse(`(path.${name})`), env)
		expect(diagnostics).toEqual([])
		expect((value as { path: { curves: unknown[] } }).path.curves).toEqual([])
		expect(gripAt(parse(`{c = (path.${name})}`), env, ROW)).not.toBeNull()
		expect(iconOfPath(value)).toBeNull()
	})
})

describe('a line, evenly', () => {
	it('has its ends dragged by 45 degrees around the other', () => {
		const grip = gripAt(parse('{c = (path.line [0 0] [100 0])}'), env, ROW)!
		const [end] = grip.handles.filter(h => h.place === 1)
		expect(end!.pivot).toEqual([0, 0])
		const [{ value }] = end!.to([60, 50], [100, 0], { even: true }) as [{ value: Vec }]
		expect(value[0]).toBeCloseTo(value[1])
		expect(end!.to([60, 50], [100, 0])).toEqual([{ route: [1], value: [60, 50] }])
	})
})

describe('what a pen is drawing, having had its controls taken hold of', () => {
	const pathOf = (src: string) => (evaluate(parse(src), env).value as { path: Path }).path
	type Path = Parameters<typeof anchorsAlong>[1]

	it('goes on from them', () => {
		const anchors = [{ at: [0, 0] as Vec, out: [1, 1] as Vec }, { at: [9, 0] as Vec }]
		const after = anchorsAlong(anchors, pathOf('(path.cubic [0 0] [2 5] [7 5] [9 0])'))
		expect(after).toEqual([
			{ at: [0, 0], out: [2, 5] },
			{ at: [9, 0], into: [7, 5] },
		])
		expect(dOfAnchors([...after, { at: [20, 0] }], false)).toBe('M 0,0 C 2,5 7,5 9,0 L 20,0')
	})

	it('keeps how the last is going to go on', () => {
		const anchors = [{ at: [0, 0] as Vec, out: [1, 1] as Vec }, { at: [9, 0] as Vec, out: [12, 3] as Vec }]
		const after = anchorsAlong(anchors, pathOf('(path.cubic [0 0] [2 5] [7 5] [9 0])'), { symmetric: true })
		expect(after[1]).toEqual({ at: [9, 0], into: [7, 5], out: [12, 3] })
		expect(dOfAnchors([...after, { at: [20, 0] }], false)).toBe('M 0,0 C 2,5 7,5 9,0 C 12,3 20,0 20,0')
	})

	it('keeps what it was put down on', () => {
		const snap = { at: [0, 0] as Vec, target: 'binding:a/arg0', label: 'a' }
		const anchors = [{ at: [0, 0] as Vec, snap }, { at: [9, 0] as Vec }]
		expect(anchorsAlong(anchors, pathOf('(path.cubic [0 0] [2 5] [7 5] [9 0])'))[0]!.snap).toBe(snap)
	})

	it('is as it was, if that is something else altogether', () => {
		const anchors = [{ at: [0, 0] as Vec }, { at: [9, 0] as Vec }]
		expect(anchorsAlong(anchors, pathOf('(path.polyline [0 0] [1 1] [2 2])'))).toBe(anchors)
	})
})

describe('an ellipse that is turned', () => {
	const gripOfSrc = (src: string) => gripAt(parse(`{c = ${src}}`), env, ROW)!

	it('lies as it did, with nothing said', () => {
		const [right, bottom] = gripOfSrc('(path.ellipse [0 0] [20 10])').handles
		expect(right!.at).toEqual([20, 0])
		expect(bottom!.at).toEqual([0, 10])
	})

	it('has its handles along its own axes', () => {
		const [right, bottom] = gripOfSrc('(path.ellipse [0 0] [20 10] 90)').handles
		expect(right!.at![0]).toBeCloseTo(0)
		expect(right!.at![1]).toBeCloseTo(20)
		expect(bottom!.at![0]).toBeCloseTo(-10)
		expect(bottom!.at![1]).toBeCloseTo(0)
		expect(right!.to([0, 35], right!.at!)[0]!.value).toEqual([expect.closeTo(35), expect.anything()])
	})

	it('is turned by a direction handle, even where nothing has said it yet', () => {
		const root = parse('{c = (path.ellipse [0 0] [20 10])}')
		const handle = gripAt(root, env, ROW)!.handles.find(h => h.kind === 'direction')!
		expect(handle.pivot).toEqual([0, 0])
		const { ast } = changed(root, env, ROW, handle.to([0, 60], handle.at!))
		expect(print(ast!)).toBe('{main = [c = (path.ellipse [0 0] [20 10] 90)]}')
		const [{ value }] = handle.to([30, 28], handle.at!, { even: true }) as [{ value: number }]
		expect(value).toBe(45)
	})

	it('can be said where its sides are by its numbers, turned or not', () => {
		const coded = (src: string) => gripOfSrc(src).snaps!.points!.filter(p => p.code !== undefined).length
		expect(coded('(path.ellipse [0 0] [20 10])')).toBe(4)
		expect(coded('(path.ellipse [0 0] [20 10] 30)')).toBe(4)
	})

	it('leaves a superellipse, whose third is its shape, unturned', () => {
		const grip = gripOfSrc('(path.superellipse [0 0] [20 10] 2)')
		expect(grip.handles.some(h => h.kind === 'direction')).toBe(false)
		expect(grip.marks!.filter(m => m.route[0] === 2)).toHaveLength(1)
		expect(grip.guides).toEqual([])
	})
})

describe('an ellipse from its foci', () => {
	const SRC = '(path.ellipseFromFoci [30 50] [70 50] [50 20])'

	it('draws, and can be taken hold of by all three', () => {
		expect(evaluate(parse(SRC), env).diagnostics).toEqual([])
		const grip = gripAt(parse(`{c = ${SRC}}`), env, ROW)!
		expect(grip.handles.map(h => h.place)).toEqual([0, 1, 2])
		expect(grip.guides).toHaveLength(2)
		expect(grip.move!([1, 2])).toHaveLength(3)
	})

	it('goes on to an ellipse, of the same shape', () => {
		const [first, second] = expandLadder(parse('(path.ellipseFromFoci [20 30] [70 60] [50 20])'), env)
		expect(print(second!)).toMatch(/^\(path\.ellipse \[45 45\] \[/)
		const numbers = (ast: AST) => iconOfPath(evaluate(ast, env).value)!.match(/-?[\d.]+/g)!.map(Number)
		const expected = numbers(first!)
		numbers(second!).forEach((n, i) => expect(n).toBeCloseTo(expected[i]!, 6))
	})

	it('is a circle with one focus, and flat through a point between', () => {
		for (const src of ['(path.ellipseFromFoci [0 0] [0 0] [5 0])', '(path.ellipseFromFoci [0 0] [10 0] [5 0])', '(path.ellipseFromFoci [0 0] [0 0] [0 0])']) {
			expect(evaluate(parse(src), env).diagnostics).toEqual([])
		}
	})
})

describe('drawn out from the center', () => {
	const root = parse('{a = 1}') as LetAST
	const of = (tool: ShapeTool, to: Vec, even = false) =>
		print(bound(drawn(root, 'x', tool, [100, 100], to, even, 0.01, false, true)).at(-1)![1])

	it('goes both ways, whichever way it is dragged', () => {
		expect(of('rect', [130, 120])).toBe('(path.rect [70 80] [60 40])')
		expect(of('rect', [70, 80])).toBe('(path.rect [70 80] [60 40])')
		expect(of('roundRect', [130, 120])).toMatch(/^\(path\.roundRect \[70 80\] \[60 40\] /)
		expect(of('ellipse', [130, 120])).toBe('(path.ellipse [100 100] [30 20])')
		expect(of('superellipse', [130, 120])).toBe('(path.superellipse [100 100] [30 20] 2)')
		expect(of('capsule', [130, 100])).toMatch(/^\(path\.capsule \[70 100\] \[130 100\] /)
	})

	it('stays even, with Shift as well', () => {
		expect(of('rect', [130, 120], true)).toBe('(path.square [70 70] 60)')
		expect(of('ellipse', [130, 120], true)).toBe('(path.circle [100 100] 30)')
	})

	it('is as it was, without', () => {
		const plain = (tool: ShapeTool, even = false) =>
			print(bound(drawn(root, 'x', tool, [100, 100], [130, 120], even, 0.01)).at(-1)![1])
		expect(plain('rect')).toBe('(path.rect [100 100] [30 20])')
		expect(plain('ellipse')).toBe('(path.ellipse [115 110] [15 10])')
		expect(plain('rect', true)).toBe('(path.square [100 100] 30)')
		expect(plain('ellipse', true)).toBe('(path.circle [115 115] 15)')
	})

	it('refers to what it snapped to, if that is its center', () => {
		const from = parse('{o = (path.circle [50 50] 10)}') as LetAST
		const snap = snapPointsOf(from, env, sceneOf(from, env)).find(p => p.target === 'binding:o/arg0')!
		const source = (tool: ShapeTool) =>
			print(bound(drawnFrom(from, env, 'x', tool, snap, [80, 70], false, 0.01, true)).at(-1)![1])
		expect(source('ellipse')).toMatch(/^\(path\.ellipse \.\.\/o\/center: \[30 20\]\)$/)
		expect(source('rect')).toMatch(/^\(path\.rect \[\(- .*\/0 30\) \(- .*\/1 20\)\] \[60 40\]\)$/)
	})
})

describe('a handle, with the other side going the other way', () => {
	const pull = (src: string, index: number, to: Vec, how: { symmetric?: boolean; even?: boolean }) => {
		const root = parse(`{c = ${src}}`)
		const handle = gripAt(root, env, ROW)!.handles[index]!
		return print(bound((changed(root, env, ROW, handle.to(to, handle.at!, how)).ast as LetAST))[0]![1])
	}

	it('keeps the middle of a line, and of a capsule', () => {
		expect(pull('(path.line [0 0] [100 0])', 1, [120, 10], { symmetric: true })).toBe('(path.line [-20 -10] [120 10])')
		expect(pull('(path.line [0 0] [100 0])', 0, [-20, 10], { symmetric: true })).toBe('(path.line [-20 10] [120 -10])')
		expect(pull('(path.capsule [0 0] [100 0] 5)', 1, [120, 10], { symmetric: true })).toBe('(path.capsule [-20 -10] [120 10] 5)')
		expect(pull('(path.line [0 0] [100 0])', 1, [120, 10], {})).toBe('(path.line [0 0] [120 10])')
	})

	it('goes by even angles around the middle, with Shift as well', () => {
		const grip = gripAt(parse('{c = (path.line [0 0] [100 0])}'), env, ROW)!
		const handle = grip.handles[1]!
		expect(handle.middle).toEqual([50, 0])
		const [{ value: end }, { value: start }] = handle.to([90, 45], [100, 0], { symmetric: true, even: true }) as { value: Vec }[]
		expect(end![0] - 50).toBeCloseTo(end![1])
		expect(start![0]).toBeCloseTo(100 - end![0])
		expect(start![1]).toBeCloseTo(-end![1])
	})

	it('keeps the middle of a square', () => {
		const SQUARE = '(path.square [0 0] 100)'
		expect(pull(SQUARE, 0, [120, 50], { symmetric: true })).toBe('(path.square [-20 -20] 140)')
		expect(pull(SQUARE, 1, [50, 120], { symmetric: true })).toBe('(path.square [-20 -20] 140)')
		expect(pull(SQUARE, 3, [120, 110], { symmetric: true })).toBe('(path.square [-20 -20] 140)')
		expect(pull(SQUARE, 2, [-20, -10], { symmetric: true })).toBe('(path.square [-20 -20] 140)')
		expect(pull(SQUARE, 0, [120, 50], {})).toBe('(path.square [0 0] 120)')
	})

	it('moves both foci, but not what it goes through', () => {
		expect(pull('(path.ellipseFromFoci [0 0] [100 0] [50 30])', 1, [120, 0], { symmetric: true })).toBe(
			'(path.ellipseFromFoci [-20 0] [120 0] [50 30])'
		)
	})
})

describe('the part of a row that a handle is', () => {
	const of = (src: string, index: number) => {
		const root = parse(`{c = ${src}}`)
		const rows = rowsOfHandle(root, env, ROW, gripAt(root, env, ROW)!.handles[index]!)
		return rows.length === 0 ? null : rows.length === 1 ? rows[0] : rows
	}

	it('is the place it is of', () => {
		expect(of('(path.ngon [0 0] 20 5)', 3)).toBe('binding:c/arg0')
		expect(of('(path.cubic [0 0] [1 1] [2 2] [3 3])', 0)).toBe('binding:c/arg1')
		expect(of('(path.line [0 0] [9 9])', 1)).toBe('binding:c/arg1')
		expect(of('(path.rect [0 0] [10 10])', 4)).toBe('binding:c/arg0')
	})

	it('is the one number it is about', () => {
		expect(of('(path.rect [0 0] [10 20])', 2)).toBe('binding:c/arg1/0')
		expect(of('(path.rect [0 0] [10 20])', 3)).toBe('binding:c/arg1/1')
	})

	it('is the one thing dragging it changes', () => {
		expect(of('(path.circle [0 0] 20)', 0)).toBe('binding:c/arg1')
		expect(of('(path.ngon [0 0] 20 5)', 1)).toBe('binding:c/arg2')
		expect(of('(path.star [0 0] 20 10 5)', 1)).toBe('binding:c/arg2')
		expect(of('(path.ellipse [0 0] [20 10])', 0)).toBe('binding:c/arg1/0')
		expect(of('(path.ellipse [0 0] [20 10])', 1)).toBe('binding:c/arg1/1')
		expect(of('(path.clothoid [0 0] 30 100 0 0)', 1)).toBe('binding:c/arg1')
		expect(of('(path.capsule [0 0] [50 0] 10)', 2)).toBe('binding:c/arg2')
	})

	it('is both of what a tip is, how far out and which way', () => {
		expect(of('(path.ngon [0 0] 20 5 30)', 0)).toEqual(['binding:c/arg1', 'binding:c/arg3'])
		expect(of('(path.star [0 0] 20 10 5 30)', 0)).toEqual(['binding:c/arg1', 'binding:c/arg4'])
		expect(of('(path.spiral [0 0] 0 20 3)', 1)).toEqual(['binding:c/arg2', 'binding:c/arg3'])
		expect(of('(style (path.ngon [0 0] 20 5 30) fill: "red")', 0)).toEqual(['binding:c/arg0/arg1', 'binding:c/arg0/arg3'])
	})

	it('is only as far out, if which way is not written', () => {
		expect(of('(path.ngon [0 0] 20 5)', 0)).toBe('binding:c/arg1')
		expect(of('(path.star [0 0] 20 10 5)', 0)).toBe('binding:c/arg1')
	})

	it('is nothing, if what it changes is no one thing', () => {
		expect(of('(path.rect [0 0] [10 20])', 5)).toBeNull()
	})

	it('is nothing, if it is not written', () => {
		const direction = gripAt(parse('{c = (path.ellipse [0 0] [20 10])}'), env, ROW)!.handles.findIndex(h => h.kind === 'direction')
		expect(of('(path.ellipse [0 0] [20 10])', direction)).toBeNull()
		expect(of('(path.ellipse [0 0] [20 10] 30)', direction)).toBe('binding:c/arg2')
	})

	it('goes inside what is around it', () => {
		expect(of('(style (path.circle [0 0] 20) fill: "red")', 0)).toBe('binding:c/arg0/arg1')
		expect(of('(style (path.circle [0 0] 20) fill: "red")', 1)).toBe('binding:c/arg0/arg0')
	})
})

describe('the control across an anchor', () => {
	const AT: Vec = [0, 0]

	it('stays with Option', () => {
		expect(otherControl(AT, [0, 10], [-10, 0], [10, 0], { symmetric: true })).toEqual([-10, 0])
	})

	it('stays in line and as long, with Command', () => {
		const [x, y] = otherControl(AT, [0, 40], [-10, 0], [10, 0], { smooth: true })
		expect(x).toBeCloseTo(0)
		expect(y).toBeCloseTo(-10)
	})

	it('mirrors what mirrored it', () => {
		const [x, y] = otherControl(AT, [0, 40], [-10, 0], [10, 0])
		expect(x).toBeCloseTo(0)
		expect(y).toBeCloseTo(-40)
	})

	it('stays in line, as long as it was, if it was not as long', () => {
		const [x, y] = otherControl(AT, [0, 40], [-5, 0], [10, 0])
		expect(x).toBeCloseTo(0)
		expect(y).toBeCloseTo(-5)
	})

	it('stays where it is, if that was a corner', () => {
		expect(otherControl(AT, [0, 40], [0, 10], [10, 0])).toEqual([0, 10])
		expect(otherControl(AT, [0, 40], [10, 5], [10, 0])).toEqual([10, 5])
	})

	it('can make a corner smooth again, with Command', () => {
		const [x, y] = otherControl(AT, [10, 0], [0, 10], [10, 0], { smooth: true })
		expect(x).toBeCloseTo(-10)
		expect(y).toBeCloseTo(0)
	})
})

describe('a control of a path', () => {
	const SMOOTH = '(path.d "M0,0 C10,0 20,0 30,0 C40,0 50,0 60,0")'
	const CORNER = '(path.d "M0,0 C10,0 30,20 30,0 C45,10 50,0 60,0")'
	const OPEN = '(path.d "M0,0 C10,0 20,0 30,0")'
	const pull = (src: string, index: number, to: Vec, how = {}) => {
		const root = parse(`{c = ${src}}`)
		const handle = gripAt(root, env, ROW)!.handles[index]!
		const [{ value }] = handle.to(to, handle.at!, how) as [{ value: string }]
		return value.match(/-?[\d.]+(?:e-?\d+)?/g)!.map(n => Math.round(Number(n)))
	}
	const INTO = 2

	it('takes the other with it', () => {
		const numbers = pull(SMOOTH, INTO, [20, 10])
		expect(numbers.slice(2, 6)).toEqual([10, 0, 20, 10])
		expect(numbers.slice(8, 10)).toEqual([40, -10])
	})

	it('breaks with Option', () => {
		const numbers = pull(SMOOTH, INTO, [20, 10], { symmetric: true })
		expect(numbers.slice(4, 6)).toEqual([20, 10])
		expect(numbers.slice(8, 10)).toEqual([40, 0])
	})

	it('stays in line and as long, with Command', () => {
		const numbers = pull(SMOOTH, INTO, [0, 0], { smooth: true })
		expect(numbers.slice(4, 6)).toEqual([0, 0])
		expect(numbers.slice(8, 10)).toEqual([40, 0])
	})

	it('leaves a corner as it is', () => {
		const numbers = pull(CORNER, INTO, [20, 10])
		expect(numbers.slice(8, 10)).toEqual([45, 10])
	})

	it('has nothing to take at an end', () => {
		expect(pull(OPEN, 1, [5, 5]).slice(2, 4)).toEqual([5, 5])
	})

	it('goes by even angles around its anchor, with Shift', () => {
		const handle = gripAt(parse(`{c = ${SMOOTH}}`), env, ROW)!.handles[INTO]!
		expect(handle.pivot).toEqual([30, 0])
		const numbers = pull(SMOOTH, INTO, [20, 8], { even: true })
		expect(Math.abs(numbers[4]! - 30)).toBe(Math.abs(numbers[5]!))
	})
})

describe('what a pen is drawing, its last control pulled', () => {
	const pathOf = (src: string) => (evaluate(parse(src), env).value as { path: Parameters<typeof anchorsAlong>[1] }).path
	const anchors = [{ at: [0, 0] as Vec, out: [1, 1] as Vec }, { at: [10, 0] as Vec, out: [15, 0] as Vec }]
	const moved = pathOf('(path.cubic [0 0] [1 1] [10 5] [10 0])')

	it('takes how it goes on with it', () => {
		const out = anchorsAlong(anchors, moved)[1]!.out!
		expect(out[0]).toBeCloseTo(10)
		expect(out[1]).toBeCloseTo(-5)
	})

	it('breaks with Option', () => {
		expect(anchorsAlong(anchors, moved, { symmetric: true })[1]!.out).toEqual([15, 0])
	})
})

describe('a place that no argument says', () => {
	/** A circle drawn out from the place called `name`, with what it is on then changed by `after`. */
	const follows = (src: string, name: string, after: string, nth = 0) => {
		const root = parse(`{o = ${src}}`) as LetAST
		const places = snapPointsOf(root, env, sceneOf(root, env)).filter(p => p.label === name && p.code !== undefined)
		const snap = places[nth]
		expect(snap, `${src} has a ${name} to refer to`).toBeDefined()
		const next = drawnFrom(root, env, 'x', 'ellipse', snap!, [500, 500], false)
		const written = print(bound(next).at(-1)![1])
		expect(written).toMatch(/\/o\//)
		const centerOf = (ast: AST) => {
			const grip = gripAt(ast, env, 'binding:x')!
			return grip.handles.find(h => h.name === 'center')!.at!
		}
		const [x, y] = centerOf(next)
		expect(evaluate(next, env).diagnostics).toEqual([])
		expect(x).toBeCloseTo(snap!.at[0], 6)
		expect(y).toBeCloseTo(snap!.at[1], 6)
		const moved = parse(print(next).replace(src, after)) as LetAST
		const others = snapPointsOf(moved, env, sceneOf(moved, env)).filter(p => p.label === name && p.code !== undefined)
		const [mx, my] = centerOf(moved)
		expect(mx).toBeCloseTo(others[nth]!.at[0], 6)
		expect(my).toBeCloseTo(others[nth]!.at[1], 6)
		expect([mx, my]).not.toEqual([x, y])
	}

	it('follows a vertex of a polygon', () => {
		follows('(path.ngon [10 20] 50 5)', 'vertex', '(path.ngon [10 20] 80 5)', 2)
		follows('(path.ngon [10 20] 50 5 30)', 'vertex', '(path.ngon [10 20] 50 5 60)', 2)
		follows('(path.ngon [10 20] 50 5)', 'vertex', '(path.ngon [10 20] 50 7)', 3)
	})

	it('follows a vertex of a star, out or in', () => {
		follows('(path.star [10 20] 50 25 5)', 'vertex', '(path.star [10 20] 80 25 5)', 2)
		follows('(path.star [10 20] 50 25 5)', 'vertex', '(path.star [10 20] 50 30 5)', 3)
		follows('(path.star [10 20] 50 25 5 30)', 'vertex', '(path.star [10 20] 50 25 5 60)', 3)
	})

	it('follows the corners, the sides and the middle of a rect', () => {
		for (const name of ['top right', 'bottom left', 'bottom right', 'left', 'top', 'right', 'bottom', 'center']) {
			follows('(path.rect [10 20] [100 50])', name, '(path.rect [10 20] [200 80])')
			follows('(path.roundRect [10 20] [100 50] 5)', name, '(path.roundRect [10 20] [200 80] 5)')
		}
	})

	it('follows the corners and the middle of a square', () => {
		for (const name of ['top right', 'bottom left', 'bottom right', 'right', 'bottom', 'center']) {
			follows('(path.square [10 20] 100)', name, '(path.square [10 20] 200)')
		}
	})

	describe('with what is drawn on the far side of it', () => {
		const drawnOn = (from: string, name: string, to: Vec, tool: ShapeTool = 'rect', center = false) => {
			const root = parse(`{o = ${from}}`) as LetAST
			const snap = snapPointsOf(root, env, sceneOf(root, env)).find(p => p.label === name)!
			return { snap, next: drawnFrom(root, env, 'x', tool, snap, to, false, 0.01, center) }
		}
		const cornerOf = (ast: AST) => gripAt(ast, env, 'binding:x')!.handles.find(h => h.name === 'top left')!.at!

		it('stays on the place it snapped to, drawn up from a corner', () => {
			const { snap, next } = drawnOn('(path.rect [10 20] [200 60])', 'top right', [260, -30])
			const written = print(bound(next).at(-1)![1])
			expect(written).toMatch(/\/o\//)
			expect(evaluate(next, env).diagnostics).toEqual([])
			expect(cornerOf(next)).toEqual([snap.at[0], snap.at[1] - 50])
			const moved = parse(print(next).replace('[10 20] [200 60]', '[10 20] [300 90]')) as LetAST
			expect(cornerOf(moved)).toEqual([310, 20 - 50])
		})

		it('stays on it, drawn left and up from what is its origin', () => {
			const { next } = drawnOn('(path.rect [100 100] [50 50])', 'top left', [70, 60])
			expect(print(bound(next).at(-1)![1])).toMatch(/^\(path\.rect \[\(- .*\/0 30\) \(- .*\/1 40\)\] \[30 40\]\)$/)
			const moved = parse(print(next).replace('[100 100] [50 50]', '[200 300] [50 50]')) as LetAST
			expect(cornerOf(moved)).toEqual([170, 260])
		})

		it('stays around it, drawn out from the center', () => {
			const { next } = drawnOn('(path.rect [10 20] [200 60])', 'top right', [240, 40], 'rect', true)
			expect(cornerOf(next)).toEqual([180, 0])
			const moved = parse(print(next).replace('[10 20] [200 60]', '[10 20] [300 90]')) as LetAST
			expect(cornerOf(moved)).toEqual([280, 0])
		})

		it('stays on it when the top is dragged, and goes with what it is on', () => {
			const { next } = drawnOn('(path.rect [10 20] [200 60])', 'top right', [260, -30])
			const handle = gripAt(next, env, 'binding:x')!.handles.find(h => h.name === 'top')!
			const dragged = changed(next, env, 'binding:x', handle.to([handle.at![0], handle.at![1] - 11], handle.at!)).ast as LetAST
			expect(print(bound(dragged)[0]![1])).toBe('(path.rect [10 20] [200 60])')
			const grip = gripAt(dragged, env, 'binding:x')!
			const bottom = grip.handles.find(h => h.name === 'bottom right')!.at!
			expect(bottom).toEqual([260, 20])
		})

		it('is the same for a rect with round corners', () => {
			const { next } = drawnOn('(path.rect [10 20] [200 60])', 'top right', [260, -30], 'roundRect')
			expect(print(bound(next).at(-1)![1])).toMatch(/\/o\//)
			expect(evaluate(next, env).diagnostics).toEqual([])
		})
	})

	it('follows the middle of a line', () => {
		follows('(path.line [0 0] [100 40])', 'middle', '(path.line [0 0] [200 40])')
	})

	it('follows the sides of a turned ellipse', () => {
		for (const name of ['right', 'bottom', 'left', 'top']) {
			follows('(path.ellipse [10 20] [40 20] 30)', name, '(path.ellipse [10 20] [40 20] 60)')
		}
	})

	it('follows the ends of an arc and a fan, and of a spiral', () => {
		follows('(path.arc [10 20] 50 10 100)', 'start', '(path.arc [10 20] 50 40 100)')
		follows('(path.arc [10 20] 50 10 100)', 'end', '(path.arc [10 20] 80 10 100)')
		follows('(path.fan [10 20] 20 50 10 100)', 'start', '(path.fan [10 20] 20 80 10 100)')
		follows('(path.fan [10 20] 20 50 10 100)', 'end', '(path.fan [10 20] 20 50 10 130)')
		follows('(path.spiral [10 20] 5 50 2.25)', 'end', '(path.spiral [10 20] 5 50 2.5)')
	})

	it('can have a handle linked to it, by coming exactly to it', () => {
		const root = parse('{o = (path.ngon [10 20] 50 5 30) p = [0 0] c = (path.line p [300 300])}') as LetAST
		const snap = snapPointsOf(root, env, sceneOf(root, env)).filter(p => p.label === 'vertex' && p.code !== undefined)[2]!
		const handle = gripAt(root, env, ROW)!.handles.find(h => h.place === 1)!
		const { ast } = changed(root, env, ROW, handle.to(snap.at, handle.at!))
		expect(print(linked(ast!, env, ROW, 1, snap)!)).toMatch(/path\.line p \[.*\/o\//)
	})

	it('is only a value at the end of a clothoid, which no code can say', () => {
		const grip = gripAt(parse('{c = (path.clothoid [0 0] 0 100 0 0.01)}'), env, ROW)!
		expect(grip.snaps!.points![0]!.code).toBeUndefined()
	})
})

describe('how far round something is', () => {
	const optionsOf = (src: string, arg: number) => numberOptionsAt(viewOf(parse(src), env).slots[arg]!)

	it.each([
		['(path.ngon [0 0] 10 5 30)', 3],
		['(path.star [0 0] 10 5 5 30)', 4],
		['(path.ellipse [0 0] [10 10] 30)', 2],
		['(path.arc [0 0] 10 0 90)', 2],
		['(path.arc [0 0] 10 0 90)', 3],
		['(path.fan [0 0] 5 10 0 90)', 3],
		['(path.fan [0 0] 5 10 0 90)', 4],
		['(path.clothoid [0 0] 30 10 0 0)', 1],
		['(mat2d.rotate 30)', 0],
		['(color.hsl 30 1 1)', 0],
	])('is in degrees, in %s at %i', (src, arg) => {
		expect(optionsOf(src, arg).suffix).toBe('°')
	})

	it('still has its icon', () => {
		expect(textOf(viewOf(parse('(path.ngon [0 0] 10 5 30)'), env).slots[3]!.expected?.meta?.get('icon'))).toBe('ph:angle')
	})

	it('says so out on its own, along with that icon', () => {
		const root = parse('{c = (path.ngon [0 0] 10 5 30)}')
		expect(dimensionAt(root, env, ROW, { route: [3] })!.options).toMatchObject({ suffix: '°', leftIcon: 'ph:angle' })
	})

	it('is not what anything else is', () => {
		expect(optionsOf('(path.ngon [0 0] 10 5 30)', 1).suffix).toBeUndefined()
	})
})

describe('what moves an outline out from a path', () => {
	const handleOf = (src: string) => gripAt(parse(`{c = ${src}}`), env, ROW)!.handles.find(h => h.name === 'distance')!

	it('points the two ways it can go, from the start', () => {
		expect(handleOf('(path.offset (path.circle [0 0] 10) 5)').along).toBe(true)
		expect(handleOf('(path.offsetStroke (path.circle [0 0] 10) 5)').along).toBe(true)
	})
	const CURVE = '(path.cubic [0 0] [80 0] [120 60] [120 200])'
	const SHAPES = [
		`(path.offset ${CURVE} 25)`,
		`(path.offset ${CURVE} -25)`,
		'(path.offset (path.circle [0 0] 100) 25)',
		'(path.offset (path.ellipse [0 0] [100 40] 30) 25)',
		'(path.offset (path.rect [0 0] [100 60]) 25)',
	]
	const pathOf = (src: string) => (evaluate(parse(src), env).value as { path: Parameters<typeof nearestOn>[0] }).path

	it.each(SHAPES)('is on the outline of %s', src => {
		expect(nearestOn(pathOf(src), handleOf(src).at as unknown as [number, number])!.distance).toBeLessThan(0.1)
	})

	it.each(SHAPES)('faces along the normal of what %s comes from', src => {
		const handle = handleOf(src)
		const inner = src.slice('(path.offset '.length, src.lastIndexOf(' '))
		const source = pathOf(inner)
		const near = nearestOn(source, handle.at as unknown as [number, number])!
		const radians = (handle.angle! * Math.PI) / 180
		const [tx, ty] = tangentOf(source, near.location)
		expect(Math.abs(tx * Math.cos(radians) + ty * Math.sin(radians))).toBeLessThan(0.01)
	})

	it('changes by how far along that it goes, whichever way it is dragged', () => {
		const src = `(path.offset ${CURVE} 25)`
		const handle = handleOf(src)
		const radians = (handle.angle! * Math.PI) / 180
		const [{ value }] = handle.to(
			[handle.at![0] + Math.cos(radians) * 10 - Math.sin(radians) * 50, handle.at![1] + Math.sin(radians) * 10 + Math.cos(radians) * 50],
			handle.at!
		) as [{ value: number }]
		expect(value).toBeCloseTo(35)
	})

	it('goes half as far for a stroke, either side', () => {
		const handle = handleOf('(path.offsetStroke (path.circle [0 0] 100) 40)')
		expect(Math.hypot(handle.at![0], handle.at![1])).toBeCloseTo(120)
	})

	it('has nothing to go out from, on an empty path', () => {
		expect(gripAt(parse('{c = (path.offset (path.polygon) 5)}'), env, ROW)!.handles).toEqual([])
	})
})

describe('the tip of a polygon or a star', () => {
	it.each(['(path.ngon [0 0] 20 5 30)', '(path.star [0 0] 20 10 5 30)'])('goes anywhere on the plane, so is round, on %s', src => {
		const tip = gripAt(parse(`{c = ${src}}`), env, ROW)!.handles[0]!
		expect(tip.kind).toBe('point')
		expect(tip.corner).toBeUndefined()
		expect(tip.angle).toBeUndefined()
	})

	it('is still somewhere to start from, with a tool in hand', () => {
		expect(onlyShapes(gripAt(parse('{c = (path.ngon [0 0] 20 5)}'), env, ROW)!.handles[0]!)).toBe(false)
	})

	it('is not what a way of its own is', () => {
		expect(onlyShapes(gripAt(parse('{c = (path.clothoid [0 0] 30 100 0 0)}'), env, ROW)!.handles[1]!)).toBe(true)
	})
})

describe('what is about a corner', () => {
	const cornered = (src: string) =>
		gripAt(parse(`{c = ${src}}`), env, ROW)!.handles.filter(h => h.corner === true).map(h => h.name ?? h.kind)

	it('is square on a rect and a square', () => {
		const corners = ['bottom left', 'bottom right', 'top left', 'top right']
		expect(cornered('(path.rect [0 0] [10 10])').sort()).toEqual(corners)
		expect(cornered('(path.square [0 0] 10)').sort()).toEqual(['bottom right', 'top left'])
	})

	it('is how round it is, as well', () => {
		expect(cornered('(path.roundRect [0 0] [40 40] 5)')).toContain('arrow')
		expect(cornered('(path.superellipse [0 0] [20 20] 2)')).toEqual(['arrow'])
	})

	it('is not what is round', () => {
		expect(cornered('(path.circle [0 0] 10)')).toEqual([])
		expect(cornered('(path.ngon [0 0] 10 5)')).toEqual([])
	})
})

describe('what goes out and around, of which only one can change', () => {
	const vertex = (root: AST) => gripAt(root, env, ROW)!.handles.find(h => h.name === 'vertex')!
	const dragged = (src: string, to: readonly [number, number]) => {
		const root = parse(src)
		const handle = vertex(root)
		const { ast, problem } = changed(root, env, ROW, handle.to(to as Vec, handle.at!))
		return { problem, source: ast && print(ast) }
	}

	it('goes straight out, where it cannot turn', () => {
		// Facing +X, from 50 out. Across does nothing, and along is as far as it goes.
		const { problem, source } = dragged('{c = (path.ngon [0 0] 50 5 @0)}', [70, 40])
		expect(problem).toBeNull()
		expect(source).toBe('{main = [c = (path.ngon [0 0] 70 5 @0)]}')
	})

	it('goes straight out at the angle it is pinned at', () => {
		const { source } = dragged('{c = (path.ngon [0 0] 50 5 @90)}', [30, 80])
		expect(source).toBe('{main = [c = (path.ngon [0 0] 80 5 @90)]}')
	})

	it('goes by what it refers to being pinned, as well', () => {
		const { source } = dragged('{a = @0 c = (path.ngon [0 0] 50 5 a)}', [70, 40])
		expect(source).toBe('{a = @0 main = [c = (path.ngon [0 0] 70 5 a)]}')
	})

	it('only turns, where it cannot go out', () => {
		const { source } = dragged('{c = (path.ngon [0 0] @50 5 0)}', [0, 50])
		expect(source).toBe('{main = [c = (path.ngon [0 0] @50 5 90)]}')
	})

	it('does not go in past nothing', () => {
		const { source } = dragged('{c = (path.ngon [0 0] 50 5 @0)}', [-20, 0])
		expect(source).toBe('{main = [c = (path.ngon [0 0] 0 5 @0)]}')
	})

	it('is the same for a star', () => {
		const { source } = dragged('{c = (path.star [0 0] 50 20 5 @0)}', [70, 40])
		expect(source).toBe('{main = [c = (path.star [0 0] 70 20 5 @0)]}')
	})

	it('does both where it can, and says so where it can do neither', () => {
		expect(dragged('{c = (path.ngon [0 0] 50 5 0)}', [0, 70]).source).toBe('{main = [c = (path.ngon [0 0] 70 5 90)]}')
		expect(dragged('{c = (path.ngon [0 0] 50 5)}', [0, 70]).source).toBe('{main = [c = (path.ngon [0 0] 70 5 90)]}')
		expect(dragged('{c = (path.ngon [0 0] @50 5 @0)}', [0, 70]).problem).toBe('locked')
	})

	it('is the same for the end of a spiral', () => {
		const end = (src: string, to: Vec) => {
			const root = parse(src)
			const handle = gripAt(root, env, ROW)!.handles.find(h => h.name === 'end')!
			const { ast } = changed(root, env, ROW, handle.to(to, handle.at!))
			return ast && print(ast)
		}
		expect(end('{c = (path.spiral [0 0] 0 50 @1)}', [70, 40])).toBe('{main = [c = (path.spiral [0 0] 0 70 @1)]}')
		expect(end('{c = (path.spiral [0 0] 0 @50 1)}', [0, 50])).toBe('{main = [c = (path.spiral [0 0] 0 @50 1.25)]}')
	})
})

describe('a place of which only a part can change', () => {
	const moved = (src: string, to: Vec) => {
		const root = parse(src)
		const { ast, problem } = changed(root, env, ROW, [{ route: [0], value: to }])
		return { problem, source: ast && print(ast) }
	}

	it('goes as far as it can', () => {
		expect(moved('{c = (path.circle [@1 2] 5)}', [7, 8]).source).toBe('{main = [c = (path.circle [@1 8] 5)]}')
		expect(moved('{c = (path.circle [1 @2] 5)}', [7, 8]).source).toBe('{main = [c = (path.circle [7 @2] 5)]}')
	})

	it('says why, if it cannot go at all', () => {
		expect(moved('{c = (path.circle @[1 2] 5)}', [7, 8]).problem).toBe('locked')
		expect(moved('{c = (path.circle [@1 @2] 5)}', [7, 8]).problem).toBe('locked')
	})
})

describe('what refers to a place on something else', () => {
	const REF = 'b = (path.circle [(+ ../../../a/center:/0 ../../../a/radius:) ../../a/center:/1] 30)'
	const moved = (a: string) => {
		const root = parse(`{a = ${a} ${REF}}`)
		const { ast } = changed(root, env, 'binding:b', [{ route: [0], value: [170, 120] }])
		return ast && print(bound((ast as LetAST))[0]![1])
	}

	it('moves that, and leaves what it is', () => {
		expect(moved('(path.circle [100 100] 50)')).toBe('(path.circle [120 120] 50)')
	})

	it('changes what it is only where it cannot move', () => {
		expect(moved('(path.circle @[100 100] 50)')).toBe('(path.circle @[100 100] 70)')
		expect(moved('(path.circle [@100 100] 50)')).toBe('(path.circle [@100 120] 70)')
	})
})

describe('what pulls one side of a box', () => {
	it('is a grip, and a corner is not', () => {
		const grips = boxHandlesOf([[0, 0], [10, 10]], { even: false, scaled: () => [] }).map(({ corner, grip }) => [corner, grip])
		expect(grips).toContainEqual([false, true])
		expect(grips).toContainEqual([true, false])
		expect(grips.every(([corner, grip]) => corner !== grip)).toBe(true)
	})

	it('is what an ellipse has on its axes', () => {
		const { handles } = gripAt(parse('{c = (path.ellipse [0 0] [20 10])}'), env, ROW)!
		expect(handles.filter(({ grip }) => grip).map(({ name }) => name).sort()).toEqual(['bottom', 'right'])
	})
})

describe('the box around what says how far round it is', () => {
	const boxOf = (source: string) => gripAt(parse(`{c = ${source}}`), env, ROW)!.box!

	it('goes round with it', () => {
		expect(boxOf('(path.ngon [0 0] 20 5 30)').angle).toBe(30)
		expect(boxOf('(path.star [0 0] 20 10 5 30)').angle).toBe(30)
		expect(boxOf('(path.ellipse [0 0] [20 10] 30)').angle).toBe(30)
	})

	it('is straight if it is not round at all, or does not say', () => {
		expect(boxOf('(path.ngon [0 0] 20 5)').angle).toBeUndefined()
		expect(boxOf('(path.ngon [0 0] 20 5 0)').angle).toBeUndefined()
	})

	it('still only goes by one scale, around where it is held', () => {
		const { even, scaled } = boxOf('(path.ngon [10 0] 20 5 30)')
		expect(even).toBe(true)
		expect(scaled(2, 2, [0, 0]).map(({ value }) => value)).toEqual([[20, 0], 40])
	})
})

describe('what turns something by the corners of its box', () => {
	const box: readonly [Vec, Vec] = [[-10, -10], [10, 10]]
	const turning = gripAt(parse('{c = (path.ngon [0 0] 10 5 0)}'), env, ROW)!.handles.find(({ rotates }) => rotates)!
	const angleOf = (changes: ReturnType<(typeof turning)['to']>) => changes[0]

	it('is one to each corner, each outside of that corner', () => {
		const turners = cornerTurners(box, 0, turning)
		expect(turners.map(({ at }) => at)).toEqual([[-10, -10], [-10, 10], [10, -10], [10, 10]])
		expect(turners.every(({ outsideCorner, rotates }) => outsideCorner && rotates)).toBe(true)
		expect(turners.every(({ heldOn }) => heldOn === undefined)).toBe(true)
	})

	it('turns nothing for being taken hold of, and then by as much as it is pulled round', () => {
		const corner = cornerTurners(box, 0, turning)[3]!
		const asIs = turning.to([10, 0], [10, 0])
		expect(angleOf(corner.to(corner.at!, corner.at!))).toEqual(angleOf(asIs))
		const quarter = turning.to([0, 10], [0, 10])
		const pulled = corner.to([-10, 10], corner.at!)
		expect(JSON.stringify(angleOf(pulled))).toBe(JSON.stringify(angleOf(quarter)))
	})
})

describe('what turns something around', () => {
	const rotating = (source: string) =>
		gripAt(parse(`{c = ${source}}`), env, ROW)!.handles.filter(({ kind }) => kind === 'direction').map(({ rotates }) => rotates === true)

	it('says so, and what says which way something goes does not', () => {
		expect(rotating('(path.ellipse [0 0] [20 10] 30)')).toEqual([true])
		expect(rotating('(mat2d.rotate 30)')).toEqual([true])
		expect(rotating('(path.ngon [0 0] 20 5)')).toEqual([true])
		expect(rotating('(path.star [0 0] 20 10 5 30)')).toEqual([true])
		expect(rotating('(line.at [10 0] 90)')).toEqual([true])
		expect(rotating('(path.clothoid [0 0] 30 100 0 0.01)')).toEqual([false])
	})

	it('turns only that, around its center, whether or not its angle was written', () => {
		const turn = (source: string, to: [number, number]) => {
			const root = parse(`{c = ${source}}`)
			const handle = gripAt(root, env, ROW)!.handles.find(({ rotates }) => rotates)!
			return print(changed(root, env, ROW, handle.to(to, handle.at!)).ast!)
		}
		expect(turn('(path.ngon [0 0] 20 5)', [0, 100])).toContain('(path.ngon [0 0] 20 5 90)')
		expect(turn('(path.star [0 0] 20 10 5 0)', [0, 100])).toContain('(path.star [0 0] 20 10 5 90)')
	})
})
