import { buildPrelude, check, type Env, evaluate, type LetAST, print } from '@glisp/lang'
import { bounds } from 'pave/path/metrics'
import { bound, parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { type PathValue, withGraphics } from './graphics'
import { filtersFor, functionsOfProgram, wrappedAt } from '@glisp/tweeq/filters'
import { addablesIn, fillersAt, matching, withAdded, withFilled } from './quickAdd'
import { boundsOfRows } from './rows'
import { boundsOfRows as boxOfRows, drawsAt, graphPaperOf, rowsWithin, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const EMPTY = parse('{a = 1}') as LetAST
const all = addablesIn(EMPTY, env)
const names = (query: string) => matching(all, query).map(({ name }) => name)

describe('what can be added', () => {
	it('is all that can be seen, by group, with shapes first', () => {
		expect(all[0]!.group).toBe('Shapes')
		expect(new Set(matching(all, '').map(({ group }) => group))).toEqual(new Set(['Shapes', 'Guides', 'Canvas']))
		const groups = all.map(({ group }) => group)
		// Each is together, not coming back to one it has left.
		expect(groups.filter((group, i) => group !== groups[i - 1]).length).toBe(new Set(groups).size)
		for (const name of ['path.circle', 'path.offset', 'style']) {
			expect(all.map(item => item.name)).toContain(name)
		}
	})

	it('is only what gives something drawn', () => {
		for (const name of ['sin', 'color.rgb', 'mat2d.rotate', 'map', 'path.bounds']) {
			expect(all.map(item => item.name)).not.toContain(name)
		}
	})

	it('has each in a group of its own kind', () => {
		const group = (name: string) => all.find(item => item.name === name)!.group
		expect(group('path.star')).toBe('Shapes')
		expect(group('path.offset')).toBe('Path')
	})

	it('adds any of them, with the program still able to go on', () => {
		for (const { name } of all) {
			const added = withAdded(EMPTY, env, name, [100, 100])
			expect(added, name).not.toBeNull()
			expect(() => evaluate(added!.ast, env), name).not.toThrow()
			expect(() => check(added!.ast, env), name).not.toThrow()
		}
	})
})

describe('searching for it', () => {
	it('lists only what is drawn, with nothing asked', () => {
		const listed = matching(all, '').map(({ name }) => name)
		expect(listed).toContain('path.circle')
		for (const quiet of ['path.offset', 'path.d', 'style']) expect(listed).not.toContain(quiet)
		expect(matching(all, '   ')).toEqual(matching(all, ''))
	})

	it('finds all the rest, when asked', () => {
		for (const name of ['path.offset', 'path.d', 'style']) expect(names(name)).toContain(name)
	})

	it('has what is listed before what is not, of those alike', () => {
		expect(names('round')[0]).toBe('path.roundRect')
	})

	it('has nothing that is not drawn, whatever is asked', () => {
		expect(names('sin')).not.toContain('sin')
		expect(names('color.rgb')).toEqual([])
	})

	it('has what begins with it first', () => {
		expect(names('circ')[0]).toBe('path.circle')
		expect(names('Star')[0]).toBe('path.star')
	})

	it('finds by what is written, and by letters in order', () => {
		expect(names('path.off')).toContain('path.offset')
		expect(names('prrect')).toContain('path.roundRect')
	})

	it('has nothing for what is nothing', () => {
		expect(names('zzzzzz')).toEqual([])
	})
})

describe('adding it', () => {
	const added = (name: string, at: [number, number] = [200, 300]) => withAdded(EMPTY, env, name, at)!
	const value = (name: string) => {
		const { ast, row } = added(name)
		return evaluate(parse(row.replace('binding:', '')), { ast, parent: env, bindings: new Map(bound(ast).map(([n, v]) => [n, { ast: v, env }])) }).value
	}

	it('names it for what it is, and selects that', () => {
		expect(added('path.circle').row).toBe('binding:circle1')
		expect(print(added('path.circle').ast)).toContain('circle1 = (path.circle [200 300] 50)')
		expect(withAdded(parse('{circle1 = 1}') as LetAST, env, 'path.circle', [0, 0])!.row).toBe('binding:circle2')
	})

	it('goes in front of what is there', () => {
		const next = withAdded(parse('[a = (path.circle [0 0] 5)]') as LetAST, env, 'path.rect', [0, 0])!
		expect(print(next.ast)).toMatch(/^\{main = \[rect1 = /)
	})

	it.each(['path.circle', 'path.ellipse', 'path.rect', 'path.square', 'path.roundRect', 'path.superellipse', 'path.line', 'path.ngon', 'path.star', 'path.capsule'])(
		'puts %s around the place, big enough to see',
		name => {
			const [[left, top], [right, bottom]] = bounds((value(name) as PathValue).path)
			expect(right - left).toBeGreaterThan(50)
			expect((left + right) / 2).toBeCloseTo(200, -1)
			if (name !== 'path.line') expect(bottom - top).toBeGreaterThan(30)
			expect((top + bottom) / 2).toBeCloseTo(300, -1)
		}
	)

	it('gives what has no place what it would be at first', () => {
		expect(print(added('path.offset').ast)).toContain('offset1 = (path.offset (path.d "") 10)')
	})

	it.each([
		['point', 'point1 = ^point [200 300]', 'point'],
		['vec2.lerp', 'lerp1 = (vec2.lerp [150 300] [250 300] 0.5)', 'point'],
		['vec2.nudge', 'nudge1 = (vec2.nudge [200 300] [50 0])', 'point'],
		['line.fromPoints', 'line1 = (line.fromPoints [200 250] [200 350])', 'line'],
		['line.at', 'line1 = (line.at [200 300] 90)', 'line'],
		['ray.fromPoints', 'ray1 = (ray.fromPoints [200 300] [300 300])', 'ray'],
		['ray.at', 'ray1 = (ray.at [200 300] 0)', 'ray'],
		['rect.new', 'rect1 = (rect.new [150 250] [100 100])', 'frame'],
	])('adds %s as a guide where it is asked for', (name, written, draw) => {
		const { ast, row } = added(name)
		expect(print(ast)).toContain(written)
		expect(sceneOf(ast, env).filter(shape => shape.row === row).map(shape => shape.draw)).toEqual([draw])
	})

	it('has guides and the canvas be rows of their own, not taking what is selected', () => {
		const alone = all.filter(item => item.alone).map(({ name }) => name)
		expect(alone).toEqual(expect.arrayContaining(['point', 'line.fromPoints', 'line.at', 'ray.fromPoints', 'ray.at', 'rect.new', 'solid', 'graphPaper', 'axes']))
		expect(alone).not.toContain('path.circle')
	})

	describe('from what is selected', () => {
		const points = parse('[a = ^point [0 0] b = ^point [10 20] c = (path.circle [0 0] 5)]') as LetAST
		const from = (name: string, selected: readonly string[]) =>
			print(withAdded(points, env, name, [200, 300], selected)!.ast)

		it('goes through two points, by referring to them', () => {
			expect(from('line.fromPoints', ['binding:a', 'binding:b'])).toContain('line1 = (line.fromPoints a b)')
			expect(from('line.fromPoints', ['binding:b', 'binding:a'])).toContain('line1 = (line.fromPoints b a)')
		})

		it('goes between two points, by referring to them', () => {
			expect(from('vec2.lerp', ['binding:a', 'binding:b'])).toContain('lerp1 = (vec2.lerp a b 0.5)')
			expect(from('vec2.lerp', ['binding:a'])).toContain('lerp1 = (vec2.lerp a [200 300] 0.5)')
			const { ast, row } = withAdded(points, env, 'vec2.lerp', [200, 300], ['binding:a', 'binding:b'])!
			expect(sceneOf(ast, env).find(shape => shape.row === row)).toMatchObject({ draw: 'point', value: [5, 10] })
		})

		it('nudges a point, by referring to it', () => {
			expect(from('vec2.nudge', ['binding:b'])).toContain('nudge1 = (vec2.nudge b [50 0])')
			const { ast, row } = withAdded(points, env, 'vec2.nudge', [200, 300], ['binding:b'])!
			expect(sceneOf(ast, env).find(shape => shape.row === row)).toMatchObject({ draw: 'point', value: [60, 20] })
		})

		it('keeps the points as they are', () => {
			const written = from('line.fromPoints', ['binding:a', 'binding:b'])
			expect(written).toContain('a = ^point [0 0]')
			expect(written).toContain('b = ^point [10 20]')
		})

		it('goes on from one point to where it is asked for', () => {
			expect(from('line.fromPoints', ['binding:a'])).toContain('line1 = (line.fromPoints a [200 300])')
			expect(from('line.at', ['binding:a'])).toContain('line1 = (line.at a 90)')
			expect(from('rect.new', ['binding:a'])).toContain('rect1 = (rect.new a [100 100])')
		})

		it('has no more of them than there is a place for', () => {
			expect(from('line.at', ['binding:b', 'binding:a'])).toContain('line1 = (line.at b 90)')
			expect(from('point', ['binding:a'])).toContain('point1 = ^point [200 300]')
		})

		it('leaves out what is not a point', () => {
			expect(from('line.fromPoints', ['binding:c'])).toContain('(line.fromPoints [200 250] [200 350])')
			expect(from('line.fromPoints', ['binding:c', 'binding:a'])).toContain('(line.fromPoints a [200 300])')
		})

		it('comes to the line through them, and follows when one moves', () => {
			const { ast } = withAdded(points, env, 'line.fromPoints', [200, 300], ['binding:a', 'binding:b'])!
			expect(sceneOf(ast, env).find(({ row }) => row === 'binding:line1')!.value).toEqual([[0, 0], [10, 20]])
			const moved = parse(print(ast).replace('[10 20]', '[30 0]'))
			expect(sceneOf(moved, env).find(({ row }) => row === 'binding:line1')!.value).toEqual([[0, 0], [30, 0]])
		})
	})

	it('lists the guides and the canvas with nothing asked', () => {
		const listed = matching(all, '').map(({ name }) => name)
		for (const name of ['point', 'vec2.lerp', 'line.fromPoints', 'line.at', 'rect.new', 'solid', 'graphPaper', 'axes']) expect(listed).toContain(name)
	})

	it('has a solid come in at the back, and a graph paper in front of it', () => {
		const start = parse('[a = (path.circle [0 0] 5)]') as LetAST
		const behind = withAdded(start, env, 'solid', [0, 0])!
		expect(print(behind.ast)).toMatch(/^\{main = \[a = .*solid1 = \(solid /)
		expect(behind.row).toBe('binding:solid1')
		const both = withAdded(behind.ast, env, 'graphPaper', [0, 0])!
		expect(print(both.ast)).toMatch(/^\{main = \[a = .*graphPaper1 = \(graphPaper "dots"\) solid1 = /)
		expect(both.row).toBe('binding:graphPaper1')
	})

	it('adds another solid or graph paper, as it would anything else', () => {
		const start = parse('[g = (graphPaper "lines") b = (solid "#000")]') as LetAST
		expect(withAdded(start, env, 'graphPaper', [0, 0])).toMatchObject({ row: 'binding:graphPaper1' })
		expect(withAdded(start, env, 'solid', [0, 0])).toMatchObject({ row: 'binding:solid1' })
		expect(print(withAdded(start, env, 'graphPaper', [0, 0])!.ast)).toContain('g = (graphPaper "lines")')
	})

	it('has a program say something else by that name, which goes first', () => {
		const own = parse('{graphPaper = (=> [at: point]: path (path.circle at 5))}') as LetAST
		expect(print(withAdded(own, env, 'graphPaper', [1, 2])!.ast)).toContain('(graphPaper [1 2])')
	})

	it('is nothing for what is not there', () => {
		expect(withAdded(EMPTY, env, 'path.nope', [0, 0])).toBeNull()
	})
})

describe('a line as a guide', () => {
	const root = parse('[l = (line.fromPoints [0 0] [0 10]) c = (path.circle [100 0] 10)]') as LetAST
	const scene = sceneOf(root, env)

	it('is what is drawn of it, and nothing of its parts', () => {
		expect(scene.filter(({ row }) => row === 'binding:l').map(({ draw }) => draw)).toEqual(['line'])
		expect(drawsAt(root, env, 'binding:l')).toBe(true)
		expect(drawsAt(root, env, 'binding:l/arg0')).toBe(false)
	})

	it('is within what it goes through, and no other', () => {
		expect(rowsWithin(scene, [-5, 50], [5, 60])).toEqual(['binding:l'])
		expect(rowsWithin(scene, [5, 50], [15, 60])).toEqual([])
	})

	it('has no size for anything to fit around', () => {
		expect(boundsOfRows(root, env)).toEqual([[90, -10], [110, 10]])
		expect(boxOfRows(scene, ['binding:l'])).toBeNull()
	})
})

describe('what goes in a value of what there is', () => {
	const fillers = (src: string, path: string) =>
		fillersAt(parse(src) as LetAST, env, path).map(({ name }) => name)

	it('has what a prelude writes in Glisp, such as going from degrees to radians', () => {
		const here = fillers('[c = (path.circle [0 0] 10)]', 'binding:c/arg1')
		for (const name of ['to-rad', 'to-deg', 'to-turn', 'turn', 'lerp', 'sin']) expect(here).toContain(name)
	})

	it('has all there is for a color, where one goes', () => {
		const here = fillers('[b = (solid "#ffffff")]', 'binding:b/arg0')
		for (const name of ['color.lerp', 'color.mix', 'color.ramp', 'color.from', 'color.oklch', 'color.invert', 'color.complement']) {
			expect(here).toContain(name)
		}
	})

	it('starts each with what works it out', () => {
		const next = withFilled(parse('[c = (path.circle [0 0] 10)]') as LetAST, env, 'binding:c/arg1', { name: 'to-rad', label: 'to-rad', group: 'Math' }, [0, 0])
		expect(print(next!)).toContain('(path.circle [0 0] (to-rad 10))')
		expect(evaluate(parse('(to-rad 180)'), env).value).toBeCloseTo(Math.PI)
		expect(evaluate(parse('(to-deg pi)'), env).value).toBeCloseTo(180)
	})
})

describe('what a program has of its own', () => {
	const PROGRAM = parse(`{
		flower = (=> [c: vec2 r: number]: path (path.circle c r))
		twice = (=> [n: number]: number (* n 2))
		a = 1
	}`) as LetAST
	const own = addablesIn(PROGRAM, env)

	it('is listed first, if it gives something drawn', () => {
		const listed = matching(own, '')
		expect(listed[0]).toMatchObject({ name: 'flower', group: 'Project' })
		expect(own.map(({ name }) => name)).not.toContain('twice')
	})

	it('goes by what it comes to, if it does not say', () => {
		const unsaid = parse('{a = (=> [r: number]: _ (path.circle [0 0] r)) b = (=> [r: number]: _ r)}') as LetAST
		const listed = addablesIn(unsaid, env).map(({ name }) => name)
		expect(listed).toContain('a')
		expect(listed).not.toContain('b')
	})

	it('is not what is not a function', () => {
		expect(own.map(({ name }) => name)).not.toContain('a')
	})

	it('is called by its name, in what it starts as', () => {
		const { ast, row } = withAdded(PROGRAM, env, 'twice', [0, 0])!
		expect(row).toBe('binding:twice1')
		expect(print(ast)).toContain('twice1 = (twice 0)')
		expect(check(ast, env).filter(({ level }) => level === 'error')).toEqual([])
	})

	it('goes where it was asked for, if it says where it is', () => {
		const placed = parse('{p = (=> [at: vec2 r: number]: path (path.circle at r))}') as LetAST
		expect(print(withAdded(placed, env, 'p', [7, 8])!.ast)).toContain('p1 = (p [7 8] 0)')
	})

	it('goes before what it was given, by the same name', () => {
		const shadow = parse('{style = (=> [a: path]: path a)}') as LetAST
		const items = addablesIn(shadow, env).filter(({ name }) => name === 'style')
		expect(items).toHaveLength(1)
		expect(items[0]!.group).toBe('Project')
	})
})

describe('what goes where a value is selected', () => {
	const SRC = `{
		n = 5
		v = [1 2]
		f = (=> [x: number]: number (* x 2))
		g = (=> [p: path]: path p)
		h = (=> [a: string]: number 1)
		c = (path.circle [0 0] 10)
		s = (path.square v n)
	}`
	const root = parse(SRC) as LetAST
	const at = (path: string) => fillersAt(root, env, path)
	const names = (path: string) => at(path).map(({ name }) => name)

	it('is what gives a number, for a number', () => {
		const here = names('binding:c/arg1')
		for (const name of ['sin', '+', 'f', 'n']) expect(here).toContain(name)
		for (const name of ['path.circle', 'v', 'c', 'color.rgb', 'g']) expect(here).not.toContain(name)
	})

	it('is what gives a place, for a place', () => {
		const here = names('binding:c/arg0')
		for (const name of ['vec2.add', 'v']) expect(here).toContain(name)
		for (const name of ['sin', 'n', 'path.circle']) expect(here).not.toContain(name)
	})

	it('has what is there to refer to first, then what takes what is there, then the rest', () => {
		const here = at('binding:c/arg1')
		expect(here[0]).toMatchObject({ name: 'n', group: 'Values', value: true })
		const groupOf = (of: string) => here.find(({ name }) => name === of)!.group
		expect(groupOf('sin')).toBe('Wrap')
		expect(groupOf('f')).toBe('Wrap')
		expect(groupOf('h')).toBe('Project')
		const groups = here.map(({ group }) => group)
		expect(groups.indexOf('Values')).toBeLessThan(groups.indexOf('Wrap'))
		expect(groups.indexOf('Wrap')).toBeLessThan(groups.indexOf('Project'))
	})

	it('has a wrap give what is wanted, and not only take what is there', () => {
		// A number can be made a string of, which is no use for a radius.
		expect(names('binding:c/arg1')).not.toContain('show')
	})

	it('wraps a place in what takes a place', () => {
		expect(at('binding:c/arg0').find(({ name }) => name === 'vec2.add')!.group).toBe('Wrap')
	})

	it('goes by what it has, where nothing says what it wants', () => {
		const here = names('binding:n')
		expect(here).toContain('sin')
		expect(here).not.toContain('path.circle')
		expect(here).not.toContain('n')
	})

	it('leaves out what would come back to itself', () => {
		expect(names('binding:s/arg1')).not.toContain('n1')
		const self = parse('{a = 1 b = (+ a 1)}') as LetAST
		expect(fillersAt(self, env, 'binding:a').map(({ name }) => name)).not.toContain('b')
	})

	it('refers to what it is, and takes what was there', () => {
		const put = (path: string, name: string) => print(withFilled(root, env, path, at(path).find(item => item.name === name)!, [7, 8])!)
		expect(put('binding:c/arg1', 'n')).toContain('c = (path.circle [0 0] n)')
		expect(put('binding:c/arg1', 'sin')).toContain('c = (path.circle [0 0] (sin 10))')
		expect(put('binding:c/arg1', 'f')).toContain('c = (path.circle [0 0] (f 10))')
		expect(put('binding:c/arg1', 'h')).toContain('c = (path.circle [0 0] (h ""))')
		expect(put('binding:c/arg0', 'vec2.add')).toContain('c = (path.circle (vec2.add [0 0] [0 0]) 10)')
	})

	it('leaves what is said of it as it was', () => {
		const pinned = parse('{n = 5 c = (path.circle [0 0] @10)}') as LetAST
		const here = fillersAt(pinned, env, 'binding:c/arg1').find(({ name }) => name === 'n')!
		expect(print(withFilled(pinned, env, 'binding:c/arg1', here, [0, 0])!)).toContain('(path.circle [0 0] @n)')
	})

	it('is nothing, for what is not there', () => {
		expect(at('binding:nope')).toEqual([])
	})
})

describe('what is a function of the program', () => {
	const root = parse('{g = (=> [p: path d: number]: path (path.offset p d))}') as LetAST

	it('takes what a function given would, and is called by name', () => {
		const circle = evaluate(parse('(path.circle [0 0] 1)'), env).value
		const found = filtersFor([circle], env, functionsOfProgram(root, env)).find(({ name }) => name === 'g')!
		expect(found.label).toBe('g')
		const wrapped = wrappedAt(parse('{g = (=> [p: path d: number]: path (path.offset p d)) c = (path.circle [0 0] 1)}'), env, 'binding:c', found)!
		expect(print(wrapped)).toContain('c = (g (path.circle [0 0] 1) 0)')
	})

	it('is not what does not take it', () => {
		expect(filtersFor([5], env, functionsOfProgram(root, env)).map(({ name }) => name)).not.toContain('g')
	})
})
