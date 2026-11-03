import { describe, expect, it } from 'vitest'

import { evaluate, IO } from './eval.js'
import { parse } from './parse.js'
import { print } from './print.js'
import { buildPrelude } from './prelude.js'
import { Session } from './session.js'

describe('Session — let-block as session state', () => {
	it('starts empty: ast() prints as `{}`', () => {
		const s = new Session(buildPrelude())
		expect(print(s.ast())).toBe('{}')
		expect(s.bindings()).toEqual([])
	})

	it('`x = expr` evaluates to an IO that assigns when run', () => {
		const s = new Session(buildPrelude())
		const r = s.evalSrc('x = (+ 20 40)')
		expect(r.value instanceof IO).toBe(true)
		expect(s.bindings()).toEqual([])
		;(r.value as IO).run()
		expect(s.bindings()).toEqual(['x'])
		expect(print(s.ast())).toBe('{x = (+ 20 40)}')
	})

	it('reports a bad assignment when run, without changing anything', () => {
		const s = new Session(buildPrelude())
		const r = s.evalSrc('nope/y = 1')
		expect(r.diagnostics).toEqual([])
		expect((r.value as IO).run().map(d => d.message)).toEqual([
			'assignment failed: no such binding: nope',
		])
		expect(s.bindings()).toEqual([])
	})

	it('def and undef are not part of the language', () => {
		const s = new Session(buildPrelude())
		expect(s.exec('(def "x" 1)').diagnostics[0]!.message).toBe(
			'unresolvable name: def'
		)
		expect(s.bindings()).toEqual([])
	})

	it('subsequent expressions see the new binding', () => {
		const s = new Session(buildPrelude())
		s.exec('x = (+ 20 40)')
		const r = s.exec('(* x 2)')
		expect(r.value).toBe(120)
	})

	it('re-evaluates dependents after a binding changes', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 1')
		s.exec('y = (+ x 1)')
		expect(s.exec('y').value).toBe(2)
		s.exec('x = 100')
		expect(s.exec('y').value).toBe(101)
		s.unsetBinding('x')
		expect(s.exec('x').diagnostics.length).toBeGreaterThan(0)
	})

	it('redefinition replaces last-wins', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 1')
		s.exec('x = 99')
		expect(s.bindings()).toEqual(['x'])
		expect(print(s.ast())).toBe('{x = 99}')
		expect(s.exec('x').value).toBe(99)
	})

	it('insertion order is preserved across multiple bindings', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 10')
		s.exec('y = 20')
		s.exec('z = (+ x y)')
		expect(s.bindings()).toEqual(['x', 'y', 'z'])
		expect(print(s.ast())).toBe('{x = 10 y = 20 z = (+ x y)}')
	})

	it('unsetBinding removes a binding and reports whether it was there', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 10')
		s.exec('y = 20')
		expect(s.unsetBinding('x')).toBe(true)
		expect(s.unsetBinding('ghost')).toBe(false)
		expect(s.bindings()).toEqual(['y'])
	})

	it('reset clears every binding', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 1')
		s.exec('y = 2')
		s.reset()
		expect(s.bindings()).toEqual([])
		expect(print(s.ast())).toBe('{}')
	})

	it('non-mutation expressions evaluate normally and do not touch the let-block', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 5')
		const r = s.exec('(+ x 7)')
		expect(r.value).toBe(12)
		expect(print(s.ast())).toBe('{x = 5}')
	})

	it('the session ast() round-trips through parse', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 10')
		s.exec('y = (+ x 5)')
		const printed = print(s.ast())
		expect(printed).toBe('{x = 10 y = (+ x 5)}')
		const reparsed = parse(printed)
		expect(reparsed.kind).toBe('let')
		expect(print(reparsed)).toBe(printed)
	})
})

describe('Session — assignment sugar (name = expr, path = expr)', () => {
	it('top-level `x = expr` is a binding mutation', () => {
		const s = new Session(buildPrelude())
		s.exec('x = (+ 20 40)')
		expect(print(s.ast())).toBe('{x = (+ 20 40)}')
	})

	it('path `x/y = expr` updates a nested let-block binding', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {y = 30}')
		s.exec('x/y = 400')
		expect(print(s.ast())).toBe('{x = {y = 400}}')
	})

	it('deeper paths walk through nested let-blocks', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {y = {z = 1}}')
		s.exec('x/y/z = 99')
		expect(print(s.ast())).toBe('{x = {y = {z = 99}}}')
	})

	it('numeric segment addresses a vector element', () => {
		const s = new Session(buildPrelude())
		s.exec('xs = [10 20 30]')
		s.exec('xs/1 = 99')
		expect(print(s.ast())).toBe('{xs = [10 99 30]}')
	})

	it('record field assignment via path', () => {
		const s = new Session(buildPrelude())
		s.exec('p = {x: 1 y: 2}')
		s.exec('p/y = 7')
		expect(print(s.ast())).toBe('{p = {x: 1 y: 7}}')
	})

	it('missing path emits a diagnostic and does not mutate', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {y = 30}')
		const r = s.exec('x/z = 99')
		expect(
			r.diagnostics.some(d => d.message.includes('no binding named z'))
		).toBe(true)
		expect(print(s.ast())).toBe('{x = {y = 30}}')
	})

	it('missing top-level binding emits a diagnostic', () => {
		const s = new Session(buildPrelude())
		const r = s.exec('ghost/y = 1')
		expect(
			r.diagnostics.some(d => d.message.includes('no such binding: ghost'))
		).toBe(true)
		expect(print(s.ast())).toBe('{}')
	})
})

describe('Session — edits', () => {
	it('ast() is the let-block itself, and setAst restores an earlier one', () => {
		const s = new Session(buildPrelude())
		s.exec('x = 1')
		const before = s.ast()
		expect(s.ast()).toBe(before)
		s.exec('x = 2')
		expect(s.exec('x').value).toBe(2)
		s.setAst(before)
		expect(s.exec('x').value).toBe(1)
	})

	it('keeps the formatting of what an edit did not touch', () => {
		const s = new Session(buildPrelude())
		s.exec('a = (+  1   2)')
		s.exec('b = 1')
		s.exec('b = 2')
		expect(print(s.ast())).toBe('{a = (+  1   2) b = 2}')
	})

	it('edits inside a call', () => {
		const s = new Session(buildPrelude())
		s.exec('p = {r: (+ 1 2)}')
		s.exec('p/r/1 = 5')
		expect(print(s.ast())).toBe('{p = {r: (+ 5 2)}}')
		expect(s.exec('p').value).toEqual({ r: 7 })
		expect(s.exec('p/r/9 = 5').diagnostics[0]!.message).toContain(
			'argument index out of range'
		)
	})

	it('reuses unchanged bindings across edits', () => {
		const s = new Session(buildPrelude())
		s.exec('a = [1 2 3]')
		s.exec('b = 1')
		const before = s.exec('a').value
		s.exec('b = 2')
		expect(s.exec('a').value).toBe(before)
	})
})

describe('Session — reading by path', () => {
	it('reads inside a binding with an ordinary path', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {a = 20 b = {c = (+ a 1)}}')
		s.exec('xs = [10 20]')
		expect(s.exec('./x/a').value).toBe(20)
		expect(s.exec('./x/b/c').value).toBe(21)
		expect(s.exec('./xs/1').value).toBe(20)
		s.exec('x/a = 5')
		expect(s.exec('./x/a').value).toBe(5)
	})

	it('has no shell form for reading: `x/a` is a syntax error', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {a = 20}')
		expect(() => s.exec('x/a')).toThrow()
	})
})
