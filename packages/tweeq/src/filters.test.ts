import { buildPrelude, type Env, host, LetAST, makeType, makeTypedFn, numberType, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { combined, type Filter, filtersFor, withInitial, wrappedAt } from './filters'

const env: Env = buildPrelude()
const named = (values: unknown[]) => filtersFor(values, env).map(({ name }) => name)
const filter = (name: string, values: unknown[]): Filter =>
	filtersFor(values, env).find(it => it.name === name)!

describe('filtersFor', () => {
	it('has what takes a number, for a number', () => {
		expect(named([1])).toContain('+')
		expect(named(['a'])).not.toContain('+')
	})

	it('has nothing for nothing', () => {
		expect(named([])).toEqual([])
	})

	it('goes through the values in order, one to a parameter', () => {
		expect(named([1, 2])).toContain('+')
		expect(named([1, 'a'])).not.toContain('+')
	})

	it('says what wants another like it, to ask for that', () => {
		const pair = makeTypedFn([numberType, numberType], numberType, () => 0, ['a', 'b'])
		const own: Env = { ast: new LetAST([], null), parent: env, bindings: new Map([['pair', { ast: host(pair), env: null }]]) }
		const namedIn = (values: unknown[]) => filtersFor(values, own).map(({ name }) => name)
		const of = (values: unknown[]) => filtersFor(values, own).find(({ name }) => name === 'pair')!
		expect(of([1]).more).toEqual([{ name: 'b', type: numberType }])
		expect(of([1, 2]).more).toEqual([])
		expect(namedIn(['a'])).not.toContain('pair')
	})

	it('does not take an object of a class for a record', () => {
		class Thing {}
		expect(named([{ x: 1 }])).toContain('keys')
		expect(named([new Thing()])).not.toContain('keys')
	})

	it('says nothing of what takes anything at all', () => {
		const taking = filtersFor([makeType('thing', () => true, 0).default], env)
		expect(taking.every(({ fn }) => fn.paramTypes[0]?.typeName !== '_')).toBe(true)
	})
})

describe('wrappedAt', () => {
	const root = parse('{a = 1 b = (+ a 2)}')

	it('puts it around what is there', () => {
		const next = wrappedAt(root, env, 'binding:b', filter('+', [3]))!
		expect(print(next)).toContain('b = (+ (+ a 2))')
	})

	it('puts it around an argument', () => {
		const next = wrappedAt(root, env, 'binding:b/arg1', filter('*', [2]))
		expect(next && print(next)).toContain('(* 2)')
	})

	it('leaves what is said about it outside', () => {
		const said = parse('{a = ^{doc: "one"} 1}')
		expect(print(wrappedAt(said, env, 'binding:a', filter('+', [1]))!)).toMatch(
			/a = \^\{.*\} \(\+ 1\)/
		)
	})

	it('is nothing, for what is not there', () => {
		expect(wrappedAt(root, env, 'binding:nowhere', filter('+', [1]))).toBeNull()
	})
})

describe('withInitial', () => {
	it('has the rest start as what it says, going by what is given', () => {
		const add = withInitial(
			makeTypedFn([numberType, numberType], numberType, () => 0, ['a', 'by']),
			(a: number) => [a * 2]
		)
		const own: Env = { ast: new LetAST([], null), parent: env, bindings: new Map([['add', { ast: host(add), env: null }]]) }
		const next = wrappedAt(parse('{x = 3}'), own, 'binding:x', filtersFor([3], own).find(({ name }) => name === 'add')!)!
		expect(print(next)).toContain('x = (add 3 6)')
	})
})

describe('combined', () => {
	const root = parse('{a = 1 b = 2 c = 3}') as LetAST
	const lits = (...sources: string[]) => sources.map(source => parse(source))

	it('has them given to it, in place of the last, called what the first is', () => {
		const next = combined(root, env, ['a', 'b'], lits('1', '2'), filter('+', [1, 2]))!
		expect(print(next)).toMatch(/a = \(\+ 1 2\)[\s\S]*c = 3/)
		expect(print(next)).not.toContain('b = ')
	})

	it('goes by the order they are given in', () => {
		const next = combined(root, env, ['c', 'a'], lits('3', '1'), filter('-', [1, 2]))!
		expect(print(next)).toContain('c = (- 3 1)')
		expect(print(next)).not.toContain('a = ')
	})

	it('leaves what referred to the first referring to it', () => {
		const used = parse('{a = 1 b = 2 c = (+ a 1)}') as LetAST
		const next = combined(used, env, ['a', 'b'], lits('1', '2'), filter('+', [1, 2]))!
		expect(print(next)).toContain('c = (+ a 1)')
	})

	it('is nothing if something else needs one that goes', () => {
		const used = parse('{a = 1 b = 2 c = (+ b 1)}') as LetAST
		expect(combined(used, env, ['a', 'b'], lits('1', '2'), filter('+', [1, 2]))).toBeNull()
	})

	it('is nothing if what is given refers to one of them', () => {
		const used = parse('{a = 1 b = (+ a 1)}') as LetAST
		expect(combined(used, env, ['a', 'b'], lits('1', '(+ a 1)'), filter('+', [1, 2]))).toBeNull()
	})

	it('is nothing if it is not given what it takes', () => {
		expect(combined(root, env, ['a', 'b'], lits('1', '"no"'), filter('-', [1, 2]))).toBeNull()
	})

	it('is nothing if one is not there', () => {
		expect(combined(root, env, ['a', 'z'], lits('1', '2'), filter('+', [1, 2]))).toBeNull()
	})
})
