import { buildPrelude, check, type Env, evaluate, type LetAST, parse, print } from '@glisp/lang'
import { bounds } from 'pave/path/metrics'
import { describe, expect, it } from 'vitest'

import { type PathValue, withGraphics } from './graphics'
import { filtersFor, functionsOfProgram, wrappedAt } from '@glisp/tweeq/filters'
import { addablesIn, fillersAt, matching, withAdded, withFilled } from './quickAdd'

const env: Env = withGraphics(buildPrelude())
const EMPTY = parse('{a = 1}') as LetAST
const all = addablesIn(EMPTY, env)
const names = (query: string) => matching(all, query).map(({ name }) => name)

describe('what can be added', () => {
	it('is all that can be seen, by group, with shapes first', () => {
		expect(all[0]!.group).toBe('Shapes')
		expect(matching(all, '').every(({ group }) => group === 'Shapes')).toBe(true)
		const groups = all.map(({ group }) => group)
		// Each is together, not coming back to one it has left.
		expect(groups.filter((group, i) => group !== groups[i - 1]).length).toBe(new Set(groups).size)
		for (const name of ['path.circle', 'path.offset', 'style']) {
			expect(all.map(item => item.name)).toContain(name)
		}
	})

	it('is only what gives something drawn', () => {
		for (const name of ['sin', 'color.rgb', 'mat2d.rotate', 'map', 'path.bounds', 'background', 'grid']) {
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
		return evaluate(parse(row.replace('binding:', '')), { ast, parent: env, bindings: new Map(ast.bindings.map(([n, v]) => [n, { ast: v, env }])) }).value
	}

	it('names it for what it is, and selects that', () => {
		expect(added('path.circle').row).toBe('binding:circle1')
		expect(print(added('path.circle').ast)).toContain('circle1 = (path.circle [200 300] 50)')
		expect(withAdded(parse('{circle1 = 1}') as LetAST, env, 'path.circle', [0, 0])!.row).toBe('binding:circle2')
	})

	it('goes in front of what is there', () => {
		const next = withAdded(parse('[a = (path.circle [0 0] 5)]') as LetAST, env, 'path.rect', [0, 0])!
		expect(print(next.ast)).toMatch(/^\[rect1 = /)
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

	it('is nothing for what is not there', () => {
		expect(withAdded(EMPTY, env, 'path.nope', [0, 0])).toBeNull()
	})
})

describe('what a program has of its own', () => {
	const PROGRAM = parse(`{
		flower = (=> (c: vec2 r: number): path (path.circle c r))
		twice = (=> (n: number): number (* n 2))
		a = 1
	}`) as LetAST
	const own = addablesIn(PROGRAM, env)

	it('is listed first, if it gives something drawn', () => {
		const listed = matching(own, '')
		expect(listed[0]).toMatchObject({ name: 'flower', group: 'Project' })
		expect(own.map(({ name }) => name)).not.toContain('twice')
	})

	it('goes by what it comes to, if it does not say', () => {
		const unsaid = parse('{a = (=> (r: number): _ (path.circle [0 0] r)) b = (=> (r: number): _ r)}') as LetAST
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
		const placed = parse('{p = (=> (at: vec2 r: number): path (path.circle at r))}') as LetAST
		expect(print(withAdded(placed, env, 'p', [7, 8])!.ast)).toContain('p1 = (p [7 8] 0)')
	})

	it('goes before what it was given, by the same name', () => {
		const shadow = parse('{style = (=> (a: path): path a)}') as LetAST
		const items = addablesIn(shadow, env).filter(({ name }) => name === 'style')
		expect(items).toHaveLength(1)
		expect(items[0]!.group).toBe('Project')
	})
})

describe('what goes where a value is selected', () => {
	const SRC = `{
		n = 5
		v = [1 2]
		f = (=> (x: number): number (* x 2))
		g = (=> (p: path): path p)
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

	it('has what is there to refer to first, then what is the program\'s', () => {
		const here = at('binding:c/arg1')
		expect(here[0]).toMatchObject({ name: 'n', group: 'Values', value: true })
		expect(here.find(({ name }) => name === 'f')!.group).toBe('Project')
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
	const root = parse('{g = (=> (p: path d: number): path (path.offset p d))}') as LetAST

	it('takes what a function given would, and is called by name', () => {
		const circle = evaluate(parse('(path.circle [0 0] 1)'), env).value
		const found = filtersFor([circle], env, functionsOfProgram(root, env)).find(({ name }) => name === 'g')!
		expect(found.label).toBe('g')
		const wrapped = wrappedAt(parse('{g = (=> (p: path d: number): path (path.offset p d)) c = (path.circle [0 0] 1)}'), env, 'binding:c', found)!
		expect(print(wrapped)).toContain('c = (g (path.circle [0 0] 1) 0)')
	})

	it('is not what does not take it', () => {
		expect(filtersFor([5], env, functionsOfProgram(root, env)).map(({ name }) => name)).not.toContain('g')
	})
})
