import { describe, expect, it } from 'vitest'

import { host, lit } from './build.js'
import { makeTopLevel, makeTypedFn, numberType, withInverse, withTypeMeta } from './eval.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { print } from './print.js'
import { Session } from './session.js'
import { UNSET } from './eval.js'
import { solve } from './solve.js'
import { type AST, CallAST, type Env, LetAST, RecordAST } from './types.js'

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
		expect(edited('{p = {a: 1} r = ./p/a:}', 5)).toBe('{p = {a: 5} r = ./p/a:}')
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
		expect(edited('{a = 1 b = @2 r = (+ a b)}', 10)).toBe('{a = 8 b = @2 r = (+ a b)}')
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
		expect(edited(`{${f} r = (f x: 3)}`, 10)).toBe(`{${f} r = (f x: 5)}`)
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
		expect(reason('{r = @1}', 5)).toBe('locked')
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

describe('solve with booleans', () => {
	it('goes through not', () => {
		expect(edited('{a = false r = (not a)}', false)).toBe('{a = true r = (not a)}')
	})

	it('needs only one for or to be true, and all for it to be false', () => {
		expect(edited('{a = false r = (or a @false)}', true)).toBe('{a = true r = (or a @false)}')
		expect(edited('{a = true r = (or a @false)}', false)).toBe('{a = false r = (or a @false)}')
		expect(edited('{a = false r = (or a @true)}', false)).toBeNull()
	})

	it('needs only one for and to be false, and all for it to be true', () => {
		expect(edited('{a = true r = (and a @true)}', false)).toBe('{a = false r = (and a @true)}')
		expect(edited('{a = false r = (and a @true)}', true)).toBe('{a = true r = (and a @true)}')
		expect(edited('{a = false r = (and a @false)}', true)).toBeNull()
	})

	it('has no way back through a comparison yet', () => {
		expect(reason('{a = 1 r = (< a 2)}', false)).toBeDefined()
	})
})

describe('solve for only part of a value', () => {
	it('leaves the rest to come to whatever it does', () => {
		expect(edited('{a = 1 b = 2 r = [a b]}', [5, UNSET])).toBe('{a = 5 b = 2 r = [a b]}')
		expect(edited('{x = 1 r = [x x]}', [5, UNSET])).toBe('{x = 5 r = [x x]}')
		expect(edited('{x = 1 r = [x (* x 2)]}', [5, UNSET])).toBe('{x = 5 r = [x (* x 2)]}')
		expect(edited('{a = 1 r = {p: a q: 2}}', { p: 5, q: UNSET })).toBe('{a = 5 r = {p: a q: 2}}')
	})

	it('still fails where what is asked for cannot be', () => {
		expect(edited('{x = 1 r = [x x]}', [5, 7])).toBeNull()
	})

	it('changes nothing with nothing asked for', () => {
		expect(edited('{a = 1 r = [a a]}', [UNSET, UNSET])).toBe('{a = 1 r = [a a]}')
	})
})

describe('solve through map', () => {
	it('works the function backward for each element', () => {
		expect(edited('{a = 1 b = 2 r = (map [a b] (* % 2))}', [10, 20])).toBe(
			'{a = 5 b = 10 r = (map [a b] (* % 2))}'
		)
		expect(edited('{r = (map [1 2] (* % 2))}', [10, 20])).toBe('{r = (map [5 10] (* % 2))}')
	})

	it('goes through a named function, and leaves its literals', () => {
		expect(
			edited('{f = (=> (x: number): number (+ x 1)) r = (map [1 2] f)}', [10, 2])
		).toBe('{f = (=> (x: number): number (+ x 1)) r = (map [9 1] f)}')
	})

	it('goes through what is passed to it, by name or worked out', () => {
		expect(edited('{a = 1 xs = [a 2] r = (map xs (* % 2))}', [10, 4])).toBe(
			'{a = 5 xs = [a 2] r = (map xs (* % 2))}'
		)
	})

	it('does one element, and lets the others follow what they share', () => {
		expect(
			edited('{a = 40 s = 1.5 r = (map [a (* a s)] (* % 2))}', [200, UNSET])
		).toBe('{a = 100 s = 1.5 r = (map [a (* a s)] (* % 2))}')
	})

	it('does not change what the function refers to from outside', () => {
		expect(edited('{k = 2 r = (map [1] (* % k))}', [10])).toBe('{k = 2 r = (map [5] (* % k))}')
	})

	it('needs the same length, and a function with a way back', () => {
		expect(edited('{r = (map [1 2] (* % 2))}', [1])).toBeNull()
		expect(edited('{r = (map [1] (=> (x: number): number 5))}', [6])).toBeNull()
	})
})

describe('what cannot be worked out', () => {
	const attempt = (src: string, value: unknown) => {
		const root = parse(src) as LetAST
		return solve(root, env, root.bindings.at(-1)![1], value)
	}

	it('stops with a reason, rather than failing, at what comes to nothing', () => {
		const { ast, diagnostics } = attempt('{r = (+ ../nope ../nor)}', 5)
		expect(ast).toBeNull()
		expect(diagnostics.length).toBeGreaterThan(0)
	})

	it('goes on to what can change', () => {
		expect(print(attempt('{r = (+ 1 ../nope)}', 5).ast!)).toBe('{r = (+ 5 ../nope)}')
		expect(print(attempt('{r = (+ ../nope 1)}', 5).ast!)).toBe('{r = (+ ../nope 5)}')
	})

	it('stops inside of a vector too', () => {
		expect(print(attempt('{r = [(+ ../../nope 1) 2]}', [5, 2]).ast!)).toBe('{r = [(+ ../../nope 5) 2]}')
		expect(attempt('{r = [(+ ../../nope ../../nor) 2]}', [5, 2]).ast).toBeNull()
	})

	it('has an inverse that fails be no way back', () => {
		const failing = withInverse(
			makeTypedFn([numberType], numberType, x => x, ['x']),
			() => {
				throw new Error('out of its depth')
			}
		)
		const root = new LetAST([['r', new CallAST(host(failing), [lit(1)])]], null)
		expect(solve(root, env, root.bindings[0]![1], 2).ast).toBeNull()
	})
})

describe('solve — what a parameter says of itself', () => {
	const place = withTypeMeta(numberType, new RecordAST([['changesFirst', lit(true)]]))
	const circle = makeTypedFn([place, numberType], numberType, (c, r) => (c as number) + (r as number), ['center', 'radius'])
	const places: Env = {
		ast: new LetAST([], null),
		parent: env,
		bindings: new Map([['circle', { ast: host(circle), env: null }]]),
	}
	const moved = (src: string, value: unknown) => {
		const root = parse(src) as LetAST
		const r = root.bindings.find(([name]) => name === 'r')![1]
		const { ast } = solve(root, places, r, value)
		return ast && print(ast)
	}

	it('changes what refers to it first, wherever it comes in a call', () => {
		expect(moved('{a = (circle 10 2) r = (+ ../a/center: ../a/radius:)}', 20)).toBe('{a = (circle 18 2) r = (+ ../a/center: ../a/radius:)}')
		expect(moved('{a = (circle 10 2) r = (+ ../a/radius: ../a/center:)}', 20)).toBe('{a = (circle 18 2) r = (+ ../a/radius: ../a/center:)}')
	})

	it('goes on to the rest, where that is pinned', () => {
		expect(moved('{a = (circle @10 2) r = (+ ../a/center: ../a/radius:)}', 20)).toBe('{a = (circle @10 10) r = (+ ../a/center: ../a/radius:)}')
	})

	it('still changes a literal before it', () => {
		expect(moved('{a = (circle 10 2) r = (+ ../a/center: 5)}', 20)).toBe('{a = (circle 10 2) r = (+ ../a/center: 10)}')
	})

	it('changes the later, as ever, where nothing says otherwise', () => {
		expect(moved('{a = (circle 10 2) b = 1 r = (+ ../a/radius: ../b)}', 20)).toBe('{a = (circle 10 2) b = 18 r = (+ ../a/radius: ../b)}')
	})
})

describe('solve — a path into what is pinned', () => {
	const moved = (src: string, value: unknown) => {
		const root = parse(src) as LetAST
		const r = root.bindings.find(([name]) => name === 'r')![1]
		return solve(root, env, r, value)
	}

	it('leaves it, as it is pinned as a whole', () => {
		const { ast, diagnostics } = moved('{z = @[1 2] r = ./z/0}', 5)
		expect(ast).toBeNull()
		expect(diagnostics[0]?.message).toBe('locked')
		expect(moved('{z = @{a: 7} r = ./z/a:}', 5).ast).toBeNull()
	})

	it('goes to something else, if there is something', () => {
		const { ast } = moved('{z = @[1 2] b = 3 r = (+ b ../z/0)}', 10)
		expect(ast && print(ast)).toBe('{z = @[1 2] b = 9 r = (+ b ../z/0)}')
	})

	it('leaves what is beside it as it was', () => {
		const { ast } = moved('{z = [@1 2] r = ./z/1}', 5)
		expect(ast && print(ast)).toBe('{z = [@1 5] r = ./z/1}')
	})
})
