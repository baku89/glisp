import {range} from 'lodash'

import * as Ast from '../ast'
import {Log, withLog} from '../log'
import {parseModule} from '../parser'
import {parse} from '../parser'
import {Writer} from '../util/Writer'
import * as Val from '../val'

interface Defn {
	(
		type: string,
		f: (...args: Ast.Arg<any>[]) => Val.Value,
		options?: {lazy?: true; writeLog?: false}
	): Ast.ValueContainer
	(
		type: string,
		f: (...args: any[]) => Val.Value,
		options?: {lazy?: false; writeLog?: false}
	): Ast.ValueContainer
	(
		type: string,
		f: Val.IFn,
		options?: {lazy?: true; writeLog?: true}
	): Ast.ValueContainer
	(
		type: string,
		f: (...args: any[]) => ReturnType<Val.IFn>,
		options?: {lazy?: false; writeLog?: true}
	): Ast.ValueContainer
}

const defn: Defn = (type, f, {lazy = false, writeLog = false} = {}) => {
	const fnType = parse(type, PreludeScope).eval().result

	if (fnType.type !== 'FnType') throw new Error('Not a fnType:' + type)

	let _f: Val.IFn

	if (writeLog) {
		_f = lazy
			? (f as Val.IFn)
			: (...args) => f(...args.map(a => a())) as ReturnType<Val.IFn>
	} else {
		_f = lazy
			? (...args) => withLog(f(...args) as Val.Value)
			: (...args) => withLog(f(...args.map(a => a())) as Val.Value)
	}

	const fn = Val.fnFrom(fnType, _f)

	return Ast.value(fn)
}

export const PreludeScope = Ast.scope({
	Num: Ast.value(Val.NumType),
	Str: Ast.value(Val.StrType),
	Bool: Ast.value(Val.BoolType),
	'|': defn('(-> [...types:_] _)', (...types: Val.Value[]) =>
		Val.unionType(...types)
	),
})

PreludeScope.defs({
	true: Ast.value(Val.True),
	false: Ast.value(Val.False),
	throw: defn('(-> reason:_ Never)', (reason: Val.Str) => {
		throw new Error(reason.value)
	}),
	log: defn(
		'(-> <T> [value:T level:(| "error" "warn" "info") reason:Str] T)',
		(value: Val.Value, level: Val.Str, reason: Val.Str) =>
			Writer.of(value, {
				level: level.value as Log['level'],
				reason: reason.value,
			}),
		{writeLog: true}
	),
	'+': defn('(-> [...xs:Num] Num)', (...xs: Val.Num[]) =>
		Val.num(xs.reduce((sum, x) => sum + x.value, 0))
	),
	'-': defn('(-> [...xs:Num^1] Num)', (...xs: Val.Num[]) => {
		switch (xs.length) {
			case 0:
				return Val.num(0)
			case 1:
				return Val.num(-xs[0].value)
			default:
				return Val.num(
					xs.slice(1).reduce((prev, x) => prev - x.value, xs[0].value)
				)
		}
	}),
	'*': defn('(-> [...xs:Num^1] Num)', (...xs: Val.Num[]) =>
		Val.num(xs.reduce((prod, x) => prod * x.value, 1))
	),
	'/': defn('(-> [...xs:Num^1] Num)', (...xs: Val.Num[]) => {
		switch (xs.length) {
			case 0:
				return Val.num(1)
			case 1:
				return Val.num(1 / xs[0].value)
			default:
				return Val.num(
					xs.slice(1).reduce((prev, x) => prev / x.value, xs[0].value)
				)
		}
	}),
	'**': defn('(-> [x:Num a:Num^1] Num)', (x: Val.Num, a: Val.Num) =>
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
	and: defn(
		'(-> [...xs:Bool^true] Bool)',
		(...xs: Ast.Arg<Val.Enum>[]) => {
			for (const x of xs) {
				if (x().isEqualTo(Val.False)) return Val.bool(false)
			}
			return Val.bool(true)
		},
		{lazy: true}
	),
	or: defn(
		'(-> [...xs:Bool^false] Bool)',
		(...xs: Ast.Arg<Val.Enum>[]) => {
			for (const x of xs) {
				if (x().isEqualTo(Val.True)) return Val.bool(true)
			}
			return Val.bool(false)
		},
		{lazy: true}
	),
	not: defn('(-> x:Bool Bool)', (x: Val.Enum) =>
		Val.bool(x.isEqualTo(Val.False))
	),
	len: defn('(-> x:(| Str [..._]) Num)', (x: Val.Str | Val.Vec) => {
		if (x.type === 'Vec') return Val.num(x.items.length)
		else return Val.num(x.value.length)
	}),
	range: defn(
		'(-> [start:Num end:Num step?:Num^1] [...Num])',
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
	enum: defn(
		'(-> [name:Str ...label:Str] _)',
		(name: Val.Str, ...labels: Val.Str[]) =>
			Val.enumType(
				name.value,
				labels.map(l => l.value)
			)
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
<=: (=> [x:Num y:Num] (or (== x y) (< x y)))
>: (=> [x:Num y:Num] (< y x))
>=: (=> [x:Num y:Num] (<= y x))

inc: (=> x:Num (+ x 1))

dec: (=> x:Num (- x 1))

isEven: (=> x:Num (== (mod x 2) 0))

compose: (=> <T U V> [f:(-> T U) g:(-> U V)] 
             (=> x:T (g (f x))))

twice: (=> <T> f:(-> T T) (compose f f))

const: (=> <T> x:T (=> [] x))

first: (=> <T> coll:[...T] (coll 0))

id: (=> <T> x:T x)

sqrt: (=> x:Num (if (<= 0 x)
                    (** x 0.5)
                    (log 0 "warn" "Negative number")))

square: (=> x:Num (** x 2))
hypot:  (=> [x:Num y:Num] (sqrt (+ (* x x) (* y y))))
PI: 3.1415926535897932384626433832795028841971693993

`)
)
