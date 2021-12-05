import {values} from 'lodash'

import * as Exp from '../exp'
import {parseModule} from '../parser'
import {Writer} from '../utils/Writer'
import * as Val from '../val'

const T = Val.tyVar('T')
const U = Val.tyVar('U')

function defn(
	value: (...args: any[]) => Val.Value,
	param: Record<string, Val.Value>,
	out: Val.Value
) {
	return Exp.obj(
		Val.fn((...args: any[]) => Writer.of(value(...args)), param, out)
	)
}

export const PreludeScope = Exp.scope({
	true: Exp.obj(Val.bool(true)),
	true2: Exp.True,
	false: Exp.obj(Val.bool(false)),
	false2: Exp.False,
	Num: Exp.obj(Val.tyNum),
	Num2: Exp.tyNum,
	Str: Exp.obj(Val.tyStr),
	Str2: Exp.tyStr,
	Bool: Exp.obj(Val.tyBool),
	Bool2: Exp.tyBool,
	'+': defn(
		(a: Val.Num, b: Val.Num) => Val.num(a.value + b.value),
		{x: Val.tyNum, y: Val.tyNum},
		Val.tyNum
	),
	'*': defn(
		(a: Val.Num, b: Val.Num) => Val.num(a.value * b.value),
		{x: Val.tyNum.extends(Val.num(1)), y: Val.tyNum.extends(Val.num(1))},
		Val.tyNum
	),
	'/': defn(
		(a: Val.Num, b: Val.Num) => Val.num(a.value / b.value),
		{x: Val.tyNum.extends(Val.num(1)), y: Val.tyNum.extends(Val.num(1))},
		Val.tyNum
	),
	'**': defn(
		(x: Val.Num, a: Val.Num) => Val.num(Math.pow(x.value, a.value)),
		{x: Val.tyNum, a: Val.tyNum},
		Val.tyNum
	),
	'%': defn(
		(x: Val.Num, y: Val.Num) => Val.num(x.value % y.value),
		{x: Val.tyNum, y: Val.tyNum.extends(Val.num(1))},
		Val.tyNum
	),
	'<': defn(
		(a: Val.Num, b: Val.Num) => Val.bool(a.value < b.value),
		{x: Val.tyNum, y: Val.tyNum},
		Val.tyBool
	),
	gcd: defn(
		(() => {
			const gcd = (x: Val.Num, y: Val.Num): Val.Num =>
				x.value % y.value ? gcd(y, Val.num(x.value % y.value)) : y
			return gcd
		})(),
		{x: Val.tyNum, y: Val.tyNum},
		Val.tyNum
	),
	'==': defn(
		(a: Val.Value, b: Val.Value) => Val.bool(Val.isEqual(a, b)),
		{x: Val.all, y: Val.all},
		Val.tyBool
	),
	not: defn(
		(x: Val.Value) => Val.bool(x !== Val.bool(true)),
		{x: Val.tyBool},
		Val.tyBool
	),
	and: defn(
		(x: Val.Value, y: Val.Value) => Val.bool(x === Val.True && y === Val.True),
		{
			x: Val.tyBool.extends(Val.bool(true)),
			y: Val.tyBool.extends(Val.bool(true)),
		},
		Val.tyBool
	),
	or: defn(
		(x: Val.Value, y: Val.Value) => Val.bool(x === Val.True || y === Val.True),
		{
			x: Val.tyBool,
			y: Val.tyBool,
		},
		Val.tyBool
	),
	'|': defn(
		(t1: Val.Value, t2: Val.Value) => Val.uniteTy(t1, t2),
		{x: T, y: T},
		T
	),
	if: defn(
		(test: Val.Value, then: Val.Value, _else: Val.Value) => {
			return test === Val.True ? then : _else
		},
		{test: Val.tyBool, then: T, else: T},
		T
	),
	rest: defn(
		(coll: Val.Vec) => Val.vecFrom(coll.items.slice(1)),
		{coll: Val.vecFrom([], T)},
		Val.vecFrom([], T)
	),
	map: Exp.obj(
		Val.fn(
			(f: Val.Fn, coll: Val.Vec) => {
				const [newItems, log] = Writer.map(coll.items, f.fn).asTuple
				return Writer.of(Val.vecFrom(newItems), ...log)
			},
			{f: Val.tyFn(T, U), coll: Val.vecFrom([], T)},
			Val.vecFrom([], U)
		)
	),
	reduce: Exp.obj(
		Val.fn(
			(f: Val.Fn, coll: Val.Vec, initial: Val.Value) => {
				const logs: Exp.Log[] = []
				const ret = coll.items.reduce((p: Val.Value, c: Val.Value) => {
					const [r, l] = f.fn(p, c).asTuple
					logs.push(...l)
					return r
				}, initial)
				return Writer.of(ret, ...logs)
			},
			{f: Val.tyFn([U, T], U), coll: Val.vecFrom([], T), initial: U},
			U
		)
	),
	isSubtype: defn(
		(s: Val.Value, t: Val.Value) => Val.bool(s.isSubtypeOf(t)),
		{s: Val.all, t: Val.all},
		Val.tyBool
	),
	fnType: defn(
		(f: Val.Value) => ('tyFn' in f ? f.tyFn : f),
		{f: Val.all},
		Val.all
	),
	struct: defn(
		(name: Val.Str, {items}: Val.Dict) => {
			return Val.tyProd(
				name.value,
				items,
				values(items).map(it => it.defaultValue)
			)
		},
		{name: Val.tyStr, param: Val.tyDict({}, Val.all)},
		Val.all
	),
	len: defn(
		(x: Val.Str | Val.Vec) => {
			if (x.type === 'str') return Val.num(x.value.length)
			else return Val.num(x.items.length)
		},
		{x: Val.uniteTy(Val.tyStr, Val.vecFrom([], Val.all))},
		Val.tyNum
	),
})

PreludeScope.defs(
	parseModule(`

compose = (=> (f:(-> <T> <U>) g:(-> <U> <V>)) (=> x:<T> (g (f x))))
twice = (=> f:(-> <T> <T>) (compose f f))

bindMaybe =
(=> (f:(-> <T> (| () <U>))
     g:(-> <U> (| () <V>)))
    (=> x:<T>
        {fx = (f x)
         (if (== fx ()) () (g fx))}))


inc = (=> x:Num (+ x 1))

dec = (=> x:Num (+ x -1))

isEven = (=> x:Num (== (% x 2) 0))

const = (=> x:<T> (=> () x))

first = (=> coll:[...<T>] (coll 0))

id = (=> x:<T> x)

sum = (=> xs:[...Num] (reduce + xs 0))

neg = (=> x:Num (* x -1))

- = (=> (x:Num y:Num) (+ x (neg y)))

sqrt = (=> x:Num (** x 0.5))
square = (=> x:Num (** x 2))
hypot = (=> (x:Num y:Num) (sqrt (+ (* x x) (* y y))))
PI = 3.1415926535897932384626433832795028841971693993

`)
)
