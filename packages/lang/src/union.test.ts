import { describe, expect, it } from 'vitest'

import { check } from './check.js'
import { evaluate, isTypeValue, typeFits, type TypeValue } from './eval.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'

const env = buildPrelude()

const run = (src: string) => evaluate(parse(src), env)
const typeOf = (src: string): TypeValue => {
	const value = run(src).value
	if (!isTypeValue(value)) throw new Error(`${src} is not a type`)
	return value
}

describe('union types', () => {
	it('holds the values of each of its members', () => {
		const t = typeOf('(| number string)')
		expect(t.fits(1)).toBe(true)
		expect(t.fits('a')).toBe(true)
		expect(t.fits(true)).toBe(false)
		expect(t.typeName).toBe('(| number string)')
	})

	it('defaults to its first member', () => {
		expect(run('(: true (| string number))').value).toBe('')
		expect(run('(: () (| number string))').value).toBe(0)
	})

	it('casts nothing that already fits, and says when something does not', () => {
		expect(run('(: "a" (| number string))').value).toBe('a')
		const r = run('(: true (| number string))')
		expect(r.value).toBe(0)
		expect(r.diagnostics.length).toBeGreaterThan(0)
	})

	it('reads vectors and records as types within it', () => {
		const t = typeOf('(| [number number] {at: [number number]})')
		expect(t.fits([1, 2])).toBe(true)
		expect(t.fits({ at: [1, 2] })).toBe(true)
		expect(t.fits({ at: 1 })).toBe(false)
		const bound = run(
			'{Anchor = (| [number number] {at: [number number]}) (: [[0 0] {at: [1 2]}] [...Anchor])}'
		)
		expect(bound.value).toEqual([[0, 0], { at: [1, 2] }])
		expect(bound.diagnostics).toEqual([])
	})

	it('is flat, has each type once, and is just the type for one', () => {
		expect(typeOf('(| number (| string number))').typeName).toBe('(| number string)')
		expect(typeOf('(| number number)')).toBe(typeOf('number'))
	})

	it('is no value at all with no members', () => {
		const none = typeOf('(|)')
		expect(none.fits(0)).toBe(false)
		expect(typeFits(none, typeOf('number'))).toBe(true)
		expect(typeFits(typeOf('number'), none)).toBe(false)
	})

	it('fits where each member does, and takes what fits one', () => {
		const ns = typeOf('(| number string)')
		const n = typeOf('number')
		const b = typeOf('boolean')
		expect(typeFits(n, ns)).toBe(true)
		expect(typeFits(b, ns)).toBe(false)
		expect(typeFits(ns, n)).toBe(false)
		expect(typeFits(ns, typeOf('(| string boolean number)'))).toBe(true)
		expect(typeFits(typeOf('(enum 1 "a")'), ns)).toBe(true)
		expect(typeFits(typeOf('(vector number)'), typeOf('(vector (| number string))'))).toBe(true)
	})

	it('is checked at a typed slot', () => {
		const ok = check(
			parse('{f = (=> (x: (| number string)): number 0) (f "a")}'),
			env
		)
		expect(ok).toEqual([])
		const bad = check(
			parse('{f = (=> (x: (| number string)): number 0) (f true)}'),
			env
		)
		expect(bad.map(d => d.message).join()).toMatch(/expected \(\| number string\)/)
	})

	it('takes vector and record literals of its members', () => {
		const ds = check(
			parse(
				'{Anchor = (| [number number] {at: [number number]}) f = (=> (xs: [...Anchor]): number 0) (f [[0 0] {at: [1 2]}])}'
			),
			env
		)
		expect(ds).toEqual([])
	})
})
