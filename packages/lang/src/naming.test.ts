import { describe, expect, it } from 'vitest'

import {
	type AST,
	buildPrelude,
	type CallAST,
	evaluate,
	type LetAST,
	parse,
	print,
	type VecAST,
	withNamed,
} from './index.js'

const env = buildPrelude()

/** `source`, with what `pick` finds in it named `name`, printed, or null. */
function naming(source: string, pick: (root: AST) => AST, name: string): string | null {
	const root = parse(source)
	const next = withNamed(root, env, pick(root), name)
	if (next === null) return null
	expect(evaluate(next, env).value).toEqual(evaluate(root, env).value)
	return print(next)
}

const binding = (i: number) => (root: AST) => (root as LetAST).bindings[i]![1]
const argOf = (i: number, j: number) => (root: AST) => ((root as LetAST).bindings[i]![1] as CallAST).args[j]!
const element = (i: number) => (root: AST) => (root as VecAST).elements[i]!

describe('withNamed', () => {
	it('names what is in a vector, a call or a record', () => {
		expect(naming('[1 2]', element(0), 'a')).toBe('[a = 1 2]')
		expect(naming('{y = (+ 2 3)}', argOf(0, 0), 'two')).toBe('{y = (+ two = 2 3)}')
		expect(naming('[@1 2]', element(0), 'a')).toBe('[a = @1 2]')
	})

	it('has what it would catch refer by a path to what it meant', () => {
		expect(naming('{x = 10 y = (+ 2 (* x 3))}', argOf(1, 0), 'x')).toBe('{x = 10 y = (+ x = 2 (* ../../x 3))}')
		expect(naming('{x = 10 y = [1 x]}', root => ((root as LetAST).bindings[1]![1] as VecAST).elements[0]!, 'x')).toBe(
			'{x = 10 y = [x = 1 ../x]}'
		)
	})

	it('leaves alone what something nearer already means', () => {
		expect(naming('{x = 10 y = [1 {x = 3 x}]}', root => ((root as LetAST).bindings[1]![1] as VecAST).elements[0]!, 'x')).toBe(
			'{x = 10 y = [x = 1 {x = 3 x}]}'
		)
	})

	it('has what referred to it by its old name go on referring to it', () => {
		expect(naming('[a = 1 (+ a 1)]', element(0), 'b')).toBe('[b = 1 (+ b 1)]')
		expect(naming('{a = 1 b = (+ a 1)}', binding(0), 'c')).toBe('{c = 1 b = (+ c 1)}')
	})

	it('names the last of a block, which then is a binding', () => {
		expect(naming('{a = 1 (+ a 1)}', root => (root as LetAST).body!, 'r')).toBe('{a = 1 r = (+ a 1)}')
	})

	it('cannot be had where no path reaches what would be caught', () => {
		expect(naming('{y = [1 (+ 1 1)]}', root => ((root as LetAST).bindings[0]![1] as VecAST).elements[0]!, '+')).toBeNull()
		expect(naming('{f = (=> [x: number]: _ [1 x])}', root => (((root as LetAST).bindings[0]![1] as never as { body: VecAST }).body.elements[0]!), 'x')).toBeNull()
	})

	it('cannot give a name another has where it is', () => {
		expect(naming('[a = 1 2]', element(1), 'a')).toBeNull()
		expect(naming('[1 2]', element(0), '1x')).toBeNull()
	})
})
