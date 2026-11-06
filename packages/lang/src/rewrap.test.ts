import { describe, expect, it } from 'vitest'

import { path } from './build.js'
import { check } from './check.js'
import { evaluate, pushLetFrame } from './eval.js'
import { infer } from './infer.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { print } from './print.js'
import { renameBinding } from './rename.js'
import { shortestPath, withoutCall, withPathsInto, withPathsMoved } from './rewrap.js'
import { Runtime } from './runtime.js'
import { type AST, CallAST, LetAST, MetaAST, PathAST, withoutMeta } from './types.js'

const env = (() => {
	const prelude = buildPrelude()
	const block = parse('{hold = (=> (held: _ note: _): _ held)}') as LetAST
	return { ast: new LetAST([], null), parent: prelude, bindings: new Map(block.bindings.map(([name, ast]) => [name, { ast, env: prelude }])) } as never
})()

/** `src`, with the binding `name` put into `(hold … "x")`, and paths left as they are. */
function wrapped(src: string, name: string): { root: LetAST; call: CallAST } {
	const root = parse(src) as LetAST
	const call = (held: AST) => new CallAST(parse('hold'), [held, parse('"x"')])
	let made!: CallAST
	const bindings = root.bindings.map(([n, ast]): readonly [string, AST] => {
		if (n !== name) return [n, ast]
		made = call(withoutMeta(ast))
		return [n, ast.kind === 'meta' ? new MetaAST(ast.metadata, made) : made]
	})
	return { root: new LetAST(bindings, root.body), call: made }
}

const into = (src: string, name: string): LetAST => {
	const { root, call } = wrapped(src, name)
	return withPathsInto(root, env, call) as LetAST
}

const valueIn = (root: AST, name: string): unknown =>
	evaluate(new LetAST((root as LetAST).bindings, parse(name)), env).value

describe('withPathsInto', () => {
	it('has a path go by way of the call, to what it came to', () => {
		const next = into('{a = (take [1 2 3] 2) b = ./a/n:}', 'a')
		expect(print(next)).toContain('b = ./a/held:/n:')
		expect(valueIn(next, 'b')).toBe(2)
	})

	it('has what climbs out of the node climb one more', () => {
		const next = into('{a = 1 b = [../a 2]}', 'b')
		expect(print(next)).toContain('(hold [../../a 2] "x")')
		expect(valueIn(next, 'b')).toEqual([1, 2])
	})

	it('has a path that is itself the node climb out of the call', () => {
		const next = into('{a = 1 b = ./a}', 'b')
		expect(print(next)).toContain('(hold ../a "x")')
		expect(valueIn(next, 'b')).toBe(1)
	})

	it('leaves what stays within the node alone', () => {
		const src = '{a = 1 b = [5 ./0]}'
		const before = (parse(src) as LetAST).bindings[1]![1]
		expect(print(into(src, 'b'))).toContain(`(hold ${print(before)} "x")`)
	})

	it('does both for what is in each of two', () => {
		let root = parse('{a = (take [1 2 3] 2) b = [../a/n: 7]}') as AST
		for (const name of ['a', 'b']) {
			const block = root as LetAST
			const held = block.bindings.find(([n]) => n === name)![1]
			const call = new CallAST(parse('hold'), [held, parse('"x"')])
			root = withPathsInto(
				new LetAST(block.bindings.map(([n, ast]) => [n, n === name ? call : ast] as const), null),
				env,
				call
			)
		}
		expect(check(root, env).filter(d => d.level === 'error')).toEqual([])
		expect(valueIn(root, 'b')).toEqual([2, 7])
	})

	it('goes past metadata', () => {
		const next = into('{a = ^{label: "A"} (take [1 2 3] 2) b = ./a/n:}', 'a')
		expect(valueIn(next, 'b')).toBe(2)
	})

	it('keeps what nothing changes in ===', () => {
		const { root, call } = wrapped('{a = 1 c = [1 2] b = 2}', 'a')
		const next = withPathsInto(root, env, call) as LetAST
		expect(next.bindings[1]![1]).toBe(root.bindings[1]![1])
	})

	it('leaves what already led nowhere as it is', () => {
		expect(print(into('{a = 1 b = ./nope/n}', 'a'))).toContain('b = ./nope/n')
	})
})

describe('withoutCall', () => {
	const roundTrip = (src: string, name: string): string => {
		const next = into(src, name)
		const call = withoutMeta(next.bindings.find(([n]) => n === name)![1]) as CallAST
		return print(withoutCall(next, env, call)!)
	}

	it('comes back to what was written, whichever way a path goes', () => {
		for (const [src, name] of [
			['{a = (take [1 2 3] 2) b = ./a/n:}', 'a'],
			['{a = 1 b = [../a 2]}', 'b'],
			['{a = 1 b = ./a}', 'b'],
			['{a = 1 b = [5 ./0]}', 'b'],
			['{a = ^{label: "A"} (take [1 2 3] 2) b = ./a/n:}', 'a'],
		] as const) {
			expect(roundTrip(src, name)).toBe(print(parse(src)))
		}
	})

	it('leaves what led to the rest of the call with nothing to lead to', () => {
		const root = parse('{a = (hold 1 "x") b = ./a/note:}') as LetAST
		const next = withoutCall(root, env, root.bindings[0]![1] as CallAST)!
		expect(print(next)).toBe('{a = 1 b = ./a/note:}')
	})

	it('has nothing to do without a first argument', () => {
		const root = parse('{a = (hold)}') as LetAST
		expect(withoutCall(root, env, root.bindings[0]![1] as CallAST)).toBeNull()
	})
})

describe('paths from the root', () => {
	const at = (src: string) => evaluate(parse(src), env)

	it('reach the same from anywhere', () => {
		expect(at('{a = {b = [10 20]} c = {d = [[/a/b/1]]} /c/d/0/0}').value).toBe(20)
		expect(at('[5 [[/0]]]').value).toEqual([5, [[5]]])
		expect(at('{w: 3 h: {i: /w:}}').value).toEqual({ w: 3, h: { i: 3 } })
	})

	it('start at the program, not at what a host binds', () => {
		expect(at('{a = 1 b = /inc b}').diagnostics.length).toBeGreaterThan(0)
		expect(at('/a').diagnostics[0]?.message).toContain('no program')
	})

	it('are told from division', () => {
		expect(at('(/ 6 2)').value).toBe(3)
		expect(at('(reduce [8 2] 16 /)').value).toBe(1)
		expect(print(parse('/a/0/b'))).toBe('/a/0/b')
		expect(parse('/a/b')).toEqual(path('/', 'a', 'b'))
	})

	it('are seen by what looks at a program without running it', () => {
		expect(check(parse('{a = 1 b = [/a /z]}'), env).map(d => d.message)).toEqual([
			'path segment not found: z',
		])
		const inside = pushLetFrame(parse('{a = 1}') as LetAST, env)
		expect(infer(parse('/a'), inside)?.typeName).toBe('number')
	})

	it('follow a rename of what they go by', () => {
		const renamed = renameBinding(parse('{a = {b = 1} c = [/a/b]}') as LetAST, 'a', 'z')
		expect(print(renamed!)).toBe('{z = {b = 1} c = [/z/b]}')
	})

	it('are worked out again when what they reach changes', () => {
		const runtime = new Runtime(env)
		const value = (src: string) => runtime.evaluate(parse(src), env).value
		expect(value('{a = 1 b = [[/a]] d = (first (first b)) d}')).toBe(1)
		expect(value('{a = 2 b = [[/a]] d = (first (first b)) d}')).toBe(2)
	})

	it('go by way of a call put around what they go by, and back', () => {
		const next = into('{a = [1 2] b = {c = /a/0}}', 'a')
		expect(print(next)).toContain('c = /a/held:/0')
		expect(evaluate(next, env).diagnostics).toEqual([])
		const call = next.bindings[0]![1] as CallAST
		expect(print(withoutCall(next, env, call)!)).toBe('{a = [1 2] b = {c = /a/0}}')
	})

	it('are left alone by a call around the path itself', () => {
		const next = into('{a = 1 b = /a}', 'b')
		expect(print(next)).toContain('(hold /a "x")')
		const call = next.bindings[1]![1] as CallAST
		expect(print(withoutCall(next, env, call)!)).toBe('{a = 1 b = /a}')
	})

	it('go where a binding is moved', () => {
		const moved = withPathsMoved(parse('{a = [1] b = /a/0 c = /ab}'), env, ['a'], ['g', 'a'])
		expect(print(moved)).toBe('{a = [1] b = /g/a/0 c = /ab}')
	})

	it('are the shortest only if they are', () => {
		const pick = (...paths: PathAST[]) => print(shortestPath(paths[0]!, ...paths.slice(1)))
		expect(pick(path('..', '..', 'a'), path('/', 'a'))).toBe('/a')
		expect(pick(path('..', 'a'), path('/', 'g', 'a'))).toBe('../a')
		expect(pick(path('..', 'a', 'b'), path('/', 'ggg', 'b'))).toBe('../a/b')
	})
})
