import * as Exp from '../exp'
import {parseModule} from '../parser'
import {parse} from '../parser'
import {Writer} from '../utils/Writer'

function defn(ty: string, fn: (...args: any[]) => Exp.Value) {
	try {
		const fnTy = parse(ty, PreludeScope).eval2().result

		if (fnTy.type !== 'tyFn') throw new Error('Not a tyFn:' + ty)

		return Exp.fn(fnTy.param, fnTy.out, (...args) => Exp.withLog(fn(...args)))
	} catch {
		throw new Error('defn failed' + ty)
	}
}

const T = Exp.tyVar('T')

export const PreludeScope = Exp.scope({
	true: Exp.True,
	false: Exp.False,
	Num: Exp.tyNum,
	Str: Exp.tyStr,
	Bool: Exp.tyBool,
	'|': Exp.fn({x: T, y: T}, T, (t1: Exp.Value, t2: Exp.Value) =>
		Exp.withLog(Exp.tyUnion(t1, t2))
	),
})

// 	map: Exp.obj(
// 		Val.fn(
// 			(f: Val.Fn, coll: Val.Vec) => {
// 				const [newItems, log] = Writer.map(coll.items, f.fn).asTuple
// 				return Writer.of(Val.vecFrom(newItems), ...log)
// 			},
// 			{f: Val.tyFn(T, U), coll: Val.vecFrom([], T)},
// 			Val.vecFrom([], U)
// 		)
// 	),
// 	isSubtype: defn(
// 		(s: Val.Value, t: Val.Value) => Val.bool(s.isSubtypeOf(t)),
// 		{s: Val.all, t: Val.all},
// 		Val.tyBool
// 	),
// 	fnType: defn(
// 		(f: Val.Value) => ('tyFn' in f ? f.tyFn : f),
// 		{f: Val.all},
// 		Val.all
// 	),
// 	struct: defn(
// 		(name: Val.Str, {items}: Val.Dict) => {
// 			return Val.tyProd(
// 				name.value,
// 				items,
// 				values(items).map(it => it.defaultValue)
// 			)
// 		},
// 		{name: Val.tyStr, param: Val.tyDict({}, Val.all)},
// 		Val.all
// 	),

PreludeScope.defs({
	'+': defn('(-> [x:Num y:Num] Num)', (a: Exp.Num, b: Exp.Num) =>
		Exp.num(a.value + b.value)
	),
	'*': defn('(-> [x:Num y:Num] Num)', (a: Exp.Num, b: Exp.Num) =>
		Exp.num(a.value * b.value)
	),
	'/': defn('(-> [x:Num y:Num] Num)', (a: Exp.Num, b: Exp.Num) =>
		Exp.num(a.value / b.value)
	),
	'**': defn('(-> [x:Num a:Num] Num)', (x: Exp.Num, a: Exp.Num) =>
		Exp.num(Math.pow(x.value, a.value))
	),
	mod: defn('(-> [x:Num y:Num] Num)', (x: Exp.Num, y: Exp.Num) =>
		Exp.num(x.value % y.value)
	),
	'<': defn('(-> [x:Num y:Num] Bool)', (x: Exp.Num, y: Exp.Num) =>
		Exp.bool(x.value < y.value)
	),
	'==': defn('(-> [x:_ y:_] Bool)', (x: Exp.Num, y: Exp.Num) =>
		Exp.bool(x.isEqualTo(y))
	),
	if: defn(
		'(-> <T> [test:Bool then:T else:T] T)',
		(test: Exp.Enum, then: Exp.Value, _else: Exp.Value) =>
			test === Exp.True ? then : _else
	),
	nand: defn('(-> [x:Bool y:Bool] Bool)', (x: Exp.Enum, y: Exp.Enum) =>
		Exp.bool(!(x === Exp.True && y === Exp.True))
	),
	len: defn('(-> x:(| Str [..._]) Num)', (x: Exp.Str | Exp.Vec) => {
		if (x.type === 'vec') return Exp.num(x.items.length)
		else return Exp.num(x.value.length)
	}),
	gcd: defn(
		'(-> [x:Num y:Num] Num)',
		(() => {
			const gcd = (x: Exp.Num, y: Exp.Num): Exp.Num =>
				x.value % y.value ? gcd(y, Exp.num(x.value % y.value)) : y
			return gcd
		})()
	),
	rest: defn('(-> <T> coll:[...T] [...T])', (coll: Exp.Vec) =>
		Exp.vec(...coll.items.slice(1))
	),
	map: defn(
		'(-> <T U> [f: (-> T U) coll:[...T]] [...U])',
		(f: Exp.Fn, coll: Exp.Vec) => {
			const [items] = Writer.map(coll.items, f.fn).asTuple
			return Exp.vec(...items)
		}
	),
	reduce: defn(
		'(-> <T U> [f: (-> [U T] U) coll: [...T] initial: U] U)',
		(f: Exp.Fn, coll: Exp.Vec, initial: Exp.Value) => {
			return coll.items.reduce(
				(prev: Exp.Value, curt: Exp.Value) => f.fn(prev, curt).result,
				initial
			)
		}
	),
})

PreludeScope.defs(
	parseModule(`
not = (=> x:Bool (nand x x))
or  = (=> [x:Bool y:Bool] (nand (not x) (not y)))

compose = (=> <T U V>
              [f:(-> T U)
               g:(-> U V)]
              (=> x:T (g (f x))))

twice = (=> <T> f:(-> T T) (compose f f))

inc = (=> x:Num (+ x 1))

dec = (=> x:Num (- x 1))

isEven = (=> x:Num (== (mod x 2) 0))

const = (=> <T> x:T (=> [] x))

first = (=> <T> coll:[...T] (coll 0))

id = (=> x:<T> x)

sum = (=> xs:[...Num] (reduce + xs 0))

neg = (=> x:Num (* x -1))

- = (=> [x:Num y:Num] (+ x (neg y)))

sqrt   = (=> x:Num (** x 0.5))
square = (=> x:Num (** x 2))
hypot  = (=> [x:Num y:Num] (sqrt (+ (* x x) (* y y))))
PI = 3.1415926535897932384626433832795028841971693993

`)
)
