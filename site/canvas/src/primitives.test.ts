import { type AST, buildPrelude, type Env, evaluate, expandLadder, LetAST, parse, print } from '@glisp/lang'
import { numberOptionsAt, textOf, viewOf } from '@glisp/tweeq/structure'
import { describe, expect, it } from 'vitest'

import { iconOfPath, onlyShapes, type Vec, withGraphics } from './graphics'
import { anchorsAlong, changed, dimensionAt, dOfAnchors, dimensionsMoved, dimensionsOf, drawn, evenlyFrom, facesWhenDrawn, gripAt, nameFor, placesTakenBy, type ShapeTool, snapPointsOf, sceneOf } from './scene'

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
		return print(next.bindings[0]![1])
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
		expect(corner.at).toEqual([12, 12])
		expect(corner.to([17, 17], corner.at!)).toEqual([{ route: [2], value: 5 }])
		expect(corner.to([90, 90], corner.at!)).toEqual([{ route: [2], value: 20 }])
		expect(corner.to([0, 0], corner.at!)).toEqual([{ route: [2], value: 0 }])
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
			print(drawn(root, 'x', tool, [10, 10], [40, 50], false).bindings.at(-1)![1])
		expect(source('star')).toBe('(path.star [10 10] 50 22.5 5 53.13)')
		expect(source('capsule')).toBe('(path.capsule [10 10] [40 50] 12.5)')
		expect(source('spiral')).toBe('(path.spiral [10 10] 0 50 3)')
		expect(source('roundRect')).toBe('(path.roundRect [10 10] [30 40] 6)')
		expect(source('superellipse')).toBe('(path.superellipse [25 30] [15 20] 2)')
	})
})

describe('which way a polygon or a star faces', () => {
	const source = (root: AST) => print((root as LetAST).bindings.at(-1)![1])
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
		const [x, y] = firstVertex('(path.ngon [0 0] 10 4 angle=90)')
		expect(x).toBeCloseTo(0)
		expect(y).toBeCloseTo(10)
		const root = parse('{c = (path.ngon [0 0] 20 4 angle=90)}')
		const at = gripAt(root, env, ROW)!.handles[0]!.at!
		expect(at[0]).toBeCloseTo(0)
		expect(at[1]).toBeCloseTo(20)
		const { ast } = changed(root, env, ROW, [{ route: [3], value: 45 }])
		expect(source(ast!)).toBe('(path.ngon [0 0] 20 4 angle=45)')
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
		const src = '(style (path.ngon [0 0] 20 5) fill="red")'
		expect(pull(src, 0, [0, 30])).toBe('(style (path.ngon [0 0] 30 5 90) fill="red")')
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
		const source = print(drawn(root, 'x', 'capsule', [0, 0], [30, 40], true).bindings.at(-1)![1])
		expect(source).toMatch(/^\(path\.capsule \[0 0\] \[35\.3\d* 35\.3\d*\] 12\.5\)$/)
		expect(print(drawn(root, 'x', 'capsule', [0, 0], [30, 40], false).bindings.at(-1)![1])).toBe(
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
		expect(d.handles.map(h => [h.name, onlyShapes(h)])).toEqual([
			['anchor', false],
			['control', true],
			['control', true],
			['anchor', false],
		])
	})

	it('is how many, or how far, but not a corner or a vertex', () => {
		expect(shaping('(path.ngon [0 0] 20 5)')).toEqual([false, true, false])
		expect(shaping('(path.star [0 0] 20 10 5)')).toEqual([false, false, true, false])
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
		const after = anchorsAlong(anchors, pathOf('(path.cubic [0 0] [2 5] [7 5] [9 0])'))
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
		expect(print(ast!)).toBe('{c = (path.ellipse [0 0] [20 10] 90)}')
		const [{ value }] = handle.to([30, 28], handle.at!, { even: true }) as [{ value: number }]
		expect(value).toBe(45)
	})

	it('can be said where its sides are by its numbers only if it is not turned', () => {
		const coded = (src: string) => gripOfSrc(src).snaps!.points!.filter(p => p.code !== undefined).length
		expect(coded('(path.ellipse [0 0] [20 10])')).toBe(4)
		expect(coded('(path.ellipse [0 0] [20 10] 30)')).toBe(0)
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
