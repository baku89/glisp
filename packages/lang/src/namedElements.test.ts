import { describe, expect, it } from 'vitest'

import {
	buildPrelude,
	check,
	evaluate,
	freeRefs,
	nameOf,
	named,
	parse,
	print,
	Runtime,
	type LetAST,
	type VecAST,
} from './index.js'

const env = buildPrelude()
const valueOf = (src: string) => evaluate(parse(src), env)
const problems = (src: string) => check(parse(src), env).map(({ message }) => message)

describe('a name, anywhere', () => {
	it('is given to what is in a vector, a call or a record, and changes no value', () => {
		expect(valueOf('[a = 1 b = 2]').value).toEqual([1, 2])
		expect(valueOf('(+ a = 1 2)').value).toBe(3)
		expect(valueOf('{x: c = 10}').value).toEqual({ x: 10 })
		expect(valueOf('(take [1 2 3] n: k = 2)').value).toEqual([1, 2])
	})

	it('stays where it is written, and prints as it is', () => {
		const vector = parse('[a = 1 2]') as VecAST
		expect(vector.kind).toBe('vec')
		expect(nameOf(vector.elements[0]!)).toBe('a')
		for (const source of ['[a = 1 2]', '(f a = 1 x: b = 2)', '{x: c = 10}', '[a = @10 b = #_2]', '[a = ^{label: "A"} 1]']) {
			expect(print(parse(source))).toBe(source)
		}
		expect(print(named('c', parse('@10')))).toBe('c = @10')
	})

	it('is seen from anything around it, the nearest first', () => {
		expect(valueOf('[a = 1 (+ a 1)]').value).toEqual([1, 2])
		expect(valueOf('[b = (+ a 1) a = 1]').value).toEqual([2, 1])
		expect(valueOf('(+ a = 1 a)').value).toBe(2)
		expect(valueOf('{x: c = 10 y: (* c 2)}').value).toEqual({ x: 10, y: 20 })
		expect(valueOf('{c = 1 [c = 10 c]}').value).toEqual([10, 10])
		expect(valueOf('{x = 10 y = (+ x = 2 (* x 3))}').value).toBe(8)
		expect(valueOf('{x = 10 y = (+ x = 2 (* ../../x 3))}').value).toBe(32)
		expect(valueOf('[a = 1 (+ a 1)]').diagnostics).toEqual([])
	})

	it('is not seen from outside what it is in', () => {
		expect(valueOf('{y = a [a = 2 y]}').diagnostics[0]?.message).toContain('a')
	})

	it('is not a key: a parameter is not in scope where it is given', () => {
		expect(valueOf('{n = 5 (take [n 6] n: 1)}').value).toEqual([5])
		expect(valueOf('{center = 7 [(take [1 2 3] n: 2) center]}').value).toEqual([[1, 2], 7])
	})

	it('is reached by a path, apart from a key', () => {
		expect(valueOf('[c = 10 (+ ../c 1)]').value).toEqual([10, 11])
		expect(valueOf('{v = (take [1 2 3] k = 2) w = ./v/k}').value).toBe(2)
		expect(valueOf('{v = (take [1 2 3] k = 2) w = ./v/n:}').value).toBe(2)
	})

	it('is the last of those with the same name in what it is in', () => {
		expect(valueOf('{v = [a = 1 a = 2] w = ./v/a}').value).toBe(2)
		expect(valueOf('[a = 1 a = 2 a]').value).toEqual([1, 2, 2])
	})

	it('is one to an expression, and none to a spread', () => {
		expect(() => parse('[a = b = 1]')).toThrow('one expression has one name')
		expect(() => parse('[a = ...xs]')).toThrow('a spread takes no name')
	})

	it('is known to what is worked out without running', () => {
		expect(problems('[a = 1 (+ a 1)]')).toEqual([])
		expect(problems('{x: c = 10 y: (* c 2)}')).toEqual([])
		expect(problems('[(+ a 1) [a = 1]]')).not.toEqual([])
		const refs = freeRefs(parse('[a = 1 (+ a b)]'))
		expect(refs.names.has('a')).toBe(false)
		expect(refs.names.has('b')).toBe(true)
	})

	it('is followed by a Runtime, as anything else is', () => {
		const runtime = new Runtime(env)
		runtime.setRoot(parse('{r = [a = 1 b = (+ a 1)]}'))
		expect(runtime.read('r').value).toEqual([1, 2])
		runtime.setRoot(parse('{r = [a = 5 b = (+ a 1)]}'))
		expect(runtime.read('r').value).toEqual([5, 6])
		expect(runtime.read('r', 'b').value).toBe(6)
	})
})

describe('a let-block', () => {
	it('comes to its last entry, named or not', () => {
		expect(valueOf('{a = 10 b = 20}').value).toBe(20)
		expect(valueOf('{a = 10 r = (+ a 1)}').value).toBe(11)
		expect(valueOf('{a = 10 b = 20 (+ a b)}').value).toBe(30)
		expect(valueOf('{()}').value).toEqual(evaluate(parse('()'), env).value)
	})

	it('has only its last entry go without a name', () => {
		expect(() => parse('{a = 10 (foo) (+ a 1)}')).toThrow()
		expect(() => parse('{(foo) a = 1}')).toThrow('only the last entry of a let-block may go without a name')
	})

	it('keeps the order it was written in', () => {
		const block = parse('{b = 1 a = 2}') as LetAST
		expect(block.bindings.map(([name]) => name)).toEqual(['b', 'a'])
	})
})
