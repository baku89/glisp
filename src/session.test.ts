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
