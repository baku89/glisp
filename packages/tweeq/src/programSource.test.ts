import { buildPrelude, type Env, LetAST, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { readProgram, rowsAcross, rowWritten, sourceOfProgram, writtenAt } from './programSource'

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

	it('has nothing but bindings, and what to draw', () => {
		expect(readProgram('a = 1\n(+ a 1)')).toMatchObject({ message: 'This can only have bindings, and a vector of what to draw.' })
	})
})

describe('what a row is, in what is written', () => {
	const env: Env = buildPrelude()
	const WRITTEN = 'a = 1\n\nb = (+ a [2 3])\nc = (+ b kw=4)'
	const reading = readProgram(WRITTEN)
	const program = (reading as { ast: LetAST }).ast
	const textAt = (row: string): string | null => {
		const at = writtenAt(program, env, row)
		return at && WRITTEN.slice(at.from, at.to)
	}
	const rowAt = (text: string, within = 0): string | null => {
		const from = WRITTEN.indexOf(text) + within
		return rowWritten(program, env, from, from)
	}

	it('is a binding along with its name', () => {
		expect(textAt('binding:a')).toBe('a = 1')
		expect(textAt('binding:b')).toBe('b = (+ a [2 3])')
	})

	it('is what it is, further in', () => {
		expect(textAt('binding:b/arg1')).toBe('[2 3]')
	})

	it('is as near as there is to it, for a part that is not written', () => {
		expect(textAt('binding:b/arg1/nothing')).toBe('[2 3]')
	})

	it('is nothing for what is not there', () => {
		expect(textAt('binding:z')).toBeNull()
	})

	it('goes the other way, to the least that has it', () => {
		expect(rowAt('a = 1')).toBe('binding:a')
		expect(rowAt('[2 3]')).toBe('binding:b/arg1')
		expect(rowAt('(+ a')).toBe('binding:b')
	})

	it('takes the end of something as being in it, for a cursor just after it', () => {
		expect(rowAt('[2 3]', 5)).toBe('binding:b/arg1')
	})

	it('is the least that has all of a range', () => {
		const from = WRITTEN.indexOf('a [2')
		expect(rowWritten(program, env, from, from + 4)).toBe('binding:b')
	})

	it('is nothing between the rows', () => {
		expect(rowAt('\n\nb', 1)).toBeNull()
	})

	it('comes back to the same row', () => {
		for (const row of ['binding:a', 'binding:b', 'binding:b/arg1']) {
			const { from, to } = writtenAt(program, env, row)!
			expect(rowWritten(program, env, from, to)).toBe(row)
		}
	})
})

describe('what goes on over several lines', () => {
	const program = (written: string) => (readProgram(written) as { ast: LetAST }).ast

	it('goes along with where it now is, having been written somewhere else', () => {
		expect(sourceOfProgram(program('s = (style\n  (f)\n  k=1)\n[s]'))).toBe('[\n  s = (style\n    (f)\n    k=1)\n]')
		expect(sourceOfProgram(program('[\n  s = (style\n    (f))\n]\nt = s'))).toContain('s = (style\n    (f))')
	})

	it('goes back along, from further in', () => {
		const inVector = program('[\n  s = (style\n    (f))\n]')
		const out = new LetAST(inVector.bindings, null)
		expect(sourceOfProgram(out)).toBe('s = (style\n  (f))')
	})

	it('stays as it is, where it is already', () => {
		const written = '[\n  s = (style\n    (f)\n    k=1)\n]'
		expect(sourceOfProgram(program(written))).toBe(written)
	})

	it('leaves the lines of a string, which are what it holds', () => {
		expect(sourceOfProgram(program('s = (f "a\nb"\n  1)\n[s]'))).toBe('[\n  s = (f "a\nb"\n    1)\n]')
	})

	it('comes to the same from how it was and from how it now is', () => {
		const once = program('s = (style\n  (f))\n[s]')
		expect(sourceOfProgram(program(sourceOfProgram(once)))).toBe(sourceOfProgram(once))
	})
})

describe('what a selection goes over', () => {
	const env = buildPrelude()
	const source = sourceOfProgram(parse('{a = 1 b = 2 c = 3}') as LetAST)
	const reading = readProgram(source)
	const program = 'ast' in reading ? reading.ast : null

	it('is each row it touches, from part of the way into one to part of the way into another', () => {
		expect(rowsAcross(program!, env, source.indexOf('1'), source.indexOf('2'))).toHaveLength(2)
		expect(rowsAcross(program!, env, source.indexOf('1'), source.indexOf('3') + 1)).toHaveLength(3)
	})

	it('is nothing for a cursor, or what is between rows', () => {
		const end = source.indexOf('1') + 1
		expect(rowsAcross(program!, env, end, end)).toEqual([])
		expect(rowsAcross(program!, env, end, end + 1)).toEqual([])
	})
})
