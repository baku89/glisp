import {keys} from 'lodash'

import {obj, scope} from '../exp'
import * as Val from '../val'

const T = Val.tyVar()
const U = Val.tyVar()
const V = Val.tyVar()

function defn(
	value: Val.Fn['value'],
	param: Record<string, Val.Value>,
	out: Val.Value
) {
	return obj(Val.fn(value, param, out))
}

export const GlobalScope = scope({
	_: obj(Val.bottom),
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
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyInt
	),
	'<': defn(
		(a: Val.Int, b: Val.Int) => Val.bool(a.value < b.value),
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyBool
	),
	not: defn((x: Val.Bool) => Val.bool(!x.value), {x: Val.tyBool}, Val.tyBool),
	'|': defn(
		(t1: Val.Value, t2: Val.Value) => Val.uniteTy(t1, t2),
		{x: Val.tyInt, y: Val.tyInt},
		Val.tyInt
	),
	identity: obj(Val.fn((x: Val.Value) => x, {x: T}, T)),
	if: defn(
		(test: Val.Bool, then: Val.Value, _else: Val.Value) => {
			return test.value ? then : _else
		},
		{test: Val.tyBool, then: T, else: T},
		T
	),
	'.': defn(
		(f: Val.Fn, g: Val.Fn) => {
			const name = keys(f.param)[0]
			return Val.fn((x: Val.Value) => g.value(f.value(x)), {[name]: T}, V)
		},
		{f: Val.tyFn(T, U), g: Val.tyFn(U, V)},
		Val.tyFn(T, V)
	),
	twice: defn(
		(f: Val.Fn) => {
			const name = keys(f.param)[0]
			return Val.fn((x: Val.Value) => f.value(f.value(x)), {[name]: T}, T)
		},
		{f: Val.tyFn(T, T)},
		Val.tyFn(T, T)
	),
})
