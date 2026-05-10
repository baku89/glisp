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

	it('intercepts top-level (def "name" expr) as a binding mutation', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" (+ 20 40))')
		expect(s.bindings()).toEqual(['x'])
		expect(print(s.ast())).toBe('{x = (+ 20 40)}')
	})

	it('def at top level does not return an IO (intercepted)', () => {
		const s = new Session(buildPrelude())
		const r = s.evalSrc('(def "x" 42)')
		expect(r.value instanceof IO).toBe(false)
	})

	it('subsequent expressions see the new binding', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" (+ 20 40))')
		const r = s.evalSrc('(* x 2)')
		expect(r.value).toBe(120)
	})

	it('redefinition replaces last-wins', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" 1)')
		s.evalSrc('(def "x" 99)')
		expect(s.bindings()).toEqual(['x'])
		expect(print(s.ast())).toBe('{x = 99}')
		expect(s.evalSrc('x').value).toBe(99)
	})

	it('insertion order is preserved across multiple bindings', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" 10)')
		s.evalSrc('(def "y" 20)')
		s.evalSrc('(def "z" (+ x y))')
		expect(s.bindings()).toEqual(['x', 'y', 'z'])
		expect(print(s.ast())).toBe('{x = 10 y = 20 z = (+ x y)}')
	})

	it('(undef "name") removes the binding', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" 10)')
		s.evalSrc('(def "y" 20)')
		s.evalSrc('(undef "x")')
		expect(s.bindings()).toEqual(['y'])
	})

	it('(undef "missing") returns a warning diagnostic', () => {
		const s = new Session(buildPrelude())
		const r = s.evalSrc('(undef "ghost")')
		expect(
			r.diagnostics.some(d => d.message.includes('no such binding'))
		).toBe(true)
	})

	it('reset clears every binding', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" 1)')
		s.evalSrc('(def "y" 2)')
		s.reset()
		expect(s.bindings()).toEqual([])
		expect(print(s.ast())).toBe('{}')
	})

	it('non-mutation expressions evaluate normally and do not touch the let-block', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" 5)')
		const r = s.evalSrc('(+ x 7)')
		expect(r.value).toBe(12)
		expect(print(s.ast())).toBe('{x = 5}')
	})

	it('nested def stays as an IO (not a session-level mutation)', () => {
		// `(if true (def "x" 1) ())` is not a top-level def, so it falls
		// through to the regular IO mechanism. The session's bindings
		// should NOT pick it up unless the user runs the IO.
		const s = new Session(buildPrelude())
		s.evalSrc('(? true _ (def "x" 1) _ ())')
		expect(s.bindings()).toEqual([])
	})

	it('the session ast() round-trips through parse', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('(def "x" 10)')
		s.evalSrc('(def "y" (+ x 5))')
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
		s.evalSrc('x = (+ 20 40)')
		expect(print(s.ast())).toBe('{x = (+ 20 40)}')
	})

	it('path `x/y = expr` updates a nested let-block binding', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('x = {y = 30}')
		s.evalSrc('x/y = 400')
		expect(print(s.ast())).toBe('{x = {y = 400}}')
	})

	it('deeper paths walk through nested let-blocks', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('x = {y = {z = 1}}')
		s.evalSrc('x/y/z = 99')
		expect(print(s.ast())).toBe('{x = {y = {z = 99}}}')
	})

	it('numeric segment addresses a vector element', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('xs = [10 20 30]')
		s.evalSrc('xs/1 = 99')
		expect(print(s.ast())).toBe('{xs = [10 99 30]}')
	})

	it('record field assignment via path', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('p = {x: 1 y: 2}')
		s.evalSrc('p/y = 7')
		expect(print(s.ast())).toBe('{p = {x: 1 y: 7}}')
	})

	it('missing path emits a diagnostic and does not mutate', () => {
		const s = new Session(buildPrelude())
		s.evalSrc('x = {y = 30}')
		const r = s.evalSrc('x/z = 99')
		expect(
			r.diagnostics.some(d => d.message.includes('no binding named z'))
		).toBe(true)
		expect(print(s.ast())).toBe('{x = {y = 30}}')
	})

	it('missing top-level binding emits a diagnostic', () => {
		const s = new Session(buildPrelude())
		const r = s.evalSrc('ghost/y = 1')
		expect(
			r.diagnostics.some(d => d.message.includes('no such binding: ghost'))
		).toBe(true)
		expect(print(s.ast())).toBe('{}')
	})
})
