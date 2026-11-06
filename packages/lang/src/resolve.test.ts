import { describe, expect, it } from 'vitest'

import { lit } from './build.js'
import { evaluate, makeTopLevel, makeTypedFn } from './eval.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { freeRefs, resolve, type Target } from './resolve.js'

const env = buildPrelude()

const messages = (src: string): string[] =>
	resolve(parse(src), env).diagnostics.map(d => d.message)

/** The target of the reference printed as `text`. */
const targetOf = (src: string, text: string): Target | null => {
	const found = resolve(parse(src), env).references.find(
		r => r.node.print() === text
	)
	if (found === undefined) throw new Error(`no reference: ${text}`)
	return found.target
}

const freeNames = (src: string): string[] =>
	[...freeRefs(parse(src)).names].sort()

describe('resolve — names', () => {
	it('binds a name to the innermost binder', () => {
		const target = targetOf('{a = 1 {a = 2 a}}', 'a')
		expect(target?.kind).toBe('let')
		if (target?.kind === 'let') expect(target.value.print()).toBe('2')
	})

	it('allows a let binding to refer to itself and later siblings', () => {
		expect(messages('{a = b b = 1 f = (=> [n: number]: number (f n)) a}')).toEqual([])
	})

	it('resolves against the host environment', () => {
		expect(targetOf('(+ 1 2)', '+')?.kind).toBe('env')
	})

	it('reports an unresolved name, even in a body that never runs', () => {
		expect(messages('nope')).toEqual(['unresolvable name: nope'])
		expect(messages('(=> [x: number]: number nope)')).toEqual([
			'unresolvable name: nope',
		])
	})

	it('sees parameters in the body but not in the types', () => {
		expect(targetOf('(=> [x: number]: number x)', 'x')?.kind).toBe('param')
		expect(messages('(=> [t: number x: t]: number x)')).toEqual([
			'unresolvable name: t',
		])
	})

	it('sees generics in the types and the body', () => {
		const src = '(=> {T} [x: T]: T (: x T))'
		expect(messages(src)).toEqual([])
		expect(targetOf(src, 'T')?.kind).toBe('generic')
	})

	it('resolves the parameter that % desugars to', () => {
		expect(messages('(map [1] (+ % 1))')).toEqual([])
	})

	it('does not treat special forms as references', () => {
		expect(messages('(: 1 number)')).toEqual([])
		expect(messages('(|> 1 (+ % 1))')).toEqual([])
		expect(messages('(? 1 number 2 _ 3)')).toEqual([])
	})

	it('accepts `_` as the catch-all of ? without a binding for it', () => {
		const bare = makeTopLevel({ number: lit(0) })
		expect(resolve(parse('(? 1 _ 2)'), bare).diagnostics).toEqual([])
	})

	it('walks kwargs, spread, access, meta and ~', () => {
		for (const src of [
			'(f k: a)',
			'[...a]',
			'{...a}',
			'a.b',
			'^{label: a} 1',
			'~a',
			'[...~a]',
		]) {
			expect(messages(src), src).toContain('unresolvable name: a')
		}
	})

	it('warns about duplicates, and the last one wins', () => {
		expect(messages('{a = 1 a = 2 a}')).toEqual(['duplicate binding: a'])
		expect(messages('{x: 1 x: 2}')).toEqual(['duplicate field: x'])
		const target = targetOf('{a = 1 a = 2 a}', 'a')
		if (target?.kind === 'let') expect(target.value.print()).toBe('2')
	})
})

describe('resolve — paths', () => {
	const pathTarget = (src: string, text: string): string | null => {
		const target = targetOf(src, text)
		return target?.kind === 'node' ? target.ast.print() : null
	}

	it('finds a sibling and climbs levels', () => {
		expect(pathTarget('[10 ./0]', './0')).toBe('10')
		expect(pathTarget('{w: 100 h: ./w:}', './w:')).toBe('100')
		expect(pathTarget('{w: 100 a: (* ../w: 2)}', '../w:')).toBe('100')
	})

	it('descends through several levels', () => {
		expect(pathTarget('[{k = 1 y = 2 y} ./0/y]', './0/y')).toBe('2')
		expect(pathTarget('[[1 2] ./0/1]', './0/1')).toBe('2')
	})

	it('counts a function literal as a level around its body', () => {
		expect(pathTarget('[5 ((=> [x: number]: _ ../../0) 1)]', '../../0')).toBe('5')
	})

	it('reports paths that do not resolve', () => {
		expect(messages('[./9]')).toEqual(['path segment not found: 9'])
		expect(messages('{a = 1 ./nope}')).toEqual(['path segment not found: nope'])
		expect(messages('[../../../../../../x]')).toEqual([
			'path goes above top-level',
		])
	})

	it('finds an argument by its parameter name, as evaluation does', () => {
		expect(pathTarget('[(take [1 2] 1) ./0/n:]', './0/n:')).toBe('1')
		expect(pathTarget('{f = (=> [a: number]: number a) [(f 5) ./0/a:]}', './0/a:')).toBe('5')
		expect(pathTarget('[((=> [a: number]: number a) 5) ./0/a:]', './0/a:')).toBe('5')
		expect(pathTarget('[(take [1] n: 3) ./0/n:]', './0/n:')).toBe('3')
		expect(messages('[(take [1 2] 1) ./0/nope:]')).toEqual([
			'path segment not found: nope:',
		])
	})

	it('makes no claim about a head it cannot read', () => {
		expect(messages('[((? true true take _ drop) [1 2] 1) ./0/n:]')).toEqual([])
	})

	it('gives a let-block trailing expression no path', () => {
		expect(messages('[{a = 1 (+ a 1)} ./0/1]')).toEqual([
			'path segment not found: 1',
		])
	})
})

describe('freeRefs', () => {
	it('collects names the node does not bind', () => {
		expect(freeNames('(+ a b)')).toEqual(['+', 'a', 'b'])
		expect(freeNames('{a = 1 (+ a b)}')).toEqual(['+', 'b'])
		expect(freeNames('(=> [x: number]: number (+ x y))')).toEqual([
			'+',
			'number',
			'y',
		])
		expect(freeNames('(=> {T} [x: T]: T x)')).toEqual([])
	})

	it('does not count special forms or a catch-all', () => {
		expect(freeNames('(? a number 1 _ 2)')).toEqual(['a', 'number'])
		expect(freeNames('(: a number)')).toEqual(['a', 'number'])
	})

	it('keeps paths that climb out and drops those that stay inside', () => {
		const ups = (src: string): number[] =>
			freeRefs(parse(src)).paths.map(p => p.up)
		expect(ups('./x')).toEqual([0])
		expect(ups('[./0 1]')).toEqual([])
		expect(ups('[../x 1]')).toEqual([0])
		expect(ups('[(+ ../../x 1)]')).toEqual([0])
		expect(ups('{a = ../x a}')).toEqual([0])
		expect(ups('(=> [x: number]: number ../y)')).toEqual([0])
	})

	it('is cached per instance', () => {
		const ast = parse('(+ a b)')
		expect(freeRefs(ast)).toBe(freeRefs(ast))
	})
})

describe('resolve agrees with evaluate', () => {
	const PROGRAMS = [
		'{a = 1 b = (+ a 1) (* a b)}',
		'{a = b b = 1 a}',
		'{a = 1 {a = 2 a}}',
		'[10 ./0]',
		'{w: 100 h: ./w: a: (* ../w: ../h:)}',
		'[{k = 1 y = (+ k 1) y} ./0/y]',
		'[[1 ./0] ./0/1]',
		'((=> [x: number]: number (+ x 1)) 1)',
		'((=> {T} [x: T]: T x) 1)',
		'[5 ((=> {T} [x: T]: _ ../0) 1)]',
		'[5 ((=> {T} [x: number]: _ ../0) 1)]',
		'[[1 2] 9 ./0/../1]',
		'[1 ./]',
		'[(take [1 2] 1) ./0/n:]',
		'[(take [1 2] 1) ./0/nope:]',
		'[1 ~./0]',
		'^{label: "x"} [1 ./0]',
		'(? 1 number 2 _ 3)',
		'(|> 1 (+ % 1))',
		'(map [1 2] (* % 2))',
		'[./9]',
		'{a = 1 ./nope}',
		'nope',
		'(+ 1 nope)',
		'[../../../../../../x]',
	]
	const isReferenceFailure = (message: string): boolean =>
		/^(unresolvable name|path )/.test(message)

	for (const src of PROGRAMS) {
		it(src, () => {
			const ast = parse(src)
			const fromEval = evaluate(ast, env)
				.diagnostics.map(d => d.message)
				.filter(isReferenceFailure)
			const fromResolve = resolve(ast, env).diagnostics.map(d => d.message)
			expect(new Set(fromResolve)).toEqual(new Set(fromEval))
		})
	}

	it('runs no host code', () => {
		let calls = 0
		const counted = makeTypedFn([], null as never, () => calls++, [])
		const host = makeTopLevel({ h: lit(counted as never) })
		resolve(parse('[(h) {a = (h) a} (=> [x: _]: _ (h))]'), host)
		expect(calls).toBe(0)
	})
})
