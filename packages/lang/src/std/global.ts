import * as Exp from '../Exp'
import {obj, scope} from '../exp'
import {Writer} from '../utils/Writer'
import * as Val from '../val'

const T = Val.tyVar('T')
const U = Val.tyVar('U')
const V = Val.tyVar('V')

function defn(
	value: (...args: any[]) => Val.Value,
	param: Record<string, Val.Value>,
	out: Val.Value
) {
	return obj(Val.fn((...args: any[]) => Writer.of(value(...args)), param, out))
}

export const GlobalScope = scope({
	true: obj(Val.bool(true)),
	false: obj(Val.bool(false)),
	Int: obj(Val.tyInt),
	Str: obj(Val.tyStr),
	Bool: obj(Val.tyBool),
	inc: defn((x: Val.Int) => Val.int(x.value + 1), {x: Val.tyInt}, Val.tyInt),
	dec: defn(
		(x: Val.Int) => Val.int(Math.max(x.value - 1, 0)),
		{x: Val.tyInt},
		Val.tyInt
	),
	isEven: defn(
		(x: Val.Int) => Val.bool(x.value % 2 === 0),
		{x: Val.tyInt},
		Val.tyBool
	),
	'+': defn(
		(a: Val.Int, b: Val.Int) => Val.int(a.value + b.value),
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyInt
	),
	'*': defn(
		(a: Val.Int, b: Val.Int) => Val.int(a.value * b.value),
		{x: Val.tyInt.extends(Val.int(1)), y: Val.tyInt.extends(Val.int(1))},
		Val.tyInt
	),
	'<': defn(
		(a: Val.Int, b: Val.Int) => Val.bool(a.value < b.value),
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyBool
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
	id: defn((x: Val.Value) => x, {x: T}, T),
	if: defn(
		(test: Val.Value, then: Val.Value, _else: Val.Value) => {
			return test === Val.True ? then : _else
		},
		{test: Val.tyBool, then: T, else: T},
		T
	),
	const: defn((x: Val.Value) => Val.fn(() => Writer.of(x), {}, T), {x: T}, T),
	'.': defn(
		(f: Val.Fn, g: Val.Fn) =>
			Val.fn(
				(x: Val.Value) => {
					const [fx, fLog] = f.fn(x).asTuple
					const [gx, gLog] = g.fn(fx).asTuple
					return Writer.of(gx, ...fLog, ...gLog)
				},
				{x: T},
				V
			),
		{f: Val.tyFn(T, U), g: Val.tyFn(U, V)},
		Val.tyFn(T, V)
	),
	twice: defn(
		(f: Val.Fn) =>
			Val.fn(
				(x: Val.Value) => {
					const [fx, fLog] = f.fn(x).asTuple
					const [ffx, ffLog] = f.fn(fx).asTuple
					return Writer.of(ffx, ...fLog, ...ffLog)
				},
				{x: T},
				T
			),
		{f: Val.tyFn(T, T)},
		Val.tyFn(T, T)
	),
	first: defn(
		(coll: Val.Vec) => coll.items[0] ?? Val.bottom,
		{coll: Val.vecFrom([], T)},
		T
	),
	rest: defn(
		(coll: Val.Vec) => Val.vecFrom(coll.items.slice(1)),
		{coll: Val.vecFrom([], T)},
		Val.vecFrom([], T)
	),
	map: obj(
		Val.fn(
			(f: Val.Fn, coll: Val.Vec) => {
				const [newItems, log] = Writer.map(coll.items, f.fn).asTuple
				return Writer.of(Val.vecFrom(newItems), ...log)
			},
			{f: Val.tyFn(T, U), coll: Val.vecFrom([], T)},
			Val.vecFrom([], U)
		)
	),
	reduce: obj(
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
	bindMaybe: defn(
		(f: Val.Fn, g: Val.Fn) =>
			Val.fn(
				(x: Val.Value) => {
					const [fx, fLog] = f.fn(x).asTuple
					if (fx.type === 'unit') return Writer.of(fx, ...fLog)
					const [gx, gLog] = g.fn(fx).asTuple
					return Writer.of(gx, ...fLog, ...gLog)
				},
				{x: T},
				Val.uniteTy(Val.unit, V)
			),
		{
			f: Val.tyFn(T, Val.uniteTy(Val.unit, U)),
			g: Val.tyFn(U, Val.uniteTy(Val.unit, V)),
		},
		Val.tyFn(T, Val.uniteTy(Val.unit, V))
	),
})
