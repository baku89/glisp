import { buildPrelude, infer, parse } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { colorOfType, isManyType, scopeOfType } from './typeColor'

const env = buildPrelude()
const type = (source: string) => infer(parse(source), env)
const scope = (source: string) => scopeOfType(type(source))

describe('the color of a type', () => {
	it('is that of its values as they are written', () => {
		expect(scope('1')).toBe('number')
		expect(scope('"a"')).toBe('string')
		expect(scope('true')).toBe('constant.language')
		expect(scope('()')).toBe('constant.language')
	})

	it('is that of what an expression comes to', () => {
		expect(scope('(+ 1 2)')).toBe('number')
		expect(scope('(< 1 2)')).toBe('constant.language')
	})

	it('is that of a function for anything that is called', () => {
		expect(scope('+')).toBe('function')
		expect(scope('(=> [x: number] x)')).toBe('function')
	})

	it('is the same whatever is said about the type', () => {
		expect(scope('(number min: 0)')).toBe('number')
	})

	it('is what the members of a union share, and none if they do not', () => {
		expect(scope('(| 1 2)')).toBe('number')
		expect(scope('(| number string)')).toBeNull()
	})

	it('is none for what is written with no token of its own, or is not known', () => {
		expect(scope('[1 "a"]')).toBeNull()
		expect(scope('{a: 1}')).toBeNull()
		expect(scopeOfType(null)).toBeNull()
	})

	it('comes from the rules of a theme, the nearest that covers it', () => {
		const rules = [{ token: 'number', foreground: 'ff8800' }, { token: 'constant', foreground: '0000ff' }]
		expect(colorOfType(type('1'), rules)).toBe('#ff8800')
		expect(colorOfType(type('true'), rules)).toBe('#0000ff')
		expect(colorOfType(type('"a"'), rules)).toBeUndefined()
		expect(colorOfType(type('[1 "a"]'), rules)).toBeUndefined()
	})

	it('is that of what a vector holds, which is told from one of them by being many', () => {
		expect(scope('[1 2]')).toBe('number')
		expect(scope('[[1 2] [3 4]]')).toBe('number')
		expect(isManyType(type('[1 2]'))).toBe(true)
		expect(isManyType(type('[1 "a"]'))).toBe(true)
		expect(isManyType(type('1'))).toBe(false)
		expect(isManyType(type('{a: [1]}'))).toBe(false)
		expect(isManyType(null)).toBe(false)
	})
})
