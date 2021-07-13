import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'
import runTest from './test'

const parser = peg.generate(ParserDefinition)

import {
	composeWithLog,
	Log,
	mapValueWithLog,
	mapWithLog,
	WithLog,
	withLog,
} from '@/lib/WithLog'

type Value =
	| ValueAny
	| ValueUnit
	| Value[]
	| ValueSpread
	| ValueSingleton
	| ValueDataType
	| ValueFnType
	| ValueUnion
	| ValueMaybe
	| ValueSpread
	| ValueDict
	| ValueFn
	| ValueData
	| ValueTypeVar
	| ValueClass
	| ValuePolyFn
	| ValueCast

interface ISpreadItem<T> {
	inf?: boolean
	value: T
}

interface ValueAny {
	kind: 'any'
}

interface ValueUnit {
	kind: 'unit'
}

type ValueSingleton = ValueLiteralSingleton | ValueCustomSingleton

type ValueLiteralSingleton = null | boolean | string | number
interface ValueCustomSingleton {
	kind: 'singleton'
	origExp?: Exp
}

interface ValueSpread<T extends Value = Value> {
	kind: 'spread'
	items: ISpreadItem<T>[]
}

interface ValueDataType {
	kind: 'dataType'
	id: string
	predicate: (value: Value) => boolean
	cast: (value: Value) => Value
	supers: Set<ValueClass>
	methods: Record<string, ValueFn['body']>
	origExp?: ExpValue<ValueDataType>
}

interface ValueUnion {
	kind: 'union'
	items: Exclude<Exclude<Exclude<Value, ValueUnion>, ValueUnit>, ValueMaybe>[]
	cast?: (value: Value) => Value
	origExp?: ExpValue<ValueUnion>
}

interface ValueMaybe {
	kind: 'maybe'
	value: Exclude<Exclude<Value, ValueUnit>, ValueMaybe>
}

interface ValueFnType {
	kind: 'fnType'
	params: ValueSpread
	out: Value
}

interface ValueFnContext {
	log: (log: Log) => void
	eval: <R extends Value = Value>(exp: Exp) => R
}

interface ValueFn {
	kind: 'fn'
	params: Record<string, ISpreadItem<Value>>
	out: Value
	body: (this: ValueFnContext, ...arg0: Exp[]) => Value
	expBody?: Exp
}

interface ValueDict {
	kind: 'dict'
	value: {
		[key: string]: Value
	}
	rest?: Value
}

interface ValueData {
	kind: 'data'
	type: ValueDataType
	value: any
}

interface ValueTypeVar {
	kind: 'typeVar'
	id: symbol
	supers: ValueClass[]
	origExp?: ExpValue<ValueTypeVar>
}

interface ValueClass {
	kind: 'class'
	methods: Record<string, ValuePolyFn>
	origExp?: ExpValue<ValueClass>
}

interface ValuePolyFn {
	kind: 'polyFn'
	params: ValueFn['params']
	out: Value
	ofClass: ValueClass
}

interface ValueCast {
	kind: 'cast'
	value: Value
	type: ValueDataType
}

type Exp =
	| ExpValue
	| ExpSymbol
	| ExpFn
	| ExpMaybe
	| ExpList
	| ExpSpread
	| ExpDict
	| ExpCast
	| ExpScope
	| ExpFncall
	| ExpParam

interface ExpBase {
	parent?: Exp
}

interface ExpValue<T extends Value = Value> extends ExpBase {
	ast: 'value'
	value: T
}

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	name: string
}

interface ExpFn extends ExpBase {
	ast: 'fn'
	params: Record<string, ISpreadItem<Exp>>
	body: Exp
}

interface ExpMaybe extends ExpBase {
	ast: 'maybe'
	value: Exp
}

interface ExpList extends ExpBase {
	ast: 'list'
	fn: Exp
	params: Exp[]
}

interface ExpSpread extends ExpBase {
	ast: 'spread'
	items: ISpreadItem<Exp>[]
}

interface ExpDict extends ExpBase {
	ast: 'dict'
	items: Record<string, Exp>
	rest?: Exp
}

interface ExpCast extends ExpBase {
	ast: 'cast'
	value: Exp
	type: Exp
}

interface ExpScope extends ExpBase {
	ast: 'scope'
	scope: Record<string, Exp>
	out?: Exp
}

// Program dependency graph inside Function body
interface ExpFncall extends ExpBase {
	ast: 'fncall'
	fn: ValueFn['body']
	params: Exp[]
	type: Value
	origFn: Exp
	origParams: Exp[]
}

interface ExpParam extends ExpBase {
	ast: 'param'
	name: string
	type: Value
}

export function readStr(str: string): WithLog<Exp> {
	try {
		const exp = parser.parse(str) as Exp | undefined

		if (exp === undefined) {
			return withLog(wrapValue(Unit))
		} else {
			// Set global scope as parent
			exp.parent = GlobalScope
			return withLog(exp)
		}
	} catch (error) {
		const parseLog: Log = {level: 'error', reason: error.message, error}
		return withLog(wrapValue(Unit), [parseLog])
	}
}

function wrapValue<T extends Value = Value>(
	value: T,
	setOriginal = true
): ExpValue<T> {
	const ret: ExpValue<T> = {ast: 'value', value}
	if (
		setOriginal &&
		(isKindOf('singleton', value) ||
			isKindOf('dataType', value) ||
			isKindOf('union', value) ||
			isKindOf('typeVar', value) ||
			isKindOf('class', value))
	) {
		if (value.origExp)
			throw new Error(`Cannot overwrite origExp of ${printValue(value)}`)
		value.origExp = ret
	}
	return ret
}

function createExpCast(value: Exp, type: Exp, setParent = true) {
	const ret: ExpCast = {
		ast: 'cast',
		value,
		type,
	}

	if (setParent) {
		value.parent = ret
		type.parent = ret
	}

	return ret
}

function createExpScope(
	{
		scope,
		out,
	}: {
		scope: ExpScope['scope']
		out?: ExpScope['out']
	},
	setParent = true
) {
	const ret: ExpScope = {ast: 'scope', scope, out}

	if (setParent) {
		_.values(scope).forEach(e => (e.parent = ret))
	}

	return ret
}

// Value initializer
const Any: ValueAny = {kind: 'any'}
const Unit: ValueUnit = {kind: 'unit'}

function createFnType(
	params: ValueFnType['params'],
	out: ValueFnType['out']
): ValueFnType {
	return {kind: 'fnType', params, out}
}

function createMaybe(value: Value): Value {
	if (isKindOf('unit', value) || isKindOf('maybe', value)) {
		return value
	} else {
		return {kind: 'maybe', value}
	}
}

function createSpread<T extends Value = Value>(
	items: ValueSpread<T>['items']
): ValueSpread<T> {
	return {
		kind: 'spread',
		items,
	}
}

function createVariadicVector(item: Value): ValueSpread {
	return {
		kind: 'spread',
		items: [{inf: true, value: item}],
	}
}

function createDict(value: ValueDict['value'], rest?: Value): ValueDict {
	return {kind: 'dict', value, rest}
}

function createDataType(
	id: string,
	predicate: ValueDataType['predicate'],
	cast: ValueDataType['cast'],
	inherits: {class: ValueClass; methods: ValueDataType['methods']}[] = []
): ValueDataType {
	return {
		kind: 'dataType',
		id,
		predicate,
		cast,
		supers: new Set(inherits.map(i => i.class)),
		methods: inherits.map(i => i.methods).reduce(_.merge, {}),
	}
}

function inheritDataType(
	value: ValueDataType,
	cast: ValueDataType['cast']
): ValueDataType {
	return {
		kind: 'dataType',
		id: value.id,
		predicate: value.predicate,
		cast,
		origExp: value.origExp,
		supers: value.supers,
		methods: value.methods,
	}
}

function createTypeVar(...supers: ValueTypeVar['supers']): ValueTypeVar {
	const id = Symbol('typeVar')
	return {kind: 'typeVar', id, supers}
}

// Classes
const ClassHasSize: ValueClass = {
	kind: 'class',
	methods: {},
}
const THasSize = createTypeVar(ClassHasSize)

const ClassMonoid: ValueClass = {
	kind: 'class',
	methods: {},
}

// DataTypes
const TypeBoolean: ValueUnion = {
	kind: 'union',
	items: [false, true],
	cast: v => !!v,
}
export const TypeNumber = createDataType('number', _.isNumber, () => 0)
export const TypeString = createDataType('string', _.isString, () => '', [
	{
		class: ClassHasSize,
		methods: {
			size: function (str) {
				const _str = this.eval<string>(str)
				return _str.length
			},
		},
	},
	{
		class: ClassMonoid,
		methods: {
			'++': function (x, y) {
				return this.eval<string>(x) + this.eval<string>(y)
			},
		},
	},
])

const TypeLiterals = new Set([TypeBoolean, TypeNumber, TypeString])

export const TypeIO = createDataType('IO', _.isFunction, () => null)

export const TypeType = createDataType(
	'type',
	v => {
		return isKindOf('union', v) || isKindOf('dataType', v)
	},
	() => TypeType
)

export const TypeSingleton = createDataType(
	'singleton',
	v => v === null || typeof v === 'boolean' || isKindOf('singleton', v),
	() => Unit
)
export const TypeTypeVar = createDataType(
	'typeVar',
	v => isKindOf('typeVar', v),
	() => Unit
)
export const TypeClass = createDataType(
	'class',
	v => isKindOf('class', v),
	() => Unit
)
export const TypeVector = createDataType(
	'vector',
	v => _.isArray(v) || isKindOf('spread', v),
	() => [],
	[
		{
			class: ClassHasSize,
			methods: {
				size: function (coll) {
					const _coll = this.eval<Value[] | ValueSpread>(coll)
					if (_.isArray(_coll)) {
						return _coll.length
					} else {
						return Infinity
					}
				},
			},
		},
		{
			class: ClassMonoid,
			methods: {
				'++': function (x, y) {
					return [...this.eval<Value[]>(x), ...this.eval<Value[]>(y)]
				},
			},
		},
	]
)
export const TypeDict = createDataType(
	'dict',
	v => isKindOf('dict', v),
	() => ({kind: 'dict', value: {}}),
	[
		{
			class: ClassHasSize,
			methods: {
				size: function (dict) {
					const d = this.eval<ValueDict>(dict)
					if (d.rest !== undefined) {
						return Infinity
					} else {
						return _.keys(d.value).length
					}
				},
			},
		},
	]
)
export const TypeVec2 = createDataType(
	'vec2',
	v => _.isArray(v) && v.length === 2 && v.every(_.isNumber),
	v => {
		if (_.isArray(v) && v.length > 2) {
			return v.slice(0, 2)
		} else if (_.isNumber(v)) {
			return [v, v]
		}
		return [0, 0]
	},
	[
		{
			class: ClassHasSize,
			methods: {
				size: function () {
					return 2
				},
			},
		},
	]
)

const TypeVarT = createTypeVar()
const TypeVarU = createTypeVar()

const PolyFnSize: ValuePolyFn = {
	kind: 'polyFn',
	params: {
		x: {inf: false, value: THasSize},
	},
	out: TypeNumber,
	ofClass: ClassHasSize,
}

ClassHasSize.methods['size'] = PolyFnSize

const PolyFnConcat: ValuePolyFn = {
	kind: 'polyFn',
	params: {
		x: {value: createTypeVar(ClassMonoid)},
		y: {value: createTypeVar(ClassMonoid)},
	},
	out: createTypeVar(ClassMonoid),
	ofClass: ClassMonoid,
}

ClassMonoid.methods['++'] = PolyFnConcat

const OrderingLT: ValueSingleton = {kind: 'singleton'}
const OrderingEQ: ValueSingleton = {kind: 'singleton'}
const OrderingGT: ValueSingleton = {kind: 'singleton'}

export const GlobalScope = createExpScope({
	scope: {
		Number: wrapValue(TypeNumber),
		String: wrapValue(TypeString),
		Boolean: wrapValue(TypeBoolean),
		IO: wrapValue(TypeIO),
		Type: wrapValue(TypeType),
		Singleton: wrapValue(TypeSingleton),
		TypeVar: wrapValue(TypeTypeVar),
		Vector: wrapValue(TypeVector),
		Dict: wrapValue(TypeDict),
		Vec2: wrapValue(TypeVec2),
		THasSize: wrapValue(THasSize),
		LT: wrapValue(OrderingLT),
		EQ: wrapValue(OrderingEQ),
		GT: wrapValue(OrderingGT),
		Ordering: wrapValue({
			kind: 'union',
			items: [OrderingLT, OrderingEQ, OrderingGT],
		}),
		HasSize: wrapValue(ClassHasSize),
		size: wrapValue(PolyFnSize),
		Monoid: wrapValue(ClassMonoid),
		'++': wrapValue(PolyFnConcat),
		PI: wrapValue(Math.PI),
		'+': wrapValue({
			kind: 'fn',
			params: {xs: {inf: true, value: TypeNumber}},
			out: TypeNumber,
			body(xs) {
				return this.eval<number[]>(xs).reduce((a, b) => a + b, 0)
			},
		}),
		'*': wrapValue({
			kind: 'fn',
			params: {
				xs: {
					inf: true,
					value: inheritDataType(TypeNumber, () => 1),
				},
			},
			out: TypeNumber,
			body(xs) {
				return this.eval<number[]>(xs).reduce((a, b) => a * b, 1)
			},
		}),
		and: wrapValue({
			kind: 'fn',
			params: {xs: {inf: true, value: TypeBoolean}},
			out: TypeBoolean,
			body(xs) {
				return this.eval<boolean[]>(xs).reduce((a, b) => a && b, true)
			},
		}),
		or: wrapValue({
			kind: 'fn',
			params: {xs: {inf: true, value: TypeBoolean}},
			out: TypeBoolean,
			body(xs) {
				return this.eval<boolean[]>(xs).reduce((a, b) => a || b, false)
			},
		}),
		not: wrapValue({
			kind: 'fn',
			params: {x: {value: TypeBoolean}},
			out: TypeBoolean,
			body(x) {
				return !this.eval(x)
			},
		}),
		identity: wrapValue({
			kind: 'fn',
			params: {x: {value: TypeVarT}},
			out: TypeVarT,
			body(x) {
				return this.eval(x)
			},
		}),
		'->': wrapValue({
			kind: 'fn',
			params: {
				params: {value: createVariadicVector(Any)},
				out: {value: Any},
			},
			out: createFnType(createSpread([{inf: true, value: Any}]), Any),
			body(params, out) {
				return {
					kind: 'fnType',
					params: this.eval(params),
					out: this.eval(out),
				}
			},
		}),
		'|': wrapValue({
			kind: 'fn',
			params: {xs: {inf: true, value: Any}},
			out: Any,
			body(xs) {
				return uniteType(this.eval<Value[]>(xs))
			},
		}),
		'/': wrapValue({
			kind: 'fn',
			params: {xs: {inf: true, value: inheritDataType(TypeNumber, () => 1)}},
			out: createMaybe(TypeNumber),
			body(xs) {
				const _xs = this.eval<number[]>(xs)
				let ret: number
				switch (_xs.length) {
					case 0:
						ret = 1
						break
					case 1:
						ret = 1 / _xs[0]
						break
					default:
						ret = _xs.slice(1).reduce((a, x) => a / x, _xs[0])
						break
				}
				return Number.isFinite(ret) ? ret : Unit
			},
		}),
		range: wrapValue({
			kind: 'fn',
			params: {
				start: {value: TypeNumber},
				end: {value: TypeNumber},
				step: {value: inheritDataType(TypeNumber, () => 1)},
			},
			out: createVariadicVector(TypeNumber),
			body(start, end, step) {
				const _start = this.eval<number>(start)
				const _end = this.eval<number>(end)
				const _step = this.eval<number>(step)
				return _.range(_start, _end, _step)
			},
		}),
		clamp: wrapValue({
			kind: 'fn',
			params: {
				x: {value: TypeNumber},
				min: {value: inheritDataType(TypeNumber, () => -Infinity)},
				max: {value: inheritDataType(TypeNumber, () => Infinity)},
			},
			out: TypeNumber,
			body(x, min, max) {
				return _.clamp(
					this.eval<number>(x),
					this.eval<number>(min),
					this.eval<number>(max)
				)
			},
		}),
		def: wrapValue({
			kind: 'fn',
			params: {
				name: {value: TypeString},
				value: {value: Any},
			},
			out: TypeIO,
			body(name, value) {
				const n = this.eval<string>(name)
				const v = this.eval(value)
				return {
					kind: 'data',
					type: TypeIO,
					value: () => {
						const exp = wrapValue(v)
						GlobalScope.scope[n] = exp
						exp.parent = GlobalScope
					},
				}
			},
		}),
		typeof: wrapValue({
			kind: 'fn',
			params: {x: {inf: false, value: Any}},
			out: Any,
			body(x) {
				return this.eval(x)
			},
		}),
		singleton: wrapValue({
			kind: 'fn',
			params: {},
			out: TypeSingleton,
			body() {
				return {kind: 'singleton'}
			},
		}),
		typeVar: wrapValue({
			kind: 'fn',
			params: {
				supers: {inf: true, value: TypeClass},
			},
			out: TypeTypeVar,
			body(supers) {
				const _supers = this.eval<ValueClass[]>(supers)
				return createTypeVar(..._supers)
			},
		}),
		T: wrapValue(TypeVarT),
		U: wrapValue(TypeVarU),
		if: wrapValue({
			kind: 'fn',
			params: {
				test: {value: TypeBoolean},
				then: {value: TypeVarT},
				else: {value: TypeVarT},
			},
			out: TypeVarT,
			body(test, then, _else) {
				return this.eval(test) ? this.eval(then) : this.eval(_else)
			},
		}),
		instanceof: wrapValue({
			kind: 'fn',
			params: {value: {value: Any}, type: {value: Any}},
			out: TypeBoolean,
			body(value, type) {
				return isInstanceOf(this.eval(value), this.eval(type))
			},
		}),
		subtypeof: wrapValue({
			kind: 'fn',
			params: {value: {value: Any}, type: {value: Any}},
			out: TypeBoolean,
			body(value, type) {
				return isSubtypeOf(this.eval(value), this.eval(type))
			},
		}),
		nth: wrapValue({
			kind: 'fn',
			params: {
				coll: {value: createVariadicVector(TypeVarT)},
				index: {value: createMaybe(TypeNumber)},
			},
			out: uniteType([TypeVarT, Unit]),
			body(coll, index) {
				const _coll = this.eval<Value[]>(coll)
				const i = this.eval<number | ValueUnit>(index)
				if (
					isKindOf('unit', i) ||
					!Number.isInteger(i) ||
					!(0 <= i && i < _coll.length)
				) {
					return Unit
				}
				return _coll[i]
			},
		}),
		'==': wrapValue({
			kind: 'fn',
			params: {xs: {inf: true, value: Any}},
			out: TypeBoolean,
			body(xs) {
				const _xs = this.eval<Value[]>(xs)
				if (_xs.length === 0) {
					return true
				} else {
					const [fst, ...rest] = _xs
					return rest.every(r => equalsValue(fst, r))
				}
			},
		}),
	},
})

function uniteType(
	types: Value[],
	cast?: NonNullable<ValueUnion['cast']>
): Value {
	let items: (Value | undefined)[] = types.flatMap(t => {
		if (isKindOf('union', t)) {
			return t.items
		} else if (isKindOf('maybe', t)) {
			return [Unit, t.value]
		} else {
			return [t]
		}
	})
	let isMaybe = false

	if (items.findIndex(it => it && isKindOf('unit', it)) !== -1) {
		items = items.filter(it => it && !isKindOf('unit', it))
		isMaybe = true
	}

	if (items.length >= 2) {
		for (let a = 0; a < items.length - 1; a++) {
			const aItem = items[a]
			if (aItem === undefined) continue

			for (let b = a + 1; b < items.length; b++) {
				const bItem = items[b]
				if (bItem === undefined) continue

				if (isSubtypeOf(bItem, aItem)) {
					items[b] = undefined
				} else if (isSubtypeOf(aItem, bItem)) {
					items[a] = undefined
					break
				}
			}
		}
	}

	const uniqItems = items.filter(i => i !== undefined) as ValueUnion['items']

	let value: Value

	switch (uniqItems.length) {
		case 0:
			value = Unit
			break
		case 1:
			value = uniqItems[0]
			break
		default:
			value = {kind: 'union', items: uniqItems, cast}
	}

	return isMaybe ? createMaybe(value) : value
}

export function equalsValue(a: Value, b: Value): boolean {
	if (!_.isObject(a)) {
		return a === b
	}

	if (_.isArray(a)) {
		return (
			_.isArray(b) && a.length === b.length && _$.everyByPair(a, b, equalsValue)
		)
	}

	switch (a.kind) {
		case 'any':
			return isKindOf('any', b)
		case 'unit':
			return isKindOf('unit', b)
		case 'singleton':
		case 'fn':
			return a === b
		case 'dataType':
			return isKindOf('dataType', b) && a.id === b.id
		case 'fnType':
			return (
				isKindOf('fnType', b) &&
				equalsValue(a.params, b.params) &&
				equalsValue(a.out, b.out)
			)
		case 'dict':
			if (isKindOf('dict', b)) {
				const aKeys = _.keys(a.value)
				const bKeys = _.keys(b.value)
				return (
					aKeys.length === bKeys.length &&
					aKeys.every(
						k => bKeys.includes(k) && equalsValue(a.value[k], b.value[k])
					)
				)
			}
			return false
		case 'union':
			return (
				isKindOf('union', b) &&
				_.xorWith(a.items, b.items, equalsValue).length === 0
			)
		case 'maybe':
			return isKindOf('maybe', b) && equalsValue(a.value, b.value)
		case 'spread':
			return (
				isKindOf('spread', b) &&
				a.items.length === b.items.length &&
				_$.everyByPair(
					a.items,
					b.items,
					(ai, bi) => !!ai.inf === !!bi.inf && equalsValue(ai.value, bi.value)
				)
			)
		case 'data':
			return false
		case 'typeVar':
			return isKindOf('typeVar', b) && a.id === b.id
		case 'class':
		case 'polyFn':
		case 'cast':
			throw new Error(`Cannot determine equality of ${a.kind} yet`)
	}
}

type ResolveSymbolResult =
	| {semantic: 'ref'; ref: Exp}
	| {semantic: 'param'; type: Exp}
	| {semantic: 'undefined'}

function resolveSymbol(exp: ExpSymbol): WithLog<ResolveSymbolResult> {
	// Search ancestors
	let parent = exp.parent
	let name = exp.name
	const history = new WeakSet<ExpSymbol>([exp])
	while (parent) {
		// If the parent is a scope containing the symbol
		if (parent.ast === 'scope' && name in parent.scope) {
			const ref: Exp = parent.scope[name]
			// If the the reference is an another symbol
			if (ref.ast === 'symbol') {
				// Detect the circular reference
				if (history.has(ref)) {
					return withLog({semantic: 'undefined'}, [
						{
							level: 'error',
							reason: `Symbol ${printExp(exp)} has a circular reference`,
						},
					])
				}
				// Proceed resolving
				history.add(ref)
				parent = ref
				name = ref.name
			} else {
				// Found it
				return withLog({
					semantic: 'ref',
					ref,
				})
			}
		} else if (parent.ast === 'fn' && name in parent.params) {
			// Is a parameter of function definition
			const param = parent.params[name]
			const type: Exp = param.inf
				? {
						ast: 'spread',
						items: [{inf: true, value: param.value}],
				  }
				: param.value

			return withLog({semantic: 'param', type})
		}
		parent = parent.parent
	}

	// Not Defined
	return withLog({semantic: 'undefined'}, [
		{level: 'error', reason: `${exp.name} is not defined`},
	])
}

function assertExpListParam(exp: ExpList): ValueFn['params'] {
	const fn = assertExpType(exp.fn)
	if (isKindOf('fn', fn) || isKindOf('polyFn', fn)) {
		return fn.params
	} else {
		return {}
	}
}

function assertExpType(exp: Exp): Value {
	switch (exp.ast) {
		case 'value':
			return exp.value
		case 'symbol': {
			const [inspected] = resolveSymbol(exp)
			if (inspected.semantic == 'ref') {
				return assertExpType(inspected.ref)
			} else if (inspected.semantic === 'param') {
				return assertExpType(inspected.type)
			}
			return Unit
		}
		case 'fn': {
			const paramsExp: ExpSpread = {
				ast: 'spread',
				items: _.values(exp.params),
			}
			const params = assertExpType(paramsExp) as ValueSpread
			const out = assertExpType(exp.body)
			return createFnType(params, out)
		}
		case 'maybe': {
			const value = assertExpType(exp.value)
			if (isKindOf('unit', value) || isKindOf('maybe', value)) {
				return value
			} else {
				return {
					kind: 'maybe',
					value,
				}
			}
		}
		case 'list': {
			const fn = assertExpType(exp.fn)
			if (isKindOf('fn', fn) || isKindOf('polyFn', fn)) {
				const type = fn.out
				if (isKindOf('typeVar', type)) {
					const env = new Map<symbol, Value>()
					const expParams = exp.params.map(assertExpType)
					compareType(expParams, getParamType(fn), false, env)

					const t = env.get(type.id)
					if (!t) throw new Error('NOOOO')
					return t
				} else {
					return type
				}
			} else {
				return fn
			}
		}
		case 'spread': {
			const items = exp.items.map(({inf, value}) => ({
				inf,
				value: assertExpType(value),
			}))
			return createSpread(items)
		}
		case 'dict': {
			const items = _.mapValues(exp.items, assertExpType)
			const rest = exp.rest !== undefined ? assertExpType(exp.rest) : undefined
			return createDict(items, rest)
		}
		case 'cast':
			return assertExpType(exp.type)
		case 'scope':
			return exp.out ? assertExpType(exp) : Unit
		case 'param':
			return exp.type
		case 'fncall':
			return exp.type
	}
}

function getParamType(fn: ValueFn | ValuePolyFn): ValueFnType['params'] {
	return createSpread(_.values(fn.params))
}

export function evalExp(exp: Exp, env?: Record<string, Exp>): WithLog<Value> {
	const _eval = (e: Exp) => evalExp(e, env)

	switch (exp.ast) {
		case 'value':
			return withLog(exp.value, [])
		case 'symbol':
			return evalSymbol(exp)
		case 'fn':
			return evalFn(exp)
		case 'maybe':
			return evalMaybe(exp)
		case 'list':
			return evalList(exp)
		case 'spread':
			return evalSpread(exp)
		case 'dict':
			return evalDict(exp)
		case 'cast':
			return evalCast(exp)
		case 'scope':
			return exp.out ? _eval(exp.out) : withLog(Unit)
		case 'param':
			if (!env || !(exp.name in env)) {
				throw new Error(`Prameter ${exp.name} does not exist in env`)
			}
			return _eval(env[exp.name])
		case 'fncall': {
			const paramsLog: Log[] = []
			const callLog: Log[] = []

			const context: ValueFnContext = {
				log(log) {
					callLog.push(log)
				},
				eval(e) {
					const [result, log] = evalExp(e, env)
					paramsLog.push(...log)
					return result as any
				},
			}

			const evaluated = exp.fn.call(context, ...exp.params)
			const log = [...paramsLog, ...callLog]
			return withLog(evaluated, log)
		}
	}

	function evalSymbol(exp: ExpSymbol): WithLog<Value> {
		const [result, log] = resolveSymbol(exp)
		if (result.semantic === 'ref') {
			return _eval(result.ref)
		} else if (result.semantic === 'param') {
			const [type, log] = _eval(result.type)
			return withLog(getDefault(type), log)
		} else {
			return withLog(Unit, log)
		}
	}

	function evalFn(exp: ExpFn): WithLog<Value> {
		const [params, paramsLog] = mapValueWithLog(exp.params, p => {
			const [result, log] = _eval(p.value)
			return withLog({inf: !!p.inf, value: result}, log)
		})

		const [pdg, bodyLog] = createPdg(exp.body, env)

		const body: ValueFn['body'] = function (...xs) {
			const localEnv = _.fromPairs(_$.zipShorter(_.keys(exp.params), xs))
			return evalExp(pdg, {...env, ...localEnv})[0]
		}

		const fn: ValueFn = {
			kind: 'fn',
			params,
			out: TypeNumber,
			body,
			expBody: exp.body,
		}

		return withLog(fn, [...paramsLog, ...bodyLog])
	}

	function evalMaybe(exp: ExpMaybe) {
		const [value, log] = _eval(exp.value)
		return withLog(createMaybe(value), log)
	}

	function evalList(exp: ExpList): WithLog<Value> {
		const [fn, fnLog] = _eval(exp.fn)

		let evaluated: Value, applyLog: Log[]

		if (isKindOf('fn', fn)) {
			;[evaluated, applyLog] = evalListFn(fn, exp)
		} else if (isKindOf('polyFn', fn)) {
			;[evaluated, applyLog] = evalListPolyFn(fn, exp)
		} else {
			evaluated = fn
			applyLog = []
		}

		return withLog(evaluated, [...fnLog, ...applyLog])
	}

	function evalListFn(fn: ValueFn, exp: ExpList) {
		const [params, castLog] = assignParam(exp)

		const paramsLog: Log[] = []
		const callLog: Log[] = []

		const context: ValueFnContext = {
			log(log) {
				callLog.push(log)
			},
			eval(e) {
				const [result, log] = _eval(e)
				paramsLog.push(...log)
				return result as any
			},
		}

		const evaluated = fn.body.call(context, ...params)
		const log = [...castLog, ...paramsLog, ...callLog]

		return withLog(evaluated, log)
	}

	function evalListPolyFn(fn: ValuePolyFn, exp: ExpList) {
		const [params, castLog] = assignParam(exp)

		const paramType = assertExpType(params[0])
		const cls = fn.ofClass

		if (!isKindOf('dataType', paramType) || !paramType.supers.has(cls)) {
			return withLog(Unit, [
				{
					level: 'error',
					reason: 'Cannot resolve the polyorphic function definition',
				},
			])
		}
		const name = _.findKey(cls.methods, m => m === fn)
		if (!name) throw new Error('Cannot resolve the polyfn')
		const resolvedFn = paramType.methods[name]

		const callLog: Log[] = []
		const paramsLog: Log[] = []

		const context: ValueFnContext = {
			log(log) {
				callLog.push(log)
			},
			eval(e) {
				const [result, log] = _eval(e)
				paramsLog.push(...log)
				return result as any
			},
		}

		const evaluated = resolvedFn.call(context, ...params)
		const log = [...castLog, ...paramsLog, ...callLog]

		return withLog(evaluated, log)
	}

	function evalSpread(exp: ExpSpread): WithLog<Value> {
		const [items, log] = mapWithLog(exp.items, p => {
			const [result, log] = _eval(p.value)
			return withLog({inf: !!p.inf, value: result}, log)
		})
		// Delete duplicated
		for (let i = 0; i < items.length - 1; ) {
			const item = items[i]
			const nextItem = items[i + 1]
			if (item.inf && equalsValue(item.value, nextItem.value)) {
				items.splice(i + 1, 1)
			} else {
				i++
			}
		}

		let evaluated: Value
		if (items.every(i => !i.inf)) {
			evaluated = items.map(i => i.value)
		} else {
			evaluated = createSpread(items)
		}
		return withLog(evaluated, log)
	}

	function evalDict(exp: ExpDict): WithLog<ValueDict> {
		// Items
		const [items, itemsLog] = mapValueWithLog(exp.items, _eval)

		// Rest
		let rest: Value | undefined = undefined,
			restLog: Log[] = []
		const restResult = exp.rest && _eval(exp.rest)
		if (restResult) {
			;[rest, restLog] = restResult
			// Normalize
			for (const key in items) {
				if (equalsValue(items[key], rest)) {
					delete items[key]
				}
			}
		}

		const evaluated = createDict(items, rest)
		return withLog(evaluated, [...itemsLog, ...restLog])
	}

	function evalCast(exp: ExpCast) {
		const [value, valueLog] = _eval(exp.value)
		const [type, typeLog] = _eval(exp.type)

		let evaluated = castType(type, value)

		if (isKindOf('dataType', type) && !TypeLiterals.has(type)) {
			evaluated = {kind: 'cast', value: evaluated, type}
		}

		return withLog(evaluated, [...valueLog, ...typeLog])
	}
}

export function isKindOf(kind: 'any', x: Value): x is ValueAny
export function isKindOf(kind: 'unit', x: Value): x is ValueUnit
export function isKindOf(kind: 'fn', x: Value): x is ValueFn
export function isKindOf(kind: 'fnType', x: Value): x is ValueFnType
export function isKindOf(kind: 'dict', x: Value): x is ValueDict
export function isKindOf(kind: 'union', x: Value): x is ValueUnion
export function isKindOf(kind: 'maybe', x: Value): x is ValueMaybe
export function isKindOf(kind: 'dataType', x: Value): x is ValueDataType
export function isKindOf(kind: 'spread', x: Value): x is ValueSpread
export function isKindOf(kind: 'singleton', x: Value): x is ValueCustomSingleton
export function isKindOf(kind: 'data', x: Value): x is ValueData
export function isKindOf(kind: 'typeVar', x: Value): x is ValueTypeVar
export function isKindOf(kind: 'class', x: Value): x is ValueClass
export function isKindOf(kind: 'polyFn', x: Value): x is ValuePolyFn
export function isKindOf<
	T extends Exclude<Value, null | boolean | number | string | any[]>
>(kind: T['kind'], x: Value): x is T {
	return _.isObject(x) && !_.isArray(x) && x.kind === kind
}

function createPdg(exp: Exp, env: Record<string, Exp> = {}): WithLog<Exp> {
	const _createPdg = (e: Exp) => createPdg(e, env)

	switch (exp.ast) {
		case 'value':
			return withLog(exp)
		case 'symbol':
			return createSymbol(exp)
		case 'fn':
			return withLog(exp) //createFn(exp)
		case 'list':
			return createFncall(exp)
		case 'scope':
			return _createPdg(exp.out ?? wrapValue(Unit))
		case 'fncall':
			return withLog(exp)
		default:
			throw new Error(`Not yet implemented ${exp.ast}`)
	}

	function createSymbol(exp: ExpSymbol): WithLog<Exp> {
		if (exp.name in env) {
			return withLog(env[exp.name])
		}

		const [result, log] = resolveSymbol(exp)
		if (result.semantic === 'ref') {
			return withLog(result.ref)
		} else if (result.semantic === 'param') {
			const type = assertExpType(result.type)
			return withLog({ast: 'param', name: exp.name, type})
		} else {
			return withLog(wrapValue(Unit), log)
		}
	}

	function createFncall(exp: ExpList) {
		const [params, paramsLog] = mapWithLog(exp.params, _createPdg)

		const [fnValue] = evalExp(exp.fn)

		if (isKindOf('fn', fnValue)) {
			const [assignedParams, typeAssertLog] = assignParam(exp)

			const ret: ExpFncall = {
				ast: 'fncall',
				fn: fnValue.body,
				params: assignedParams,
				type: fnValue.out,
				origFn: exp.fn,
				origParams: params,
			}

			const logs = [...paramsLog, ...typeAssertLog]
			return withLog(ret, logs)
		} else {
			return withLog(exp.fn)
		}
	}
}

export const evalStr = composeWithLog(readStr, evalExp)

export function isSubtypeOf(a: Value, b: Value) {
	return compareType(a, b, false, new Map())
}
export function isInstanceOf(a: Value, b: Value) {
	return compareType(a, b, true, new Map())
}

function compareType(
	a: Value,
	b: Value,
	onlyInstance: boolean,
	env: Map<symbol, Value>
): boolean {
	const compare = (a: Value, b: Value) => compareType(a, b, onlyInstance, env)

	if (!_.isObject(b)) return a === b
	if (_.isArray(b)) return compareVector(a, b)

	switch (b.kind) {
		case 'any':
			return true
		case 'unit':
			return isKindOf('unit', a)
		case 'dataType':
			return compareValueType(a, b)
		case 'spread':
			return compareSpread(a, b)
		case 'union':
			return compareUnion(a, b)
		case 'maybe':
			return (
				(isKindOf('maybe', a) && compare(a.value, b.value)) ||
				compare(a, b.value)
			)
		case 'fnType':
			return compareFnType(a, b)
		case 'fn':
		case 'singleton':
			return a === b
		case 'dict':
			return compareDict(a, b)
		case 'typeVar':
			return compareTypeVar(a, b)
		default:
			throw new Error('Not yet implemented')
	}

	// Predicates for each types
	function compareVector(a: Value, b: Value[]) {
		if (!_.isArray(a) || a.length < b.length) return false
		return _$.everyByPair(a, b, compare)
	}

	function compareSpread(a: Value, b: ValueSpread) {
		let aItems: ValueSpread['items']

		if (_.isArray(a)) {
			aItems = a.map(value => ({inf: false, value}))
		} else if (isKindOf('spread', a)) {
			aItems = a.items
		} else {
			return false
		}

		const bItems = b.items

		let ai = 0,
			bi = 0
		while (ai < aItems.length) {
			if (bItems.length <= bi) return false

			const a = aItems[ai]
			const b = bItems[bi]

			if (!compare(a.value, b.value)) return false

			if (!!a.inf === !!b.inf) {
				ai += 1
				bi += 1
			} else if (!a.inf) {
				// !a.inf && b.inf
				ai += 1
			} else {
				// a.inf && !b.inf
				bi += 1
			}
		}

		return true
	}

	function compareUnion(a: Value, b: ValueUnion) {
		let aTypes: Value[]
		if (onlyInstance) {
			aTypes = [a]
		} else {
			aTypes = isKindOf('union', a) ? a.items : [a]
		}

		const bTypes = b.items
		return aTypes.every(at => bTypes.some(bt => compare(at, bt)))
	}

	function compareValueType(a: Value, b: ValueDataType) {
		if (onlyInstance) {
			return b.predicate(a)
		} else {
			return (
				b.predicate(a) ||
				(isKindOf('dataType', a) && a.id === b.id) ||
				(isKindOf('union', a) && a.items.every(ai => compare(ai, b)))
			)
		}
	}

	function compareFnType(a: Value, b: ValueFnType) {
		const _a = normalizeToFn(a)
		return isSubtypeOf(_a.params, b.params) && isSubtypeOf(_a.out, b.out)

		function normalizeToFn(a: Value): Omit<ValueFnType, 'kind'> {
			if (isKindOf('fn', a)) {
				const params = getParamType(a)
				return {params, out: a.out}
			} else {
				return {params: createSpread([]), out: a}
			}
		}
	}

	function compareDict(a: Value, b: ValueDict) {
		if (!isKindOf('dict', a)) return false

		// Check if all keys in b exists in a
		const bEntries = _.entries(b.value)
		const keysResult = bEntries.every(([key, bType]) => {
			if (!(key in a.value)) return false

			const aType = a.value[key]

			return compare(aType, bType)
		})

		if (!keysResult) return false

		// Test the spread part
		if (b.rest !== undefined) {
			const restType = b.rest
			const restKeys = _.difference(_.keys(a.value), _.keys(b.value))

			const restResult = restKeys.every(key => {
				const aType = a.value[key]
				return compare(aType, restType)
			})

			if (!restResult) return false
		}

		return true
	}

	function compareTypeVar(a: Value, b: ValueTypeVar) {
		const bPrevType = env.get(b.id)
		const bType = bPrevType !== undefined ? uniteType([bPrevType, a]) : a
		env.set(b.id, bType)

		const isInstance = b.supers.every(bs => {
			return isKindOf('dataType', bType) && bType.supers.has(bs)
		})

		if (!isInstance) return false

		return true
	}
}

function getDefault(type: Value) {
	return castType(type, Unit)
}

function castType(type: Value, value: Value): Value {
	if (!_.isObject(type)) {
		return type
	}

	if (_.isArray(type)) {
		const values = _.isArray(value) ? value : []
		return type.map((t, i) =>
			i < values.length ? castType(t, values[i]) : getDefault(t)
		)
	}

	switch (type.kind) {
		case 'unit':
		case 'typeVar':
			return Unit
		case 'dataType':
			return isInstanceOf(value, type) ? value : type.cast(value)
		case 'fnType':
			return getDefault(type.out)
		case 'union':
			if (isInstanceOf(value, type)) {
				return value
			} else {
				return type.cast ? type.cast(value) : getDefault(type.items[0])
			}
		case 'maybe':
			if (isInstanceOf(value, type.value)) {
				return value
			} else {
				return Unit
			}
		case 'singleton':
			return type
		case 'spread': {
			const items = type.items.flatMap(it => (it.inf ? [] : [it.value]))
			return castType(items, value)
		}
		default:
			throw new Error(`Not yet implemented: castType(${type.kind})`)
	}
}

function assignParam(exp: ExpList): WithLog<Exp[]> {
	const from = exp.params
	const to = _.values(assertExpListParam(exp))

	const log: Log[] = []

	const casted: Exp[] = []

	let isParamShort = false

	let i = 0
	for (let j = 0; j < to.length; j++) {
		const toType = to[j]
		if (!toType.inf) {
			isParamShort = from.length <= i
			const fromItem = isParamShort ? wrapValue(Unit) : from[i]
			const [result, assignLog] = assign(fromItem, toType.value)
			log.push(...assignLog)
			casted.push(result)
			i += 1
		} else {
			// inf
			const nextToType = j < to.length - 1 ? to[j + 1] : null

			const restCasted: ExpSpread['items'] = []

			for (; i < from.length; i++) {
				const fromItem = from[i]
				const fromType = assertExpType(fromItem)
				if (nextToType && isSubtypeOf(fromType, nextToType.value)) {
					break
				}

				const [value, assignLog] = assign(fromItem, toType.value)
				log.push(...assignLog)
				restCasted.push({inf: false, value})
			}

			casted.push({ast: 'spread', items: restCasted})
		}
	}

	if (isParamShort) {
		log.unshift({level: 'error', reason: 'Too short parameter'})
	}

	return withLog(casted, log)

	function assign(from: Exp, to: Value): WithLog<Exp> {
		const fromType = assertExpType(from)

		if (isSubtypeOf(fromType, to)) {
			return withLog(from)
		} else {
			const cast = createExpCast(from, wrapValue(to, false), false)
			const log: Log[] = []

			if (!isKindOf('unit', fromType)) {
				const fromStr = printValue(fromType)
				const toStr = printValue(to)
				log.push({
					level: 'error',
					reason: `${fromStr} cannot be casted to ${toStr}`,
				})
			}
			return withLog(cast, log)
		}
	}
}

export function printExp(exp: Exp): string {
	switch (exp.ast) {
		case 'value':
			return printValue(exp.value, false, exp)
		case 'param':
		case 'symbol':
			return exp.name
		case 'fn': {
			const params = _.entries(exp.params).map(
				([name, {inf, value}]) =>
					`${inf ? '...' : ''}${name}:${printExp(value)}`
			)
			const body = printExp(exp.body)
			return `(=> [${params.join(' ')}] ${body})`
		}
		case 'maybe':
			return `?${printExp(exp.value)}`
		case 'list': {
			const fn = printExp(exp.fn)
			const params = exp.params.map(printExp)
			return `(${fn} ${params.join(' ')})`
		}
		case 'spread': {
			const items = exp.items.map(i => (i.inf ? '...' : '') + printExp(i.value))
			return `[${items.join(' ')}]`
		}
		case 'dict': {
			const entries = _.entries(exp.items)
			const pairs = entries.map(([k, v]) => `${k}: ${printExp(v)}`)
			const rest = exp.rest !== undefined ? ['...' + printExp(exp.rest)] : []
			const lines = [...pairs, ...rest]
			return '{' + lines.join(' ') + '}'
		}
		case 'cast':
			return printExp(exp.value) + ':' + printExp(exp.type)
		case 'scope': {
			const entries = _.entries(exp.scope)
			const pairs = entries.map(([k, v]) => `${k} = ${printExp(v)}`)
			const out = exp.out ? [printExp(exp.out)] : []
			const lines = [...pairs, ...out]
			return `{${lines.join(' ')}}`
		}
		case 'fncall': {
			const fn = printExp(exp.origFn)
			const params = exp.origParams.map(printExp)
			return `(${fn} ${params.join(' ')})`
		}
	}
}

function retrieveValueName(
	s:
		| ValueUnion
		| ValueCustomSingleton
		| ValueDataType
		| ValueTypeVar
		| ValueClass,
	baseExp: Exp
): string | undefined {
	if (!s.origExp) {
		return
	}

	const {origExp} = s
	if (!origExp.parent) return

	const parent = origExp.parent
	if (parent.ast !== 'scope') return

	const name = _.findKey(parent.scope, e => e === origExp)
	if (!name) return

	const sym: ExpSymbol = {
		parent: baseExp,
		ast: 'symbol',
		name,
	}

	const [symInspected] = resolveSymbol(sym)

	if (symInspected.semantic !== 'ref' || symInspected.ref !== origExp) {
		return
	}

	return name
}

export function printValue(
	val: Value,
	printName = true,
	baseExp: Exp = GlobalScope
): string {
	const print = (v: Value) => printValue(v, true, baseExp)

	if (!_.isObject(val)) {
		if (Number.isNaN(val)) return 'nan'
		switch (val) {
			case Infinity:
				return 'inf'
			case -Infinity:
				return '-inf'
			default:
				return JSON.stringify(val)
		}
	}

	if (_.isArray(val)) {
		return '[' + val.map(print).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return '*'
		case 'unit':
			return '_'
		case 'dataType':
			return (printName && retrieveValueName(val, baseExp)) || `<valueType>`
		case 'spread': {
			const items = val.items.map(it => printSpreadItem(it))
			return `[${items.join(' ')}]`
		}
		case 'union': {
			if (printName) {
				const name = retrieveValueName(val, baseExp)
				if (name) return name
			}
			return '(| ' + val.items.map(print).join(' ') + ')'
		}
		case 'maybe':
			return '?' + print(val.value)
		case 'singleton':
			return (printName && retrieveValueName(val, baseExp)) || '<singleton>'
		case 'fnType':
			return '(-> ' + print(val.params) + ' ' + print(val.out) + ')'
		case 'fn': {
			const params = _.entries(val.params).map(([name, param]) =>
				printSpreadItem(param, name)
			)
			const body = val.expBody
				? printExp(val.expBody)
				: `<js>:${print(val.out)}`
			return `(=> [${params.join(' ')}] ${body})`
		}
		case 'dict': {
			const entries = _.entries(val.value)
			const pairs = entries.map(([k, v]) => `${k}: ${print(v)}`)
			const rest = val.rest !== undefined ? ['...' + print(val.rest)] : []
			const lines = [...pairs, ...rest]
			return '{' + lines.join(' ') + '}'
		}
		case 'data':
			return `<object of ${print(val.type)}>`
		case 'typeVar': {
			const supers = val.supers.map(print).join(' ')
			return (
				(printName && retrieveValueName(val, baseExp) && false) ||
				`(typeVar ${supers})`
			)
		}
		case 'class':
			return (printName && retrieveValueName(val, baseExp)) || `<class>`
		case 'polyFn': {
			const params = _.entries(val.params).map(([name, param]) =>
				printSpreadItem(param, name)
			)
			return `(=> [${params.join(' ')}] <poly>:${print(val.out)})`
		}
		case 'cast':
			return print(val.value) + ':' + print(val.type)
	}

	function printSpreadItem(
		{inf, value}: ISpreadItem<Value>,
		name?: string
	): string {
		return `${inf ? '...' : ''}${name ? name + ':' : ''}${print(value)}`
	}
}

runTest()
