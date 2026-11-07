import { describe, expect, it } from 'vitest'

import { evaluate, makeTypedFn, type TypeValue } from './eval.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { Runtime } from './runtime.js'
import { Session } from './session.js'
import { HostAST, type AST, LetAST } from './types.js'

const prelude = buildPrelude()
const numberType = evaluate(parse('number'), prelude).value as TypeValue

/** A host function that counts how many times it actually ran. */
function counter() {
	const state = { runs: 0, ast: null as unknown as AST }
	state.ast = new HostAST(
		makeTypedFn(
			[numberType],
			numberType,
			n => {
				state.runs++
				return n
			},
			['n']
		)
	)
	return state
}

/** A let-block with `H` bound to a counted host function, and `src` parsed. */
function program(heavy: AST, src: string): AST {
	const parsed = parse(src) as LetAST
	return new LetAST([['H', heavy], ...parsed.bindings], parsed.body)
}

describe('Runtime — incremental evaluation', () => {
	it('does not rerun an untouched sibling when another changes', () => {
		const H = counter()
		const rt = new Runtime(prelude)
		for (const b of [1, 2, 3]) {
			rt.setRoot(program(H.ast, `{a = (H 21) b = ${b} (+ a b)}`))
			expect(rt.evaluate().value).toBe(21 + b)
		}
		expect(H.runs).toBe(1)
	})

	it('reruns exactly what depends on the change', () => {
		const H = counter()
		const K = counter()
		const rt = new Runtime(prelude)
		const root = (x: number): AST => {
			const parsed = parse(
				`{a = (H x) b = (K 2) x = ${x} (+ a b)}`
			) as LetAST
			return new LetAST(
				[['H', H.ast], ['K', K.ast], ...parsed.bindings],
				parsed.body
			)
		}
		rt.setRoot(root(1))
		expect(rt.evaluate().value).toBe(3)
		rt.setRoot(root(10))
		expect(rt.evaluate().value).toBe(12)
		expect(H.runs).toBe(2)
		expect(K.runs).toBe(1)
	})

	it('hits through a nested record and vector', () => {
		const H = counter()
		const rt = new Runtime(prelude)
		for (const b of [1, 2]) {
			rt.setRoot(program(H.ast, `{r = {deep: [(H 1) 2] b: ${b}} r}`))
			rt.evaluate()
		}
		expect(H.runs).toBe(1)
	})

	it('keeps an unchanged value identical across edits', () => {
		const rt = new Runtime(prelude)
		const root = (b: number) => parse(`{shape: [1 2 3] nested: {x: 1} b: ${b}}`)
		rt.setRoot(root(1))
		const before = rt.evaluate().value as Record<string, unknown>
		rt.setRoot(root(2))
		const after = rt.evaluate().value as Record<string, unknown>
		expect(after).not.toBe(before)
		expect(after.shape).toBe(before.shape)
		expect(after.nested).toBe(before.nested)
		expect(after.b).toBe(2)
	})

	it('evaluates the same call with the same args once', () => {
		const H = counter()
		const rt = new Runtime(prelude)
		rt.setRoot(
			program(H.ast, '{f = (=> [x: number]: number (H x)) [(f 1) (f 1) (f 1)]}')
		)
		expect(rt.evaluate().value).toEqual([1, 1, 1])
		expect(H.runs).toBe(1)
	})

	it('undoes at no cost', () => {
		const H = counter()
		const rt = new Runtime(prelude)
		const first = program(H.ast, '{a = (H 1) [a 1]}')
		rt.setRoot(first)
		const before = rt.evaluate().value
		rt.setRoot(program(H.ast, '{a = (H 2) [a 2]}'))
		rt.evaluate()
		expect(H.runs).toBe(2)
		rt.setRoot(first)
		expect(rt.evaluate().value).toBe(before)
		expect(H.runs).toBe(2)
	})

	it('ignores formatting, comments and metadata', () => {
		const H = counter()
		const rt = new Runtime(prelude)
		for (const src of [
			'{a = (H 1) a}',
			'{ a  =  (H   1) ; comment\n a }',
			'{a = ^{label: "x"} (H 1) a}',
		]) {
			rt.setRoot(program(H.ast, src))
			expect(rt.evaluate().value).toBe(1)
		}
		expect(H.runs).toBe(1)
	})

	it('hits on a separately parsed copy, including %', () => {
		const rt = new Runtime(prelude)
		const src = '(map [1 2] #(+ % 1))'
		rt.setRoot(parse(src))
		const before = rt.evaluate().value
		rt.setRoot(parse(src))
		expect(rt.evaluate().value).toBe(before)
	})
})

describe('Runtime — correctness of hits', () => {
	const run = (...sources: string[]): unknown[] => {
		const rt = new Runtime(prelude)
		return sources.map(src => {
			rt.setRoot(parse(src))
			return rt.evaluate().value
		})
	}

	it('sees a change through a name', () => {
		expect(run('{x = 1 y = (+ x 1) y}', '{x = 2 y = (+ x 1) y}')).toEqual([2, 3])
	})

	it('distinguishes the same expression in different scopes', () => {
		expect(run('[{x = 1 (+ x 1)} {x = 2 (+ x 1)}]')).toEqual([[2, 3]])
	})

	it('sees a change through a path', () => {
		expect(run('{w: 1 h: ./w:}', '{w: 2 h: ./w:}')).toEqual([
			{ w: 1, h: 1 },
			{ w: 2, h: 2 },
		])
		expect(run('[1 (+ ../0 1)]', '[5 (+ ../0 1)]')).toEqual([
			[1, 2],
			[5, 6],
		])
	})

	it('sees a change through a descending path', () => {
		expect(
			run('[{k = 1 y = (+ k 1) y} ./0/y]', '[{k = 5 y = (+ k 1) y} ./0/y]')
		).toEqual([
			[2, 2],
			[6, 6],
		])
	})

	it('sees a change in what a closure captures', () => {
		expect(
			run(
				'{k = 1 f = (=> [x: number]: number (+ x k)) (f 1)}',
				'{k = 2 f = (=> [x: number]: number (+ x k)) (f 1)}'
			)
		).toEqual([2, 3])
	})

	it('distinguishes different arguments to one closure', () => {
		expect(
			run('{f = (=> [x: number]: number (* x 2)) [(f 1) (f 2)]}')
		).toEqual([[2, 4]])
	})

	it('handles self and mutual recursion across edits', () => {
		const fact = (extra: number) =>
			`{extra = ${extra} f = (=> [n: number]: number (? (== n 0) true 1 _ (* n (f (- n 1))))) [(f 4) extra]}`
		expect(run(fact(1), fact(2))).toEqual([
			[24, 1],
			[24, 2],
		])
		const even = (start: number) =>
			`{e = (=> [n: number]: boolean (? (== n 0) true true _ (o (- n 1)))) o = (=> [n: number]: boolean (? (== n 0) true false _ (e (- n 1)))) (e ${start})}`
		expect(run(even(4), even(3))).toEqual([true, false])
	})

	it('does not mix up swapped names in a recursive group', () => {
		const src = (a: string, b: string) =>
			`{a = (=> [n: number]: number (? (== n 0) true ${a} _ (b (- n 1)))) b = (=> [n: number]: number (? (== n 0) true ${b} _ (a (- n 1)))) (a 1)}`
		expect(run(src('1', '2'), src('2', '1'))).toEqual([2, 1])
	})

	it('does not treat equal numbers of different sign or type as one', () => {
		expect(run('[0]', '["0"]', '[false]')).toEqual([[0], ['0'], [false]])
	})

	it('reports cycles the same way each time', () => {
		const rt = new Runtime(prelude)
		const root = () => parse('{a = b b = a a}')
		rt.setRoot(root())
		const first = rt.evaluate().diagnostics.map(d => d.message)
		rt.setRoot(root())
		expect(rt.evaluate().diagnostics.map(d => d.message)).toEqual(first)
		expect(first).toContain('cycle detected')
	})

	it('does not cache a value that depends on itself through a function', () => {
		const src =
			'{p = {f = (=> [k: number]: number (? (< k 4) true {r = k p} _ (+ 1 (f (- k 1))))) (f 8)} p}'
		const plain = evaluate(parse(src), prelude).value
		const rt = new Runtime(prelude, { heavyMs: 0 })
		for (let i = 0; i < 2; i++) {
			rt.setRoot(parse(src))
			expect(rt.evaluate().value).toEqual(plain)
		}
	})

	it('still caches ordinary recursion', () => {
		const rt = new Runtime(prelude)
		const root = (extra: number) =>
			parse(
				`{extra = ${extra} f = (=> [n: number]: number (? (< n 1) true 1 _ (* n (f (- n 1))))) [(f 9) extra]}`
			)
		rt.setRoot(root(1))
		rt.evaluate()
		rt.resetStats()
		rt.setRoot(root(2))
		expect(rt.evaluate().value).toEqual([362880, 2])
		expect(rt.stats().computed).toBeLessThanOrEqual(2)
	})

	it('does not reuse a result that cut a cycle short', () => {
		// Both roots reach the cycle through `a` first when working out
		// signatures, but the second only evaluates `b`, entering at `b`.
		const first = '{a = [b] b = [a] [a b]}'
		const second = '{a = [b] b = [a] (? false true a _ b)}'
		const plain = (src: string) => evaluate(parse(src), prelude).value
		expect(run(first, second)).toEqual([plain(first), plain(second)])
	})

	it('distinguishes one argument cast by different parameter types', () => {
		const arg = '(? true true "s" _ 1)'
		const rt = new Runtime(prelude, { heavyMs: 0 })
		rt.setRoot(
			parse(
				`[((=> [x: number]: _ [x]) ${arg}) ((=> [x: string]: _ [x]) ${arg})]`
			)
		)
		expect(rt.evaluate().value).toEqual([[0], ['s']])
	})

	it('does not cache a result of runaway recursion', () => {
		const rt = new Runtime(prelude)
		rt.setRoot(parse('{f = (=> [x: number]: number (f x)) [(f 1) 2]}'))
		expect(rt.evaluate().diagnostics.map(d => d.message)).toEqual([
			'recursion too deep',
		])
		rt.setRoot(parse('[1 2]'))
		expect(rt.evaluate().value).toEqual([1, 2])
	})

	it('keeps diagnostics on a cached result', () => {
		const rt = new Runtime(prelude)
		const root = (b: number) => parse(`{a = (+ 1 "x") b = ${b} (+ a b)}`)
		rt.setRoot(root(1))
		const first = rt.evaluate().diagnostics.map(d => d.message)
		rt.setRoot(root(2))
		expect(first.length).toBeGreaterThan(0)
		expect(rt.evaluate().diagnostics.map(d => d.message)).toEqual(first)
	})
})

describe('Runtime — reading', () => {
	it('reads a sub-expression in its scope, evaluating only that', () => {
		const H = counter()
		const K = counter()
		const parsed = parse('{a = (H 1) b = {c = (K 2) (+ c a)} b}') as LetAST
		const rt = new Runtime(prelude)
		rt.setRoot(
			new LetAST([['H', H.ast], ['K', K.ast], ...parsed.bindings], parsed.body)
		)
		expect(rt.read('a').value).toBe(1)
		expect(K.runs).toBe(0)
		expect(rt.read('b', 'c').value).toBe(2)
		expect(rt.read('nope').value).not.toBe(1)
		expect(rt.read('b').value).toBe(3)
		expect(H.runs).toBe(1)
		expect(K.runs).toBe(1)
	})

	it('yields unit before a root is set', () => {
		const rt = new Runtime(prelude)
		expect(rt.root).toBeNull()
		expect(rt.evaluate().diagnostics).toEqual([])
	})
})

describe('Runtime — memory', () => {
	const collectGarbage = async (): Promise<void> => {
		const gc = (globalThis as { gc?: () => void }).gc!
		for (let i = 0; i < 6; i++) {
			gc()
			await new Promise(resolve => setTimeout(resolve, 10))
		}
	}

	it('does not keep old roots alive', async () => {
		const rt = new Runtime(prelude, { maxEntries: 8 })
		const shared = parse('(+ 1 2)')
		const roots = (() => {
			const refs: WeakRef<object>[] = []
			for (let i = 0; i < 50; i++) {
				const root = new LetAST(
					[['a', shared], ['b', parse(String(i))]],
					parse('(+ a b)')
				)
				rt.setRoot(root)
				rt.evaluate()
				refs.push(new WeakRef(root))
			}
			return refs
		})()
		rt.setRoot(parse('0'))
		await collectGarbage()
		const alive = roots.filter(r => r.deref() !== undefined).length
		expect(alive).toBeLessThanOrEqual(1)
	})

	it('stays within maxEntries and keeps what is in use', () => {
		const H = counter()
		const rt = new Runtime(prelude, { maxEntries: 8 })
		for (let i = 0; i < 200; i++) {
			rt.setRoot(program(H.ast, `{a = (H 1) b = ${i} [a (+ b 1)]}`))
			rt.evaluate()
			expect(rt.stats().entries).toBeLessThanOrEqual(8 + 3)
		}
		expect(H.runs).toBe(1)
	})

	it('does not grow with calls inside a function', () => {
		const rt = new Runtime(prelude)
		rt.setRoot(parse('{f = (=> [x: number]: number (+ x 1)) (map (range 0 500) f)}'))
		rt.evaluate()
		expect(rt.stats().entries).toBeLessThan(50)
	})

	it('caches a heavy call inside a function', () => {
		let runs = 0
		const slow = new HostAST(
			makeTypedFn(
				[numberType],
				numberType,
				n => {
					runs++
					const until = performance.now() + 3
					while (performance.now() < until);
					return n
				},
				['n']
			)
		)
		const rt = new Runtime(prelude)
		rt.setRoot(
			program(slow, '{f = (=> [x: number]: number (H x)) (map [1 1 2 1] f)}')
		)
		expect(rt.evaluate().value).toEqual([1, 1, 2, 1])
		expect(runs).toBe(2)
	})
})

describe('Runtime — agrees with plain evaluation under random edits', () => {
	let seed = 12345
	const random = (n: number): number => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff
		return seed % n
	}
	const pick = <T>(xs: ReadonlyArray<T>): T => xs[random(xs.length)]!

	const atom = (scope: ReadonlyArray<string>): string => {
		const fromScope = scope.length > 0 && random(3) > 0
		if (fromScope) return pick(scope)
		return random(8) === 0
			? pick(['./0', '../0', '../1', './a', '../b', './0/a', 'nope', '"s"'])
			: String(random(9))
	}

	/** Numeric expressions, so that a wrong dependency shows up in the value. */
	const expr = (depth: number, scope: ReadonlyArray<string>): string => {
		if (depth <= 0) return atom(scope)
		const sub = (extra: ReadonlyArray<string> = []): string =>
			expr(depth - 1, [...scope, ...extra])
		switch (random(9)) {
			case 0:
			case 1:
				return `(+ ${sub()} ${sub()})`
			case 2:
				return `[${sub()} ${sub()}].${random(2)}`
			case 3:
				return `{a: ${sub()} b: ${sub()}}.${pick(['a', 'b'])}`
			case 4: {
				const name = pick(['p', 'q', 'r'])
				return `{${name} = ${sub([name])} ${sub([name])}}`
			}
			case 5: {
				const param = pick(['x', 'y'])
				return `((=> [${param}: number]: number ${sub([param])}) ${sub()})`
			}
			case 6:
				return `(? (< ${sub()} 4) true ${sub()} _ ${sub()})`
			case 7: {
				const name = pick(['f', 'g'])
				return `{${name} = (=> [k: number]: number (? (< k 1) true ${sub(['k'])} _ (+ 1 (${name} (- k 1))))) (${name} ${random(3)})}`
			}
			default:
				return `(reduce (map [1 2] (=> [e: number]: number ${sub(['e'])})) 0 +)`
		}
	}

	const smallEdit = (src: string): string => {
		const digits = [...src.matchAll(/(?<![\w./"-])\d(?![\w"])/g)]
		if (digits.length === 0) return src
		const at = pick(digits).index!
		return src.slice(0, at) + String(random(9)) + src.slice(at + 1)
	}

	const show = (value: unknown): string =>
		JSON.stringify(value, (_key, v: unknown) =>
			typeof v === 'symbol' ? String(v) : typeof v === 'function' ? 'fn' : v
		)
	const messages = (result: { diagnostics: ReadonlyArray<{ message: string }> }) =>
		[...new Set(result.diagnostics.map(d => d.message))].sort()

	it('over many programs, including undo and tight eviction', () => {
		let compared = 0
		for (let i = 0; i < 300; i++) {
			const rt = new Runtime(prelude, {
				maxEntries: pick([5, 50, 20000]),
				heavyMs: pick([0, 1]),
			})
			let src = `{a = ${expr(3, ['b'])} b = ${expr(3, [])} c = ${expr(3, ['a', 'b'])} (+ a b c)}`
			const history: string[] = []
			for (let step = 0; step < 8; step++) {
				history.push(src)
				const current = random(6) === 0 ? pick(history) : src
				rt.setRoot(parse(current))
				const incremental = rt.evaluate()
				const plain = evaluate(parse(current), prelude)
				const ranAway = [incremental, plain].some(r =>
					messages(r).includes('recursion too deep')
				)
				if (ranAway) {
					src = smallEdit(src)
					continue
				}
				expect(show(incremental.value), current).toBe(show(plain.value))
				expect(messages(incremental), current).toEqual(messages(plain))
				compared++
				src = smallEdit(src)
			}
		}
		expect(compared).toBeGreaterThan(1500)
	})
})

describe('Runtime — metadata', () => {
	const after = (before: string, edited: string, name: string) => {
		const runtime = new Runtime(buildPrelude())
		runtime.setRoot(parse(before))
		const first = runtime.read(name).value
		runtime.resetStats()
		runtime.setRoot(parse(edited))
		const { value } = runtime.read(name)
		return { first, value, computed: runtime.stats().computed }
	}

	it('recomputes nothing for what evaluation does not read', () => {
		const label = after('{a = ^{label: "A"} (+ 1 2)}', '{a = ^{label: "B"} (+ 1 2)}', 'a')
		expect(label.computed).toBe(0)
		const range = after('{a = ^{min: 0} (+ 1 2)}', '{a = ^{min: 1 suffix: "%"} (+ 1 2)}', 'a')
		expect(range.computed).toBe(0)
		const reference = after('{k = 1 a = ^{max: k} (+ 1 2)}', '{k = 2 a = ^{max: k} (+ 1 2)}', 'a')
		expect(reference.computed).toBe(0)
	})

	it('recomputes for a default, and for what one refers to', () => {
		const src = (d: number) => `{P = ^{default: ${d}} number a = ^P "x"}`
		const direct = after(src(1), src(2), 'a')
		expect([direct.first, direct.value]).toEqual([1, 2])
		const via = (k: number) => `{k = ${k} P = ^{default: k} number a = ^P "x"}`
		const reference = after(via(1), via(2), 'a')
		expect([reference.first, reference.value]).toEqual([1, 2])
	})

	it('recomputes for #_, and not for what it bypasses', () => {
		const on = after('{a = (+ 1 2)}', '{a = #_(+ 1 2)}', 'a')
		expect(on.first).toBe(3)
		const k = (n: number) => `{k = ${n} a = [#_k 1]}`
		const inside = after(k(1), k(2), 'a')
		expect(inside.computed).toBe(0)
		const bound = (d: string) => `{b = ${d} a = (+ b 1)}`
		expect(after(bound('1'), bound('#_1'), 'a').computed).toBe(0)
	})
})

describe('a frame a runtime has adopted', () => {
	const sessionWith = (heavy: AST) => {
		const session = new Session(prelude)
		const edit = (b: number) =>
			session.setAst(
				new LetAST(
					[
						['H', heavy],
						...(parse(`{a = (H 1) b = ${b} c = [a b]}`) as LetAST).bindings,
					],
					null
				)
			)
		return { session, edit, read: (name: string) => evaluate(session.bindingAst(name)!, session.env) }
	}

	it('has a plain evaluate reuse what an edit left as it was', () => {
		const heavy = counter()
		const { edit, read } = sessionWith(heavy.ast)
		edit(1)
		expect(read('c').value).toEqual([1, 1])
		expect(heavy.runs).toBe(1)
		edit(2)
		expect(read('c').value).toEqual([1, 2])
		expect(heavy.runs).toBe(1)
	})

	it('keeps an unchanged value === across an edit', () => {
		const { session, edit } = sessionWith(counter().ast)
		const vector = () => evaluate(parse('[a]'), session.env).value
		edit(1)
		const before = vector()
		edit(2)
		expect(vector()).toBe(before)
	})

	it('leaves a frame nothing has adopted alone', () => {
		const heavy = counter()
		const env = () => prelude
		const ast = (n: number) =>
			new LetAST([['H', heavy.ast], ['a', parse('(H 1)')], ['b', parse(`${n}`)]], parse('a'))
		evaluate(ast(1), env())
		evaluate(ast(2), env())
		expect(heavy.runs).toBe(2)
	})

	it('recomputes what an edit did reach', () => {
		const heavy = counter()
		const session = new Session(prelude)
		const edit = (n: number) =>
			session.setAst(
				new LetAST([['H', heavy.ast], ['a', parse(`(H ${n})`)]], null)
			)
		edit(1)
		expect(evaluate(parse('a'), session.env).value).toBe(1)
		edit(2)
		expect(evaluate(parse('a'), session.env).value).toBe(2)
		expect(heavy.runs).toBe(2)
	})
})
