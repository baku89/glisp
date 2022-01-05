import {range} from 'lodash'

import * as Ast from '../ast'
import {withLog} from '../log'
import {parseModule} from '../parser'
import {parse} from '../parser'
import {Writer} from '../util/Writer'
import * as Val from '../val'

function defn(
	type: string,
	f: (...args: Ast.Arg<any>[]) => Val.Value,
	options?: {lazy?: true}
): Ast.ValueContainer
function defn(
	type: string,
	f: (...args: any[]) => Val.Value,
	options?: {lazy?: false}
): Ast.ValueContainer
function defn(
	type: string,
	f: (...args: any[]) => Val.Value,
	{lazy = false} = {}
) {
	const fnType = parse(type, PreludeScope).eval().result

	if (fnType.type !== 'FnType') throw new Error('Not a fnType:' + type)

	const _f: Val.IFn = lazy
		? (...args) => withLog(f(...args))
		: (...args) => withLog(f(...args.map(a => a())))

	const fn = Val.fnFrom(fnType, _f)

	return Ast.value(fn)
}

export const PreludeScope = Ast.scope({
	Num: Ast.value(Val.NumType),
	Str: Ast.value(Val.StrType),
	Bool: Ast.value(Val.BoolType),
})

PreludeScope.defs({
	true: Ast.value(Val.True),
	false: Ast.value(Val.False),
	throw: defn('(-> reason:_ Never)', (reason: Val.Str) => {
		throw new Error(reason.value)
	}),
	'|': defn('(-> [...types:_] _)', (...types: Val.Value[]) =>
		Val.unionType(...types)
	),
	'+': defn('(-> [...xs:Num] Num)', (...xs: Val.Num[]) =>
		Val.num(xs.reduce((sum, x) => sum + x.value, 0))
	),
	'*': defn('(-> [...xs:Num] Num)', (...xs: Val.Num[]) =>
		Val.num(xs.reduce((prod, x) => prod * x.value, 1))
	),
	'/': defn('(-> [x:Num y:Num] Num)', (a: Val.Num, b: Val.Num) => {
		if (b.value === 0) throw new Error('Divided by zero')
		return Val.num(a.value / b.value)
	}),
	'**': defn('(-> [x:Num a:Num] Num)', (x: Val.Num, a: Val.Num) =>
		Val.num(Math.pow(x.value, a.value))
	),
	mod: defn('(-> [x:Num y:Num] Num)', (x: Val.Num, y: Val.Num) =>
		Val.num(x.value % y.value)
	),
	'<': defn('(-> [x:Num y:Num] Bool)', (x: Val.Num, y: Val.Num) =>
		Val.bool(x.value < y.value)
	),
	'==': defn('(-> [...xs:_] Bool)', (x: Val.Value, y: Val.Value) =>
		Val.bool(Val.isEqual(x, y))
	),
	if: defn(
		'(-> <T> [test:Bool then:T else:T] T)',
		(test: Ast.Arg, then: Ast.Arg, _else: Ast.Arg) =>
			Val.isEqual(test(), Val.True) ? then() : _else(),
		{lazy: true}
	),
	nand: defn('(-> [x:Bool y:Bool] Bool)', (x: Val.Enum, y: Val.Enum) =>
		Val.bool(!(x === Val.True && y === Val.True))
	),
	len: defn('(-> x:(| Str [..._]) Num)', (x: Val.Str | Val.Vec) => {
		if (x.type === 'Vec') return Val.num(x.items.length)
		else return Val.num(x.value.length)
	}),
	range: defn(
		'(-> [start:Num end:Num step?:Num] [...Num])',
		(start: Val.Num, end: Val.Num, step: Val.Num) =>
			Val.vec(range(start.value, end.value, step.value).map(Val.num))
	),
	gcd: defn(
		'(-> [x:Num y:Num] Num)',
		(() => {
			const gcd = (x: Val.Num, y: Val.Num): Val.Num =>
				x.value % y.value ? gcd(y, Val.num(x.value % y.value)) : y
			return gcd
		})()
	),
	rest: defn('(-> <T> coll:[...T] [...T])', (coll: Val.Vec) =>
		Val.vec(coll.items.slice(1))
	),
	map: defn(
		'(-> <T U> [f: (-> T U) coll:[...T]] [...U])',
		(f: Val.Fn, coll: Val.Vec) => {
			const [items] = Writer.map(coll.items, i => f.fn(() => i)).asTuple
			return Val.vec(items)
		}
	),
	reduce: defn(
		'(-> <T U> [f: (-> [U T] U) coll: [...T] initial: U] U)',
		(f: Val.Fn, coll: Val.Vec, initial: Val.Value) => {
			return coll.items.reduce(
				(prev: Val.Value, curt: Val.Value) =>
					f.fn(
						() => prev,
						() => curt
					).result,
				initial
			)
		}
	),
	struct: defn(
		'(-> [name:Str param:{..._}] _)',
		(name: Val.Str, {items}: Val.Dict) => Val.structType(name.value, items)
	),
	fnType: defn('(-> f:_ _)', (f: Val.Value) => ('fnType' in f ? f.fnType : f)),
	isSubtype: defn('(-> [x:_ y:_] Bool)', (s: Val.Value, t: Val.Value) =>
		Val.bool(s.isSubtypeOf(t))
	),
	show: defn('(-> _ Str)', (v: Val.Value) => Val.str(v.print())),
	'++': defn('(-> [a:Str b:Str] Str)', (a: Val.Str, b: Val.Str) =>
		Val.str(a.value + b.value)
	),
})

PreludeScope.defs(
	parseModule(`
not = (=> x:Bool (nand x x))
or  = (=> [x:Bool y:Bool] (nand (not x) (not y)))

<= = (=> [x:Num y:Num] (or (== x y) (< x y)))
>  = (=> [x:Num y:Num] (< y x))
>= = (=> [x:Num y:Num] (<= y x))

inc = (=> x:Num (+ x 1))

dec = (=> x:Num (- x 1))

isEven = (=> x:Num (== (mod x 2) 0))

compose = (=> <T U V>
	[f:(-> T U)
	 g:(-> U V)] 
	(=> x:T (g (f x))))

twice = (=> <T> f:(-> T T) (compose f f))

const = (=> <T> x:T (=> [] x))

first = (=> <T> coll:[...T] (coll 0))

id = (=> <T> x:T x)

neg = (=> x:Num (* x -1))

- = (=> [x:Num y:Num] (+ x (neg y)))

sqrt = (=> x:Num (if (<= 0 x)
                     (** x 0.5)
                     (throw "Negative number")))

square = (=> x:Num (** x 2))
hypot  = (=> [x:Num y:Num] (sqrt (+ (* x x) (* y y))))
PI = 3.1415926535897932384626433832795028841971693993

`)
)
