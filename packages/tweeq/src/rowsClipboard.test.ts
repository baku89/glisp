import { buildPrelude, type Env, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { copiedRows, pastedRows, withoutNearest, withoutRows } from './rowsClipboard'

const env: Env = buildPrelude()

describe('copiedRows', () => {
	it('is what they are written as, a line to each', () => {
		const root = parse('{a = 1 b = (+ a 1) c = 3}')
		expect(copiedRows(root, env, ['binding:a', 'binding:b'])).toBe('a = 1\nb = (+ a 1)')
	})

	it('is only what is a binding', () => {
		expect(copiedRows(parse('{a = (+ 1 2)}'), env, ['binding:a/arg0'])).toBe('')
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

	it('is nothing for what does not read as bindings', () => {
		expect(pasted('{a = 1}', null, '(+ 1 2)')).toBeNull()
		expect(pasted('{a = 1}', null, 'not (code')).toBeNull()
		expect(pasted('{a = 1}', null, '')).toBeNull()
	})
})
