import {keys} from 'lodash'

import {obj, scope} from '../exp'
import * as Val from '../val'

const T = Val.tyVar()
const U = Val.tyVar()
const V = Val.tyVar()

export const GlobalScope = scope({
	_: obj(Val.bottom),
	Int: obj(Val.tyInt),
	Bool: obj(Val.tyBool),
	succ: obj(
		Val.fn((x: Val.Int) => Val.int(x.value + 1), {x: Val.tyInt}, Val.tyInt)
	),
	'even?': obj(
		Val.fn(
			(x: Val.Int) => Val.bool(x.value % 2 === 0),
			{x: Val.tyInt},
			Val.tyBool
		)
	),
	'+': obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value + b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'*': obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.int(a.value * b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	'<': obj(
		Val.fn(
			(a: Val.Int, b: Val.Int) => Val.bool(a.value < b.value),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyBool
		)
	),
	not: obj(
		Val.fn((x: Val.Bool) => Val.bool(!x.value), {x: Val.tyBool}, Val.tyBool)
	),
	'|': obj(
		Val.fn(
			(t1: Val.Value, t2: Val.Value) => Val.uniteTy(t1, t2),
			{x: Val.tyInt, y: Val.tyInt},
			Val.tyInt
		)
	),
	identity: obj(Val.fn((x: Val.Value) => x, {x: T}, T)),
	if: obj(
		Val.fn(
			(test: Val.Bool, then: Val.Value, _else: Val.Value) => {
				return test.value ? then : _else
			},
			{test: Val.tyBool, then: T, else: T},
			T
		)
	),
	'.': obj(
		Val.fn(
			(f: Val.Fn, g: Val.Fn) => {
				const name = keys(f.param)[0]
				return Val.fn((x: Val.Value) => g.value(f.value(x)), {[name]: T}, V)
			},
			{f: Val.tyFn([T], U), g: Val.tyFn([U], V)},
			Val.tyFn([T], V)
		)
	),
})
