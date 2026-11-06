import { buildPrelude, type Env, evaluate, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { keptReferences } from './keptReferences'
import { withoutRows } from './rowsClipboard'

const env: Env = buildPrelude()

/** The program with the rows at `paths` taken away, as an editor does it, and what it kept. */
const removing = (source: string, paths: string[]): { source: string; rows: readonly string[] } => {
	const before = parse(source)
	const { ast, rows } = keptReferences(before, withoutRows(before, env, paths), env)
	return { source: print(ast), rows }
}

describe('what referred to what has been taken away', () => {
	it('is what it came to, and says where that is', () => {
		expect(removing('{a = 10 b = (+ a 1)}', ['binding:a'])).toEqual({ source: '{b = 11}', rows: ['binding:b'] })
	})

	it('is a whole vector of what it is in, rather than each number in it', () => {
		expect(removing('{o = [10 20] p = [(lerp /o/0 30 0.5) /o/1]}', ['binding:o']).source).toBe('{p = [20 20]}')
	})

	it('is a number or a record, as much as a vector', () => {
		const { source } = removing('{o = [10 20] c = (lerp /o/0 1 (lerp 0 1 0.5)) d = {at: [/o/0 2] name: "x"}}', ['binding:o'])
		expect(source).toBe('{c = 5.5 d = {at: [10 2] name: "x"}}')
	})

	it('keeps what else was said of it', () => {
		expect(removing('{a = 10 b = ^{label: "B"} (+ a 1)}', ['binding:a']).source).toBe('{b = ^{label: "B"} 11}')
	})

	it('has no more digits than say anything', () => {
		expect(removing('{a = 0.1 b = (+ a 0.2)}', ['binding:a']).source).toBe('{b = 0.3}')
	})

	it('comes to the same, so that nothing moves', () => {
		const source = '{o = [10 20] p = [(* /o/0 2) (+ /o/1 1)] q = p}'
		const before = parse(source)
		const { ast } = keptReferences(before, withoutRows(before, env, ['binding:o']), env)
		expect(evaluate(ast, env).value).toEqual(evaluate(before, env).value)
	})

	it('leaves alone what still refers to something, and says nothing', () => {
		expect(removing('{a = 10 b = 2 c = (+ b 1)}', ['binding:a'])).toEqual({ source: '{b = 2 c = (+ b 1)}', rows: [] })
	})
})
