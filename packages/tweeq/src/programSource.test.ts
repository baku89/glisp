import { type LetAST, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { readProgram, sourceOfProgram } from './programSource'

describe('a program as code', () => {
	it('is a binding to a line', () => {
		expect(sourceOfProgram(parse('{a = 1 b = (+ a 1)}') as LetAST)).toBe('a = 1\nb = (+ a 1)')
	})

	it('reads back as it was', () => {
		const reading = readProgram('a = 1\nb = (+ a 1)')
		expect('ast' in reading && print(reading.ast)).toBe('{a = 1 b = (+ a 1)}')
	})

	it('can have nothing in it', () => {
		const reading = readProgram('')
		expect('ast' in reading && reading.ast.bindings).toEqual([])
	})

	it('says where what cannot be read is, in what was written', () => {
		const written = 'a = 1\nb = (+ a'
		const reading = readProgram(written)
		expect('message' in reading).toBe(true)
		if ('message' in reading) {
			expect(reading.offset).toBeGreaterThan(5)
			expect(reading.offset).toBeLessThanOrEqual(written.length)
		}
	})

	it('has nothing but bindings', () => {
		expect(readProgram('a = 1\n(+ a 1)')).toMatchObject({ message: 'This can only have bindings.' })
	})
})
