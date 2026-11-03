import { describe, expect, it } from 'vitest'

import { lit } from './build.js'
import { makeTopLevel } from './eval.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { print } from './print.js'
import { Session } from './session.js'
import { solve } from './solve.js'
import type { AST, LetAST } from './types.js'

const env = buildPrelude()

/** Make the binding `r` of a let-block evaluate to `value`. */
const solveR = (src: string, value: unknown) => {
	const root = parse(src) as LetAST
	const node = root.bindings.find(([name]) => name === 'r')![1]
	return solve(root, env, node, value)
}
const edited = (src: string, value: unknown) => {
	const { ast } = solveR(src, value)
	return ast === null ? null : print(ast)
}
const reason = (src: string, value: unknown) =>
	solveR(src, value).diagnostics[0]?.message

describe('solve', () => {
	it('changes a literal', () => {
		expect(edited('{r = 1}', 5)).toBe('{r = 5}')
		expect(edited('{r = "a"}', 'b')).toBe('{r = "b"}')
		expect(edited('{r = true}', false)).toBe('{r = false}')
	})

	it('keeps metadata', () => {
		expect(edited('{r = ^{label: "L"} 1}', 5)).toBe('{r = ^{label: "L"} 5}')
	})

	it('wants a value of the same type', () => {
		expect(edited('{r = 1}', 'a')).toBeNull()
	})

	it('follows a name to what it is bound to', () => {
		expect(edited('{a = 1 r = a}', 5)).toBe('{a = 5 r = a}')
		expect(edited('{a = 1 b = a r = b}', 5)).toBe('{a = 5 b = a r = b}')
	})

	it('follows a path', () => {
		expect(edited('{a = 1 r = ./a}', 5)).toBe('{a = 5 r = ./a}')
		expect(edited('{p = {a: 1} r = ./p/a}', 5)).toBe('{p = {a: 5} r = ./p/a}')
	})

	it('goes into vectors and records, by what differs', () => {
		expect(edited('{a = 1 r = [a 2]}', [1, 5])).toBe('{a = 1 r = [a 5]}')
		expect(edited('{a = 1 r = [a 2]}', [7, 5])).toBe('{a = 7 r = [a 5]}')
		expect(edited('{r = {x: 1 y: 2}}', { x: 1, y: 5 })).toBe('{r = {x: 1 y: 5}}')
		expect(edited('{p = {x: 1} r = p.x}', 5)).toBe('{p = {x: 5} r = p.x}')
	})

	it('wants the same shape', () => {
		expect(edited('{r = [1 2]}', [1])).toBeNull()
		expect(edited('{r = {x: 1}}', { y: 1 })).toBeNull()
	})

	it('goes through a let-block to what it gives', () => {
		expect(edited('{r = {a = 1 (+ a 1)}}', 5)).toBe('{r = {a = 1 (+ a 4)}}')
	})

	it('changes nothing for the value it has', () => {
		const root = parse('{a = 1 r = (+ a 1)}') as LetAST
		expect(solve(root, env, root.bindings[1]![1], 2).ast).toBe(root)
	})

	it('keeps what is unchanged', () => {
		const root = parse('{a = (+  1 2) r = 1}') as LetAST
		const next = solve(root, env, root.bindings[1]![1], 5).ast as LetAST
		expect(next.bindings[0]![1]).toBe(root.bindings[0]![1])
		expect(print(root)).toBe('{a = (+  1 2) r = 1}')
	})

	it('wants a node of the root', () => {
		expect(solve(parse('{r = 1}'), env, parse('1'), 5).ast).toBeNull()
	})
})

describe('solve — a call', () => {
	it('prefers a literal, as that changes nothing else', () => {
		expect(edited('{a = 1 r = (+ a 1)}', 10)).toBe('{a = 1 r = (+ a 9)}')
		expect(edited('{a = 1 r = (+ 1 a)}', 10)).toBe('{a = 1 r = (+ 9 a)}')
	})

	it('otherwise goes for the later of what it can reach', () => {
		expect(edited('{a = 1 b = 2 r = (+ a b)}', 10)).toBe('{a = 1 b = 9 r = (+ a b)}')
	})

	it('has a way back for arithmetic', () => {
		expect(edited('{r = (* 2 3)}', 12)).toBe('{r = (* 2 6)}')
		expect(edited('{a = 2 r = (- 10 a)}', 5)).toBe('{a = 2 r = (- 7 a)}')
		expect(edited('{a = 10 r = (- a 2)}', 5)).toBe('{a = 10 r = (- a 5)}')
		expect(edited('{a = 2 r = (- @10 a)}', 5)).toBe('{a = 5 r = (- @10 a)}')
		expect(edited('{a = 2 r = (- a)}', 5)).toBe('{a = -5 r = (- a)}')
		expect(edited('{a = 10 r = (/ a 2)}', 2)).toBe('{a = 10 r = (/ a 5)}')
		expect(edited('{a = 5 r = (/ @10 a)}', 5)).toBe('{a = 2 r = (/ @10 a)}')
		expect(edited('{a = 2 r = (** a @3)}', 27)).toBe('{a = 3 r = (** a @3)}')
		expect(edited('{a = 2 r = (** @2 a)}', 8)).toBe('{a = 3 r = (** @2 a)}')
		expect(edited('{a = 4 r = (sqrt a)}', 3)).toBe('{a = 9 r = (sqrt a)}')
	})

	it('takes another way when one cannot be', () => {
		expect(edited('{a = 1 r = (* @0 a)}', 5)).toBeNull()
		expect(edited('{a = 3 r = (* 2 a)}', 12)).toBe('{a = 3 r = (* 4 a)}')
	})

	it('reads what a coercion holds', () => {
		expect(edited('{r = (: 1 number)}', 5)).toBe('{r = (: 5 number)}')
	})

	it('goes through a closure to its arguments', () => {
		const f = 'f = (=> (x: number): number (* x 2))'
		expect(edited(`{${f} r = (f 3)}`, 10)).toBe(`{${f} r = (f 5)}`)
		expect(edited(`{${f} r = (f x=3)}`, 10)).toBe(`{${f} r = (f x=5)}`)
		expect(edited(`{${f} a = 3 r = (f a)}`, 10)).toBe(`{${f} a = 5 r = (f a)}`)
	})

	it('leaves the literals of a function, which other calls share', () => {
		const f = 'f = (=> (x: number): number 3)'
		expect(edited(`{${f} r = (f 1)}`, 10)).toBeNull()
		expect(reason(`{${f} r = (f 1)}`, 10)).toContain('function')
	})

	it('reaches what a closure captures', () => {
		const f = 'f = (=> (x: number): number (* @x k))'
		expect(edited(`{k = 2 ${f} r = (f 3)}`, 12)).toBe(`{k = 4 ${f} r = (f 3)}`)
	})

	it('stops at a host function with no way back', () => {
		expect(edited('{r = (mod 7 4)}', 1)).toBeNull()
		expect(reason('{r = (mod 7 4)}', 1)).toContain('no way back')
	})

	it('does not go through a match yet', () => {
		expect(reason('{r = (? true 1 _ 2)}', 5)).toContain('?')
	})
})

describe('solve — @', () => {
	it('leaves a pinned expression where it is', () => {
		expect(edited('{a = 1 r = (+ a @1)}', 10)).toBe('{a = 9 r = (+ a @1)}')
		expect(edited('{r = @1}', 5)).toBeNull()
		expect(reason('{r = @1}', 5)).toBe('pinned')
	})

	it('stops at a pinned name, or a pinned binding', () => {
		expect(edited('{a = 1 b = 2 r = (+ @a b)}', 10)).toBe('{a = 1 b = 9 r = (+ @a b)}')
		expect(edited('{a = @1 b = 2 r = (+ a b)}', 10)).toBe('{a = @1 b = 9 r = (+ a b)}')
		expect(edited('{a = 1 b = @2 r = (+ a b)}', 10)).toBe('{a = 8 b = @2 r = (+ a b)}')
	})

	it('stops everything when all is pinned', () => {
		expect(edited('{a = @1 b = @2 r = (+ a b)}', 10)).toBeNull()
	})

	it('holds with other metadata', () => {
		expect(edited('{r = ^{label: "L"} @1}', 5)).toBeNull()
	})
})

describe('solve — what cannot add up', () => {
	it('reports a name that would need two values', () => {
		const f = 'f = (=> (x: number): [number number] [x x])'
		expect(edited(`{${f} r = (f 1)}`, [5, 5])).toBe(`{${f} r = (f 5)}`)
		expect(edited(`{${f} r = (f 1)}`, [5, 7])).toBeNull()
		expect(reason(`{${f} r = (f 1)}`, [5, 7])).toContain('different values')
	})

	it('reports a name used twice in a sum, rather than getting it wrong', () => {
		expect(edited('{a = 1 r = (+ a a)}', 10)).toBeNull()
	})

	it('stops at what the root does not hold', () => {
		const scope = makeTopLevel({ k: lit(1) })
		const root = parse('{r = k}') as LetAST
		expect(solve(root, scope, root.bindings[0]![1], 5).ast).toBeNull()
		expect(solve(root, scope, root.bindings[0]![1], 5).diagnostics).toHaveLength(1)
	})

	it('does not run forever on a cycle or a recursion', () => {
		expect(edited('{a = (+ a b) b = (+ b a) r = a}', 5)).toBeNull()
		expect(edited('{f = (=> (x: number): number (f x)) r = (f 1)}', 5)).toBeNull()
	})
})

describe('solve — in a session', () => {
	it('edits the let-block that is the session', () => {
		const session = new Session(env)
		session.exec('a = 1')
		session.exec('r = (+ a @1)')
		const root = session.ast()
		const node: AST = root.bindings[1]![1]
		const { ast } = solve(root, env, node, 10)
		session.setAst(ast as LetAST)
		expect(session.exec('r').value).toBe(10)
		expect(session.exec('a').value).toBe(9)
	})
})

describe('solve writes numbers', () => {
	it('without what arithmetic leaves in the last digits', () => {
		expect(edited('{a = 2 r = (** @3 a)}', 81)).toBe('{a = 4 r = (** @3 a)}')
	})

	it('and keeps them when rounding would miss the value', () => {
		const printed = edited('{a = 0 r = (- a @1000000)}', 0.123456789012345)
		expect(printed).toBe(`{a = ${1000000 + 0.123456789012345} r = (- a @1000000)}`)
	})
})
