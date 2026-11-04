import { buildPrelude, type Env, evaluate, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { iconOfPath, isPath, type Vec, withGraphics } from './graphics'
import { changed, gripAt, rowsWithin, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const scene = (src: string) =>
	sceneOf(parse(src), env).map(({ row, draw }) => `${row} ${draw}`)

describe('path', () => {
	it('makes paths that a type can tell', () => {
		expect(isPath(evaluate(parse('(path.circle [0 0] 10)'), env).value)).toBe(true)
		expect(evaluate(parse('(: 1 path)'), env).value).toEqual({ curves: [] })
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
		expect(icon('(path.rect [100 100] [900 900])')).toBe(small)
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

	it('leaves out what is bypassed, which can still be referred to', () => {
		expect(scene('{c = #_(path.circle [0 0] 1) d = c}')).toEqual(['binding:d path'])
	})
})

describe('rowsWithin', () => {
	const scene = sceneOf(
		parse('{a = (path.rect [0 0] [10 10]) b = (path.rect [20 20] [30 30]) p = (: [50 50] point)}'),
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

	it('take a rect by its corners, edges and center', () => {
		const source = '{c = (path.rect [0 0] [10 10])}'
		expect(pulled(source, 0, [-5, 99])).toBe('{c = (path.rect [-5 0] [10 10])}')
		expect(pulled(source, 3, [99, 20])).toBe('{c = (path.rect [0 0] [10 20])}')
		expect(pulled(source, 4, [15, 15])).toBe('{c = (path.rect [10 10] [20 20])}')
		expect(pulled(source, 6, [20, -5])).toBe('{c = (path.rect [0 -5] [20 10])}')
		expect(pulled(source, 7, [-5, 20])).toBe('{c = (path.rect [-5 0] [10 20])}')
	})

	it('take a point of as many as there are', () => {
		const source = '{c = (path.polyline [0 0] [1 1] [2 2])}'
		expect(kinds(source)).toEqual(['point', 'point', 'point'])
		expect(pulled(source, 2, [5, 5])).toBe('{c = (path.polyline [0 0] [1 1] [5 5])}')
	})

	it('count the sides of an ngon by how far round', () => {
		const source = '{c = (path.ngon [0 0] 10 6)}'
		expect(kinds(source)).toEqual(['arrow', 'dia', 'translate'])
		expect(pulled(source, 1, [0, 50])).toBe('{c = (path.ngon [0 0] 10 4)}')
	})

	it('turn the ends of an arc by the short way', () => {
		const source = '{c = (path.arc [0 0] 10 170 200)}'
		expect(pulled(source, 2, [-10, -1])).toMatch(/\(path\.arc \[0 0\] 10 170 18\d\.\d+\)/)
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
		expect(move('{c = (path.rect [0 0] [10 10])}')).toBe('{c = (path.rect [10 20] [20 30])}')
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
