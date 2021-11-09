import {obj, scope} from '../exp'
import * as Val from '../val'

const T = Val.tyVar()
const U = Val.tyVar()
const V = Val.tyVar()

function defn(
	value: Val.Fn['fn'],
	param: Record<string, Val.Value>,
	out: Val.Value
) {
	return obj(Val.fn(value, param, out))
}

export const GlobalScope = scope({
	true: obj(Val.bool(true)),
	false: obj(Val.bool(false)),
	Int: obj(Val.tyInt),
	Bool: obj(Val.tyBool),
	succ: defn((x: Val.Int) => Val.int(x.value + 1), {x: Val.tyInt}, Val.tyInt),
	'even?': defn(
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
	not: defn((x: Val.Bool) => Val.bool(!x.value), {x: Val.tyBool}, Val.tyBool),
	and: defn(
		(x: Val.Bool, y: Val.Bool) => Val.bool(x.value && y.value),
		{
			x: Val.tyBool.extends(Val.bool(true)),
			y: Val.tyBool.extends(Val.bool(true)),
		},
		Val.tyBool
	),
	or: defn(
		(x: Val.Bool, y: Val.Bool) => Val.bool(x.value || y.value),
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
	'->': defn(
		(param: Val.Vec, out: Val.Value) => Val.tyFn(param.items, out),
		{param: Val.vecV(T), out: U},
		// TODO: Fix this to (-> [...T] U)
		Val.all
	),
	id: obj(Val.fn((x: Val.Value) => x, {x: T}, T)),
	if: defn(
		(test: Val.Bool, then: Val.Value, _else: Val.Value) => {
			return test.value ? then : _else
		},
		{test: Val.tyBool, then: T, else: T},
		T
	),
	const: defn((x: Val.Value) => Val.fn(() => x, {}, T), {x: T}, T),
	'.': defn(
		(f: Val.Fn, g: Val.Fn) => {
			return Val.fn((x: Val.Value) => g.fn(f.fn(x)), {x: T}, V)
		},
		{f: Val.tyFn(T, U), g: Val.tyFn(U, V)},
		Val.tyFn(T, V)
	),
	twice: defn(
		(f: Val.Fn) => {
			return Val.fn((x: Val.Value) => f.fn(f.fn(x)), {x: T}, T)
		},
		{f: Val.tyFn(T, T)},
		Val.tyFn(T, T)
	),
	first: defn(
		(coll: Val.Vec) => coll.items[0] ?? Val.bottom,
		{coll: Val.vecV(T)},
		T
	),
	rest: defn(
		(coll: Val.Vec) => Val.vec(...coll.items.slice(1)),
		{coll: Val.vecV(T)},
		T
	),
})
