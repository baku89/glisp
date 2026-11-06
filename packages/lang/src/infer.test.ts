import { describe, expect, it } from 'vitest'

import { check } from './check.js'
import { evaluate, makeTypedFn, printType, type TypeValue, typeFits, unwrapLazy } from './eval.js'
import { infer, resolveTypeSlot } from './infer.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { Session } from './session.js'
import { HostAST, LetAST } from './types.js'

const env = buildPrelude()
describe('literals', () => {
	it('have the base types, whatever those names mean in scope', () => {
		const shadowed = infer(parse('{number = string 1}'), env)
		expect(shadowed?.typeName).toBe('number')
		expect(check(parse('{number = string (+ 1 1)}'), env)).toEqual([])
	})
})

const typeOf = (src: string): string | null =>
	infer(parse(src), env)?.typeName ?? null
const problems = (src: string): string[] =>
	check(parse(src), env).map(d => d.message)
const slot = (src: string): TypeValue => resolveTypeSlot(parse(src), env)!
const value = (src: string): unknown => evaluate(parse(src), env).value

describe('infer — generics', () => {
	it('solves a generic from an argument', () => {
		expect(typeOf('((=> (T) (x: T): T x) 1)')).toBe('number')
		expect(typeOf('((=> (T) (x: T): T x) "s")')).toBe('string')
		expect(typeOf('((=> (T U) (a: T b: U): U b) 1 "s")')).toBe('string')
	})

	it('solves through structure', () => {
		expect(typeOf('((=> (T) (xs: [...T]): T (first xs)) [1 2])')).toBe('number')
		expect(typeOf('((=> (T) (r: {x: T}): T r.x) {x: "s"})')).toBe('string')
		expect(typeOf('((=> (T) (p: [T T]): [...T] p) [1 2])')).toBe('[...number]')
	})

	it('solves by keyword argument', () => {
		expect(typeOf('((=> (T) (x: T y: number): T x) y: 1 x: "s")')).toBe('string')
	})

	it('leaves an unsolved generic as unknown', () => {
		expect(typeOf('((=> (T) (x: number): T x) 1)')).toBe('_')
	})

	it('types a generic function value by its signature', () => {
		expect(typeOf('(=> (T) (x: T): T x)')).toBe('(=> (T) (x: T): T)')
	})

	it('reports two uses of a generic that do not agree', () => {
		expect(problems('((=> (T) (a: T b: T): T a) 1 "s")')).toEqual([
			'generic T resolved to number earlier but argument here is string',
		])
	})

	it('lets a generic widen to what both uses fit', () => {
		expect(problems('((=> (T) (a: T b: T): T a) [1] [...[1 2]])')).toEqual([])
	})

	it('keeps a generic opaque inside its own body', () => {
		expect(problems('(=> (T) (x: T): number x)')).toEqual([
			'return type mismatch: expected number, got T',
		])
		expect(problems('(=> (T) (x: T): T x)')).toEqual([])
		expect(problems('(=> (T) (x: T): number (+ x 1))')).toEqual([
			'type mismatch: expected number, got T',
		])
	})
})

describe('infer — the prelude is generic', () => {
	it('types vector operations by their elements', () => {
		expect(typeOf('(first [1 2])')).toBe('number')
		expect(typeOf('(last ["a"])')).toBe('string')
		expect(typeOf('(take [1 2] 1)')).toBe('[...number]')
		expect(typeOf('(drop ["a"] 1)')).toBe('[...string]')
		expect(typeOf('(reverse [1])')).toBe('[...number]')
		expect(typeOf('(range 0 3)')).toBe('[...number]')
		expect(typeOf('(split "a,b" ",")')).toBe('[...string]')
		expect(typeOf('(keys {a: 1})')).toBe('[...string]')
	})

	it('types map through the function it is given', () => {
		expect(typeOf('(map [1 2] (=> (x: number): string "s"))')).toBe('[...string]')
		expect(typeOf('(map ["a"] (=> (x: string): number 1))')).toBe('[...number]')
	})

	it('infers the parameter of a function given to map', () => {
		expect(typeOf('(map [1 2] (+ % 1))')).toBe('[...number]')
		expect(typeOf('(map [1 2] (=> (x: _): _ (+ x 1)))')).toBe('[...number]')
		expect(typeOf('(map [1 2] [% %])')).toBe('[...[number number]]')
	})

	it('types filter and reduce', () => {
		expect(typeOf('(filter [1 2] (> % 1))')).toBe('[...number]')
		expect(typeOf('(reduce [1 2] 0 +)')).toBe('number')
		expect(typeOf('(reduce [1 2] "" (=> (acc: string x: number): string acc))')).toBe('string')
	})

	it('chains through pipes and nested calls', () => {
		expect(typeOf('(first (map [1 2] (+ % 1)))')).toBe('number')
		expect(typeOf('(|> [1 2] (map % (+ % 1)) first)')).toBe('number')
		expect(typeOf('(|> 1 (+ % 1))')).toBe('number')
		expect(typeOf('(+ (first [1 2]) 1)')).toBe('number')
	})

	it('treats a mixed vector as a vector of anything', () => {
		expect(typeOf('(reverse ["a" 1])')).toBe('vector')
		expect(typeOf('(first ["a" 1])')).toBe('_')
		expect(problems('(reverse ["a" 1])')).toEqual([])
		expect(problems('(map [1 "a"] (=> (x: _): _ x))')).toEqual([])
	})

	it('finds a mismatch through a generic', () => {
		expect(problems('(+ (first ["a"]) 1)')).toEqual([
			'type mismatch: expected number, got string',
		])
		expect(problems('(map [1] (=> (x: string): string x))')).toEqual([
			'generic T resolved to number earlier but argument here is string',
		])
		expect(problems('(filter [1] (+ % 1))')).toEqual([
			'type mismatch: expected (=> (x: number): boolean), got (=> (%1: number): number)',
		])
		expect(problems('(+ (first [1]) 1)')).toEqual([])
	})

	it('gets evaluated values right now that first has a type', () => {
		expect(value('(+ (first [1 2]) 1)')).toBe(2)
		expect(value('(* (reduce [1 2] 0 +) 2)')).toBe(6)
	})
})

describe('type constructors', () => {
	it('applies vector and IO', () => {
		expect(slot('(vector number)').typeName).toBe('[...number]')
		expect(slot('(IO number)').typeName).toBe('(IO number)')
		expect(slot('(IO (vector string))').typeName).toBe('(IO [...string])')
		expect(slot('(vector (vector number))').typeName).toBe('[...[...number]]')
	})

	it('is the same type however it is written', () => {
		expect(slot('(vector number)')).toBe(slot('[...number]'))
		expect(slot('vector')).toBe(slot('[..._]'))
	})

	it('solves a generic constructor', () => {
		const id = '(=> (F T) (x: (F T)): (F T) x)'
		expect(typeOf(`(${id} [1 2])`)).toBe('[...number]')
		expect(typeOf(`(${id} (: 1 (IO number)))`)).toBe('(IO number)')
	})

	it('extracts through a generic constructor', () => {
		const unwrap = '(=> (F T) (x: (F T)): T (: () T))'
		expect(typeOf(`(${unwrap} ["a"])`)).toBe('string')
		expect(typeOf(`(${unwrap} (: 1 (IO number)))`)).toBe('number')
	})

	it('builds a generic constructor around another type', () => {
		const remap = '(=> (F T) (x: (F T)): (F string) (: () (F string)))'
		expect(typeOf(`(${remap} [1 2])`)).toBe('[...string]')
		expect(typeOf(`(${remap} (: 1 (IO number)))`)).toBe('(IO string)')
	})

	it('is covariant', () => {
		expect(typeFits(slot('(IO (vector number))'), slot('(IO vector)'))).toBe(true)
		expect(typeFits(slot('(IO number)'), slot('(IO string)'))).toBe(false)
		expect(typeFits(slot('[...number]'), slot('[...string]'))).toBe(false)
	})
})

describe('type slots', () => {
	it('reads literal forms as types', () => {
		expect(slot('[number string]').typeName).toBe('[number string]')
		expect(slot('[number ...string]').typeName).toBe('[number ...string]')
		expect(slot('{x: number y?: string}').typeName).toBe('{x: number y?: string}')
		expect(slot('(=> (number number): number)').typeName).toBe(
			'(=> (number number): number)'
		)
	})

	it('takes a value written as it is for the type of just that value', () => {
		expect(resolveTypeSlot(parse('1'), env)?.typeName).toBe('1')
		expect(resolveTypeSlot(parse('[1 "a"]'), env)?.typeName).toBe('[1 "a"]')
		expect(resolveTypeSlot(parse('()'), env)?.typeName).toBe('unit')
		expect(value('(: 2 1)')).toBe(1)
	})

	it('rejects what is not a type', () => {
		expect(resolveTypeSlot(parse('(+ 1 2)'), env)).toBeNull()
		expect(resolveTypeSlot(parse('[...number string]'), env)).toBeNull()
		expect(resolveTypeSlot(parse('nope'), env)).toBeNull()
	})

	it('coerces through each of them', () => {
		expect(value('(: [1 2] [...number])')).toEqual([1, 2])
		expect(value('(: [1 "a"] [...number])')).toEqual([])
		expect(value('(: [1 "a"] [number string])')).toEqual([1, 'a'])
		expect(value('(: [1] [number string])')).toEqual([0, ''])
		expect(value('(: {x: 1} {x: number})')).toEqual({ x: 1 })
		expect(value('(: {x: "a"} {x: number})')).toEqual({ x: 0 })
		expect(value('(: {} {x: number y?: string})')).toEqual({ x: 0, y: '' })
		expect(value('(: {x: 1} {x: number y?: string})')).toEqual({ x: 1 })
	})

	it('lifts a value to a constant function', () => {
		expect(value('(map [1 2] (: 20 (=> (x: number): number)))')).toEqual([20, 20])
		const r = evaluate(parse('(: "s" (=> (x: number): number))'), env)
		expect(r.diagnostics.length).toBeGreaterThan(0)
	})

	it('checks a parameter of each form at run time', () => {
		const r = evaluate(parse('((=> (x: [...number]): _ x) (? true true ["a"] _ 1))'), env)
		expect(r.value).toEqual([])
		expect(r.diagnostics.length).toBeGreaterThan(0)
	})

	it('handles a recursive type', () => {
		const tree = (v: string) =>
			`{Tree = {value: number children: [...Tree]} (: ${v} Tree)}`
		const leaf = '{value: 1 children: []}'
		expect(value(tree(`{value: 0 children: [${leaf}]}`))).toEqual({
			value: 0,
			children: [{ value: 1, children: [] }],
		})
		expect(value(tree(`{value: 0 children: [{value: "bad" children: []}]}`))).toEqual({
			value: 0,
			children: [],
		})
	})

	it('compares recursive types without looping', () => {
		const a = resolveTypeSlot(
			parse('{Tree = {children: [...Tree]} Tree}').kind === 'let'
				? (parse('{Tree = {children: [...Tree]} Tree}') as LetAST).body!
				: parse('0'),
			env
		)
		expect(a).toBeNull()
		const session = new Session(env)
		session.exec('A = {next: [...A]}')
		session.exec('B = {next: [...B]}')
		const x = resolveTypeSlot(parse('A'), session.env)!
		const y = resolveTypeSlot(parse('B'), session.env)!
		expect(typeFits(x, y)).toBe(true)
	})
})

describe('subtyping', () => {
	it('fits a tuple to a vector, and a record with extra fields', () => {
		expect(typeFits(slot('[number number]'), slot('[...number]'))).toBe(true)
		expect(typeFits(slot('[...number]'), slot('[number number]'))).toBe(false)
		expect(typeFits(slot('[number string]'), slot('[...number]'))).toBe(false)
		expect(typeFits(slot('[number number number]'), slot('[number ...number]'))).toBe(true)
		expect(typeFits(slot('{x: number y: number}'), slot('{x: number}'))).toBe(true)
		expect(typeFits(slot('{x: number}'), slot('{x: number y: number}'))).toBe(false)
		expect(typeFits(slot('{x: number}'), slot('{x: number y?: number}'))).toBe(true)
	})

	it('fits an enum and a refinement to their base', () => {
		expect(typeFits(slot('(| "a" "b")'), slot('string'))).toBe(true)
		expect(typeFits(slot('(| "a" "b")'), slot('number'))).toBe(false)
		expect(typeFits(slot('string'), slot('(| "a" "b")'))).toBe(false)
		expect(typeFits(slot('(| "a")'), slot('(| "a" "b")'))).toBe(true)
		const positive = '(refine number 1 (=> (x: number): boolean (> x 0)))'
		expect(typeFits(slot(positive), slot('number'))).toBe(true)
		expect(typeFits(slot('number'), slot(positive))).toBe(false)
	})

	it('treats _ as not known, and ! as fitting anything', () => {
		expect(typeFits(slot('_'), slot('number'))).toBe(true)
		expect(typeFits(slot('number'), slot('_'))).toBe(true)
		expect(typeFits(slot('!'), slot('number'))).toBe(true)
		expect(typeFits(slot('number'), slot('!'))).toBe(false)
	})
})

describe('infer — forms', () => {
	it('types literals and collections', () => {
		expect(typeOf('1')).toBe('number')
		expect(typeOf('[1 "a"]')).toBe('[number string]')
		expect(typeOf('{x: 1}')).toBe('{x: number}')
		expect(typeOf('()')).toBe('unit')
	})

	it('types let, names, paths and access', () => {
		expect(typeOf('{a = 1 a}')).toBe('number')
		expect(typeOf('{a = [1 "s"] a.1}')).toBe('string')
		expect(typeOf('[1 ./0]')).toBe('[number number]')
		expect(typeOf('{r = {x: 1} r.x}')).toBe('number')
		expect(typeOf('{a = 1}')).toBe('unit')
		expect(typeOf('{a = b b = a a}')).toBeNull()
	})

	it('types calls on values', () => {
		expect(typeOf('([1 "a"] 1)')).toBe('string')
		expect(typeOf('({x: 1} "x")')).toBe('number')
		expect(typeOf('((: [1] [...number]) 5)')).toBe('number')
	})

	it('types ? by the clauses in common', () => {
		expect(typeOf('(? 1 number 2 _ 3)')).toBe('number')
		expect(typeOf('(? 1 number [1] _ [2 3])')).toBe(null)
		expect(typeOf('(: 1 number)')).toBe('number')
		expect(problems('(? 1 number "n" _ 2)')).toEqual([
			'? clauses have different types: string, number',
		])
	})

	it('types an overload call by the variant that fits', () => {
		expect(typeOf('(++ [1] [2])')).toBe('vector')
		expect(typeOf('(++ "a" "b")')).toBe('string')
	})

	it('runs no value expression', () => {
		let runs = 0
		const counted = makeTypedFn(
			[slot('number')],
			slot('number'),
			n => {
				runs++
				return n
			},
			['n']
		)
		const root = new LetAST(
			[['H', new HostAST(counted)], ...((parse('{a = (H 1) b = [a] c = 0}') as LetAST).bindings)],
			parse('(+ a (first b))')
		)
		const session = new Session(env)
		for (const [name, ast] of root.bindings) session.setBinding(name, ast)
		const body = root.body!
		expect(infer(body, session.env)?.typeName).toBe('number')
		expect(check(body, session.env)).toEqual([])
		expect(runs).toBe(0)
	})
})

describe('check', () => {
	it('checks a return type', () => {
		expect(problems('(=> (x: number): string x)')).toEqual([
			'return type mismatch: expected string, got number',
		])
		expect(problems('(=> (x: number): number x)')).toEqual([])
		expect(problems('(=> (x: [...number]): number (first x))')).toEqual([])
		expect(problems('(=> (...xs: number): [...number] xs)')).toEqual([])
	})

	it('takes a literal that is one of an enum, as an argument and as what is returned', () => {
		const J = '(| "a" "b")'
		expect(problems(`{f = (=> (j: ${J}): number 1) (f "a")}`)).toEqual([])
		expect(problems(`{f = (=> (j: ${J}): number 1) (f "z")}`)).toHaveLength(1)
		expect(problems(`(=> (x: number): ${J} "a")`)).toEqual([])
		expect(problems(`(=> (x: number): ${J} "z")`)).toHaveLength(1)
	})

	it('looks into what never runs', () => {
		expect(problems('{unused = (+ 1 "a") 0}')).toEqual([
			'type mismatch: expected number, got string',
		])
		expect(problems('(? true true 1 _ (+ 1 "a"))')).toEqual([
			'type mismatch: expected number, got string',
		])
	})

	it('reads a parameter in the body by its declared type', () => {
		expect(problems('(=> (s: string): number (+ s 1))')).toEqual([
			'type mismatch: expected number, got string',
		])
	})

	it('reports nothing for well-typed programs', () => {
		for (const src of [
			'(map [1 2] (+ % 1))',
			'{f = (=> (n: number): number (? (< n 1) true 1 _ (* n (f (- n 1))))) (f 3)}',
			'{e = (=> (n: number): boolean (o n)) o = (=> (n: number): boolean (e n)) (e 1)}',
			'(reduce (range 0 3) 0 +)',
			'(|> 1 (+ % 1) (* % 2))',
			'{Point = {x: number y: number} (=> (p: Point): number p.x)}',
			'{Color = (| "r" "g") (=> (c: Color): string c)}',
		]) {
			expect(problems(src), src).toEqual([])
		}
	})
})

describe('metadata on a type', () => {
	const typeIn = (src: string, name: string) => {
		const session = new Session(buildPrelude())
		session.setAst(parse(src) as LetAST)
		return printType(infer(parse(name), session.env)!)
	}
	const PERCENT = 'Percent = ^{min: 0 max: 100 suffix: "%"} number'
	const SAID = '^{min: 0 max: 100 suffix: "%"} number'

	it('comes with a value, from where it is written and through names', () => {
		expect(typeIn('{a = ^{min: 0} 5}', 'a')).toBe('^{min: 0} number')
		expect(typeIn('{a = ^{min: 0} 5 b = a}', 'b')).toBe('^{min: 0} number')
		expect(typeIn('{a = 5}', 'a')).toBe('number')
	})

	it('comes with a type, through a name and an alias', () => {
		expect(typeIn(`{${PERCENT} a = (: 20 Percent)}`, 'a')).toBe(SAID)
		expect(typeIn(`{${PERCENT} P = Percent a = (: 20 P)}`, 'a')).toBe(SAID)
	})

	it('goes over what came before, key by key', () => {
		expect(typeIn(`{${PERCENT} H = ^{max: 50} Percent a = (: 20 H)}`, 'a')).toBe(
			'^{min: 0 suffix: "%" max: 50} number'
		)
	})

	it('goes through a function, its generics, and no further than it says', () => {
		const src = `{${PERCENT} f = (=> (p: Percent): Percent p) id = (=> (T) (v: T): T v) a = (f 1) b = ^{min: 0} 5 c = (id b) d = (+ b 1)}`
		expect(typeIn(src, 'a')).toBe(SAID)
		expect(typeIn(src, 'c')).toBe('^{min: 0} number')
		expect(typeIn(src, 'd')).toBe('number')
	})

	it('reaches a parameter inside its function', () => {
		const fn = infer(
			parse(`{${PERCENT} (=> (p: Percent): number p)}`),
			buildPrelude()
		)!
		const shape = unwrapLazy(fn).shape
		expect(shape.kind === 'function' && printType(shape.paramTypes[0]!)).toBe(SAID)
	})

	it('changes nothing about what fits', () => {
		const env = buildPrelude()
		const said = resolveTypeSlot(parse('^{min: 0} number'), env)!
		const plain = resolveTypeSlot(parse('number'), env)!
		expect(typeFits(said, plain)).toBe(true)
		expect(typeFits(plain, said)).toBe(true)
		expect(said.fits(1)).toBe(true)
		expect(said.fits('a')).toBe(false)
		expect(check(parse(`{${PERCENT} f = (=> (p: Percent): number p) (f "a")}`), env)).not.toEqual([])
		expect(check(parse(`{${PERCENT} f = (=> (p: Percent): number p) (f 1)}`), env)).toEqual([])
	})

	it('leaves behind what is said about a name or a place', () => {
		expect(typeIn('{a = @5}', 'a')).toBe('number')
		expect(typeIn('{a = ^{doc: "D" label: "L" min: 0} @5}', 'a')).toBe('^{min: 0} number')
		expect(typeIn('{f = ^{doc: "D"} (=> (x: number): number x)}', 'f')).toBe(
			'(=> (x: number): number)'
		)
		expect(typeIn('{a = 1}', 'pi')).toBe('number')
		expect(typeIn('{a = (: 1 number)}', 'a')).toBe('number')
		expect(typeIn('{P = ^{doc: "D" suffix: "%"} number a = (: 1 P)}', 'a')).toBe(
			'^{suffix: "%"} number'
		)
	})

	it('takes an icon along', () => {
		expect(typeIn('{P = ^{icon: "i"} number Q = ^{min: 0} P a = (: 1 Q)}', 'a')).toBe(
			'^{icon: "i" min: 0} number'
		)
	})

	it('holds for a recursive type, and aliases in a circle', () => {
		const src = '{Tree = ^{icon: "t"} {value: number children: [...Tree]} a = (: {value: 1 children: []} Tree)}'
		expect(typeIn(src, 'a')).toContain('^{icon: "t"}')
		const env = buildPrelude()
		expect(() => resolveTypeSlot(parse('{p = q q = p (: 1 p)}'), env)).not.toThrow()
		expect(() => check(parse('{p = q q = p (: 1 p)}'), env)).not.toThrow()
	})
})
