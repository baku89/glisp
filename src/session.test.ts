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
		const r = s.evalSrc('./nope/y = 1')
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

describe('Session — assignment', () => {
	const after = (...lines: string[]): string => {
		const s = new Session(buildPrelude())
		for (const line of lines) s.exec(line)
		return print(s.ast())
	}

	it('sets a binding by name or by path', () => {
		expect(after('x = (+ 20 40)')).toBe('{x = (+ 20 40)}')
		expect(after('./x = 1')).toBe('{x = 1}')
	})

	it('replaces inside a let-block, record, vector and call', () => {
		expect(after('x = {y = 30}', './x/y = 400')).toBe('{x = {y = 400}}')
		expect(after('x = {y = {z = 1}}', './x/y/z = 99')).toBe('{x = {y = {z = 99}}}')
		expect(after('p = {x: 1 y: 2}', './p/y = 7')).toBe('{p = {x: 1 y: 7}}')
		expect(after('xs = [10 20 30]', './xs/1 = 99')).toBe('{xs = [10 99 30]}')
		expect(after('c = (+ 1 2)', './c/2 = 5')).toBe('{c = (+ 1 5)}')
	})

	it('adds a name that does not exist yet', () => {
		expect(after('x = {a = 20}', './x/b = 30')).toBe('{x = {a = 20 b = 30}}')
		expect(after('x = {a = 1 (+ a 1)}', './x/b = 2')).toBe('{x = {a = 1 b = 2 (+ a 1)}}')
		expect(after('p = {x: 1}', './p/y = 2')).toBe('{p = {x: 1 y: 2}}')
		expect(after('x = {y = {}}', './x/y/z = 1')).toBe('{x = {y = {z: 1}}}')
	})

	it('sets an argument by its parameter name', () => {
		expect(after('x = (first [1])', './x/xs = [2]')).toBe('{x = (first [2])}')
		expect(after('x = (take [1 2] 1)', './x/n = 2')).toBe('{x = (take [1 2] 2)}')
		expect(after('x = (take [1 2] n=1)', './x/n = 2')).toBe('{x = (take [1 2] n=2)}')
		expect(after('x = (first [(+ 1 2)])', './x/xs/0/1 = 5')).toBe('{x = (first [(+ 5 2)])}')
	})

	it('adds an argument that was not passed, as a keyword', () => {
		expect(after('x = (take [1 2])', './x/n = 1')).toBe('{x = (take [1 2] n=1)}')
		const s = new Session(buildPrelude())
		s.exec('x = (first [1])')
		expect(s.exec('./x/nope = 1').diagnostics[0]!.message).toContain(
			'no parameter named nope'
		)
	})

	it('reads back what it wrote', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {a = 20}')
		s.exec('./x/b = (+ a 10)')
		expect(s.exec('./x/b').value).toBe(30)
	})

	it('reports a path it cannot reach, without changing anything', () => {
		const failure = (line: string): string => {
			const s = new Session(buildPrelude())
			s.exec('x = {y = 30}')
			s.exec('n = 1')
			s.exec('xs = [1]')
			const before = print(s.ast())
			const message = s.exec(line).diagnostics[0]!.message
			expect(print(s.ast())).toBe(before)
			return message
		}
		expect(failure('./nope/y = 1')).toContain('no such binding: nope')
		expect(failure('./x/z/w = 1')).toContain('no binding named z')
		expect(failure('./xs/5 = 1')).toContain('out of range')
		expect(failure('./n/a = 1')).toContain('cannot descend into lit')
	})

	it('does not take other forms for an assignment', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {a = 1}')
		expect(() => s.exec('x/a = 5')).toThrow()
		expect(() => s.exec('../x = 5')).toThrow()
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
		s.exec('./p/r/1 = 5')
		expect(print(s.ast())).toBe('{p = {r: (+ 5 2)}}')
		expect(s.exec('p').value).toEqual({ r: 7 })
		expect(s.exec('./p/r/9 = 5').diagnostics[0]!.message).toContain(
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
		s.exec('./x/a = 5')
		expect(s.exec('./x/a').value).toBe(5)
	})

	it('has no shell form for reading: `x/a` is a syntax error', () => {
		const s = new Session(buildPrelude())
		s.exec('x = {a = 20}')
		expect(() => s.exec('x/a')).toThrow()
	})
})

describe('Session — paths through calls', () => {
	const session = () => {
		const s = new Session(buildPrelude())
		s.exec('x = (first (reverse (map (range 0 3) (+ 1 %))))')
		s.exec('f = (=> (a: number b: number): number (+ a b))')
		s.exec('y = (f 1 b=2)')
		return s
	}

	it('finds an argument by its parameter name', () => {
		const s = session()
		expect(s.exec('./x/xs').value).toEqual([3, 2, 1])
		expect(s.exec('./x/xs/xs').value).toEqual([1, 2, 3])
		expect(s.exec('./x/xs/xs/xs').value).toEqual([0, 1, 2])
		expect(s.exec('./x/xs/xs/xs/start').value).toBe(0)
		expect(s.exec('./x/xs/xs/xs/end').value).toBe(3)
		expect(s.exec('./x/1').value).toEqual([3, 2, 1])
	})

	it('finds it for a closure, and by keyword', () => {
		const s = session()
		expect(s.exec('./y/a').value).toBe(1)
		expect(s.exec('./y/b').value).toBe(2)
	})

	it('reports what is not there', () => {
		const s = session()
		expect(s.exec('./x/nope').diagnostics[0]!.message).toBe(
			'path segment not found: nope'
		)
		s.exec('z = (take [1 2])')
		expect(s.exec('./z/n').diagnostics[0]!.message).toBe(
			'path segment not found: n'
		)
	})

	it('finds it from inside an expression', () => {
		const s = new Session(buildPrelude())
		expect(s.exec('[(take [1 2] 1) ./0/n]').value).toEqual([[1], 1])
	})
})
