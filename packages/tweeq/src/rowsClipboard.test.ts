import { buildPrelude, type Env, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { copiedBySlotCommand, copiedRows, pastedArguments, slotCommandAt, slotCommandsAt, withSlotCommand, pastedRows, reach, withoutNearest, withoutRows } from './rowsClipboard'

const env: Env = buildPrelude()

describe('copiedRows', () => {
	it('is what they are written as, a line to each', () => {
		const root = parse('{a = 1 b = (+ a 1) c = 3}')
		expect(copiedRows(root, env, ['binding:a', 'binding:b'])).toBe('a = 1\nb = (+ a 1)')
	})

	it('is a parameter too, by its name', () => {
		expect(copiedRows(parse('{a = (take [1 2] 1)}'), env, ['binding:a/arg1'])).toBe('n = 1')
	})

	it('is only what goes by a name', () => {
		expect(copiedRows(parse('{a = (+ 1 2)}'), env, ['binding:a/arg0'])).toBe('')
		expect(copiedRows(parse('{a = [1 2]}'), env, ['binding:a/0'])).toBe('')
	})
})

describe('slot commands on rows', () => {
	const root = parse(`{
		sq = (=> (x: number): number (* x x))
		a = (sq 2)
		b = (+ 1 2)
		n = 1
	}`)

	it('says what applies to a row', () => {
		const a = slotCommandsAt(root, env, 'binding:a')
		expect(a.has('step') && a.has('all') && a.has('delete')).toBe(true)
		expect(slotCommandsAt(root, env, 'binding:n').has('step')).toBe(false)
		expect(slotCommandsAt(root, env, 'binding:nowhere').size).toBe(0)
	})

	it('says what one is called there', () => {
		const pinned = withSlotCommand(root, env, ['binding:a'], 'pin')!
		expect(slotCommandAt(root, env, 'binding:a', 'pin')?.label).toBe('Lock')
		expect(slotCommandAt(pinned, env, 'binding:a', 'pin')?.label).toBe('Unlock')
	})

	it('goes one step down', () => {
		expect(print(withSlotCommand(root, env, ['binding:a'], 'step')!)).toContain('a = (* 2 2)')
	})

	it('goes all the way down', () => {
		expect(print(withSlotCommand(root, env, ['binding:a'], 'all')!)).toContain('a = 4')
	})

	it('does all of the rows', () => {
		const next = print(withSlotCommand(root, env, ['binding:a', 'binding:b'], 'all')!)
		expect(next).toContain('a = 4')
		expect(next).toContain('b = 3')
	})

	it('is nothing, if nothing comes of it', () => {
		expect(withSlotCommand(root, env, ['binding:n'], 'step')).toBeNull()
		expect(withSlotCommand(root, env, ['binding:nowhere'], 'all')).toBeNull()
	})

	it('puts a line to each on the clipboard', () => {
		expect(copiedBySlotCommand(root, env, ['binding:a', 'binding:b'], 'copy')).toBe(
			'(sq 2)\n(+ 1 2)'
		)
	})
})

describe('withoutRows', () => {
	it('leaves out each of them', () => {
		const next = withoutRows(parse('{a = 1 b = 2 c = 3}'), env, ['binding:a', 'binding:c'])
		expect(print(next)).toBe('{b = 2}')
	})

	it('goes into what holds them', () => {
		const next = withoutRows(parse('{g = {a = 1 b = 2}}'), env, ['binding:g/binding:a'])
		expect(print(next)).toBe('{g = {b = 2}}')
	})
})

describe('withoutNearest', () => {
	const without = (src: string, path: string) => {
		const next = withoutNearest(parse(src), env, path)
		return next && print(next)
	}

	it('is the row itself, if it can go', () => {
		expect(without('{v = [1 [2 3]]}', 'binding:v/1/0')).toBe('{v = [1 [3]]}')
	})

	it('goes up to the nearest of what holds it that can', () => {
		expect(without('{v = [(take [1] 1) 2]}', 'binding:v/0/arg1')).toBe('{v = [2]}')
	})

	it('goes as far as the binding, and leaves the others', () => {
		expect(without('{a = (take [1] 1) b = 2}', 'binding:a/arg1')).toBe('{b = 2}')
	})

	it('is nothing, for a row that is not there', () => {
		expect(without('{a = 1}', 'binding:b')).toBeNull()
	})
})

describe('pastedRows', () => {
	const pasted = (src: string, after: string | null, text: string) => {
		const result = pastedRows(parse(src), env, after, text)
		return result && [print(result.ast), result.paths]
	}

	it('goes after the row selected, under a name of its own', () => {
		expect(pasted('{c = 1 d = 2}', 'binding:c', 'c = 1')).toEqual([
			'{c = 1 c2 = 1 d = 2}',
			['binding:c2'],
		])
	})

	it('counts on from a name with a number', () => {
		expect(pasted('{rect1 = 1 rect2 = 2}', null, 'rect1 = 1')).toEqual([
			'{rect1 = 1 rect2 = 2 rect3 = 1}',
			['binding:rect3'],
		])
	})

	it('goes at the end with nothing selected, and keeps a name that is free', () => {
		expect(pasted('{a = 1}', null, 'b = 2\nc = 3')).toEqual([
			'{a = 1 b = 2 c = 3}',
			['binding:b', 'binding:c'],
		])
	})

	it('goes into what holds the row selected', () => {
		expect(pasted('{g = {a = 1}}', 'binding:g/binding:a', 'a = 1')).toEqual([
			'{g = {a = 1 a2 = 1}}',
			['binding:g/binding:a2'],
		])
	})

	it('goes after the binding that the row selected is in', () => {
		expect(pasted('{a = (take [1] 1) b = 2}', 'binding:a/arg1', 'n = 3')).toEqual([
			'{a = (take [1] 1) n = 3 b = 2}',
			['binding:n'],
		])
	})

	it('hides nothing that can be seen from there', () => {
		expect(pasted('{a = 1}', null, 'take = 2')).toEqual(['{a = 1 take2 = 2}', ['binding:take2']])
		expect(pasted('{x = 1 g = {a = (+ x 1)}}', 'binding:g/binding:a', 'x = 2')).toEqual([
			'{x = 1 g = {a = (+ x 1) x2 = 2}}',
			['binding:g/binding:x2'],
		])
	})

	it('is nothing for what does not read as bindings', () => {
		expect(pasted('{a = 1}', null, '(+ 1 2)')).toBeNull()
		expect(pasted('{a = 1}', null, 'not (code')).toBeNull()
		expect(pasted('{a = 1}', null, '')).toBeNull()
	})
})

describe('pastedArguments', () => {
	const given = (src: string, rows: string[], text: string) => {
		const next = pastedArguments(parse(src), env, rows, text)
		return next && print(next)
	}

	it('goes to the parameter of the same name', () => {
		expect(given('{a = (take [1 2 3] 1)}', ['binding:a'], 'n = 2')).toBe('{a = (take [1 2 3] 2)}')
	})

	it('gives a parameter that has not been given yet', () => {
		expect(given('{a = (take [1 2 3])}', ['binding:a'], 'n = 2')).toBe('{a = (take [1 2 3] n=2)}')
	})

	it('goes into what the row is made of, the nearest first', () => {
		expect(given('{a = (+ (take [1] 1) 2)}', ['binding:a'], 'n = 2')).toBe('{a = (+ (take [1] 2) 2)}')
		expect(given('{a = (take (take [1] 1) 1)}', ['binding:a'], 'n = 2')).toBe(
			'{a = (take (take [1] 1) 2)}'
		)
	})

	it('has no place for what the parameter would not take', () => {
		expect(given('{a = (take [1 2 3] 1)}', ['binding:a'], 'n = "x"')).toBeNull()
	})

	it('has no place for a name that is not there', () => {
		expect(given('{a = (take [1 2 3] 1)}', ['binding:a'], 'radius = 2')).toBeNull()
		expect(given('{a = 1}', ['binding:a'], 'n = 2')).toBeNull()
	})

	it('takes the row itself if that is a part, whatever it is called', () => {
		expect(given('{a = (take [1 2 3] 1)}', ['binding:a/arg1'], 'radius = 2')).toBe(
			'{a = (take [1 2 3] 2)}'
		)
		expect(given('{a = (take [1 2 3] 1)}', ['binding:a/arg1'], 'radius = "x"')).toBeNull()
	})

	it('leaves what is said about what it replaces', () => {
		expect(given('{a = (take [1] ^{max: 9} 1)}', ['binding:a'], 'n = 2')).toBe(
			'{a = (take [1] ^{max: 9} 2)}'
		)
	})

	it('goes to each of the rows that has a place for it', () => {
		expect(given('{a = (take [1] 1) b = 2 c = (take [2] 1)}', ['binding:a', 'binding:b', 'binding:c'], 'n = 5')).toBe(
			'{a = (take [1] 5) b = 2 c = (take [2] 5)}'
		)
	})

	it('needs a place for all of what is on the clipboard', () => {
		expect(given('{a = (take [1] 1)}', ['binding:a'], 'n = 5\nz = 1')).toBeNull()
	})

	it('is nothing for what does not read as bindings', () => {
		expect(given('{a = (take [1] 1)}', ['binding:a'], '5')).toBeNull()
	})

	it('reads what a row is copied as back into another', () => {
		const root = parse('{a = (take [1] 7) b = (take [2] 1)}')
		const text = copiedRows(root, env, ['binding:a/arg1'])
		expect(reach(root, env, 'binding:a/arg1')?.chain.at(-1)?.parameter).toBe('n')
		expect(print(pastedArguments(root, env, ['binding:b'], text)!)).toBe(
			'{a = (take [1] 7) b = (take [2] 7)}'
		)
	})
})
