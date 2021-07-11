import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'
import runTest from './test'

const parser = peg.generate(ParserDefinition)

type Value =
	| ValueAny
	| ValueUnit
	| Value[]
	| ValueInfVector
	| ValueSingleton
	| ValueValueType
	| ValueFnType
	| ValueUnion
	| ValueInfVector
	| ValueHashMap
	| ValueFn
	| ValueObject

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

interface ValueInfVector<T extends Value = Value> {
	kind: 'infVector'
	items: T[]
}

interface ValueValueType {
	kind: 'valueType'
	id: symbol
	origExp?: Exp
	predicate: (value: Value) => boolean
	cast: (value: Value) => Value
}

interface ValueUnion {
	kind: 'union'
	items: Exclude<Value, ValueUnion>[]
	cast?: (value: Value) => Value
	origExp?: Exp
}

interface ValueFnType {
	kind: 'fnType'
	params: Value[] | ValueInfVector
	out: Value
}

interface ValueFnThis {
	log: (log: Log) => void
	eval: <R extends Value = Value>(exp: Exp) => R
}

interface ValueFn {
	kind: 'fn'
	params: Record<string, Value>
	out: Value
	variadic?: boolean
	body: (this: ValueFnThis, ...arg0: Exp[]) => Value
	expBody?: Exp
}

interface ValueHashMap {
	kind: 'hashMap'
	value: {
		[key: string]: Value
	}
}

interface ValueObject {
	kind: 'object'
	type: ValueValueType
	value: any
}

type Exp =
	| ExpValue
	| ExpSymbol
	| ExpFn
	| ExpList
	| ExpVector
	| ExpInfVector
	| ExpHashMap
	| ExpScope

export interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
}

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
	params: Record<string, Exp>
	variadic?: boolean
	body: Exp
}

interface ExpList extends ExpBase {
	ast: 'list'
	fn: Exp
	params: Exp[]
}

interface ExpVector extends ExpBase {
	ast: 'vector'
	items: Exp[]
}

interface ExpInfVector extends ExpBase {
	ast: 'infVector'
	items: Exp[]
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	items: Record<string, Exp>
}

interface ExpScope extends ExpBase {
	ast: 'scope'
	scope: Record<string, Exp>
	out?: Exp
}

export function readStr(str: string): Exp {
	const exp = parser.parse(str) as Exp | undefined

	if (exp === undefined) {
		return wrapValue(Unit)
	} else {
		// Set global scope as parent
		exp.parent = GlobalScope
		return exp
	}
}

function wrapValue(value: Value): ExpValue {
	const ret: ExpValue = {ast: 'value', value}
	if (isKindOf(value, 'singleton') || isKindOf(value, 'valueType')) {
		value.origExp = ret
	}
	return ret
}

function createExpList(fn: Exp, params: Exp[], setParent = true) {
	const ret: ExpList = {ast: 'list', fn, params}

	if (setParent) {
		fn.parent = ret
		params.forEach(p => (p.parent = ret))
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

function createInfVector<T extends Value = Value>(
	...items: T[]
): ValueInfVector<T> {
	return {
		kind: 'infVector',
		items,
	}
}

function createHashMap(value: ValueHashMap['value']): ValueHashMap {
	return {kind: 'hashMap', value}
}

function createValueType(
	base: ValueValueType | string,
	predicate: ValueValueType['predicate'],
	cast: ValueValueType['cast']
): ValueValueType {
	const id = _.isString(base) ? Symbol(base) : base.id
	const origExp = _.isString(base) ? undefined : base.origExp

	return {
		kind: 'valueType',
		id,
		predicate,
		cast,
		origExp,
	}
}

const TypeBoolean: ValueUnion = {
	kind: 'union',
	items: [false, true],
}
const ExpTypeBoolean = wrapValue(TypeBoolean)
TypeBoolean.origExp = ExpTypeBoolean
const TypeNumber = createValueType('number', _.isNumber, () => 0)
const TypeString = createValueType('string', _.isString, () => '')
export const TypeIO = createValueType('IO', _.isFunction, () => null)
const TypeFnType = createValueType(
	'fnType',
	v => isKindOf(v, 'fnType'),
	() => ({
		kind: 'fnType',
		params: createInfVector(Any),
		out: Any,
	})
)
const TypeHashMap = createValueType(
	'hashMap',
	v => isKindOf(v, 'hashMap'),
	() => createHashMap({})
)

const OrderingLT: ValueSingleton = {kind: 'singleton'}
const OrderingEQ: ValueSingleton = {kind: 'singleton'}
const OrderingGT: ValueSingleton = {kind: 'singleton'}

const castTypeFn = wrapValue({
	kind: 'fn',
	params: {type: Any, value: Any},
	out: Any,
	body(type, value) {
		const t = this.eval(type)
		const v = this.eval(value)

		const casted = castType(t, v)

		if (!isKindOf(v, 'unit')) {
			this.log({
				level: 'info',
				reason: `Value ${printValue(v)} is converted to ${printValue(casted)}`,
			})
		}

		return casted
	},
})

export const GlobalScope = createExpScope({
	scope: {
		Number: wrapValue(TypeNumber),
		String: wrapValue(TypeString),
		Boolean: ExpTypeBoolean,
		FnType: wrapValue(TypeFnType),
		IO: wrapValue(TypeIO),
		LT: wrapValue(OrderingLT),
		EQ: wrapValue(OrderingEQ),
		GT: wrapValue(OrderingGT),
		Ordering: wrapValue({
			kind: 'union',
			items: [OrderingLT, OrderingEQ, OrderingGT],
		}),
		PI: wrapValue(Math.PI),
		'+': wrapValue({
			kind: 'fn',
			params: {xs: TypeNumber},
			out: TypeNumber,
			variadic: true,
			body(...xs) {
				return xs.map(x => this.eval<number>(x)).reduce((a, b) => a + b, 0)
			},
		}),
		'*': wrapValue({
			kind: 'fn',
			params: {xs: createValueType(TypeNumber, TypeNumber.predicate, () => 1)},
			out: TypeNumber,
			variadic: true,
			body(...xs) {
				return xs.map(x => this.eval<number>(x)).reduce((a, b) => a * b, 1)
			},
		}),
		and: wrapValue({
			kind: 'fn',
			params: {xs: TypeBoolean},
			out: TypeBoolean,
			variadic: true,
			body(...xs) {
				return xs.map(x => this.eval<boolean>(x)).reduce((a, b) => a && b, true)
			},
		}),
		or: wrapValue({
			kind: 'fn',
			params: {xs: TypeBoolean},
			out: TypeBoolean,
			variadic: true,
			body(...xs) {
				return xs
					.map(x => this.eval<boolean>(x))
					.reduce((a, b) => a || b, false)
			},
		}),
		not: wrapValue({
			kind: 'fn',
			params: {x: TypeBoolean},
			out: TypeBoolean,
			body(x) {
				return !this.eval(x)
			},
		}),
		'->': wrapValue({
			kind: 'fn',
			params: {params: createInfVector(Any), out: Any},
			out: TypeFnType,
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
			params: {xs: Any},
			out: Any,
			variadic: true,
			body(...xs) {
				return uniteType(xs.map(this.eval))
			},
		}),
		def: wrapValue({
			kind: 'fn',
			params: {name: TypeString, value: Any},
			out: TypeIO,
			body(name, value) {
				const n = this.eval<string>(name)
				const v = this.eval(value)
				return {
					kind: 'object',
					type: TypeIO,
					value: () => {
						GlobalScope.scope[n] = wrapValue(v)
					},
				}
			},
		}),
		typeof: wrapValue({
			kind: 'fn',
			params: {x: Any},
			out: Any,
			body(x) {
				return assertExpType(wrapValue(this.eval(x)))
			},
		}),
		isa: wrapValue({
			kind: 'fn',
			params: {value: Any, type: Any},
			out: TypeBoolean,
			body(value, type) {
				return isInstanceOf(this.eval(value), this.eval(type))
			},
		}),
		'==': wrapValue({
			kind: 'fn',
			params: {xs: Any},
			out: TypeBoolean,
			variadic: true,
			body(...xs) {
				const _xs = xs.map(x => this.eval(x))
				if (_xs.length === 0) {
					return true
				} else {
					const [fst, ...rest] = _xs
					return rest.every(r => equalsValue(fst, r))
				}
			},
		}),
		':': castTypeFn,
	},
})

export interface WithLogs<T> {
	result: T
	logs: Log[]
}

function uniteType(
	types: Value[],
	cast?: NonNullable<ValueUnion['cast']>
): Value {
	const items: (Exclude<Value, ValueUnion> | undefined)[] = types.flatMap(t =>
		isKindOf(t, 'union') ? t.items : [t]
	)

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

	return uniqItems.length > 0
		? {kind: 'union', items: uniqItems, cast}
		: uniqItems[0]
}

function equalsValue(a: Value, b: Value): boolean {
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
			return isKindOf(b, 'any')
		case 'unit':
			return isKindOf(b, 'unit')
		case 'singleton':
		case 'fn':
			return a === b
		case 'valueType':
			return isKindOf(b, 'valueType') && a.id === b.id
		case 'fnType':
			return (
				isKindOf(b, 'fnType') &&
				equalsValue(a.params, b.params) &&
				equalsValue(a.out, b.out)
			)
		case 'hashMap':
			if (isKindOf(b, 'hashMap')) {
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
				isKindOf(b, 'union') &&
				_.xorWith(a.items, b.items, equalsValue).length === 0
			)
		case 'infVector':
			return isKindOf(b, 'infVector') && equalsValue(a.items, b.items)
		case 'object':
			return false
	}
}

function withLog<T>(result: T, logs: Log[] = []) {
	return {result, logs}
}

type ResolveSymbolResult =
	| {semantic: 'ref'; ref: Exp}
	| {semantic: 'param'; type: Exp}
	| {semantic: 'undefined'}

function resolveSymbol(exp: ExpSymbol): WithLogs<ResolveSymbolResult> {
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
			return withLog({semantic: 'param', type: parent.params[name]})
		}
		parent = parent.parent
	}

	// Not Defined
	return withLog({semantic: 'undefined'}, [
		{level: 'error', reason: `${exp.name} is not defined`},
	])
}

function assertValueType(v: Value): Value {
	if (!_.isObject(v)) {
		return v
	}

	if (_.isArray(v)) {
		return v.map(assertValueType)
	}

	switch (v.kind) {
		case 'any':
		case 'unit':
		case 'singleton':
		case 'valueType':
		case 'fnType':
		case 'union':
		case 'infVector':
			return v
		case 'fn': {
			let params: Value[] | ValueInfVector = _.values(v.params)
			if (v.variadic) {
				params = {kind: 'infVector', items: params}
			}
			return {
				kind: 'fnType',
				params,
				out: v.out,
			}
		}
		case 'hashMap':
			return Any
		case 'object':
			return Any
	}
}

function assertExpType(exp: Exp): Value {
	switch (exp.ast) {
		case 'value':
			return assertValueType(exp.value)
		case 'symbol': {
			const inspected = resolveSymbol(exp).result
			if (inspected.semantic == 'ref') {
				return assertExpType(inspected.ref)
			} else if (inspected.semantic === 'param') {
				return assertExpType(inspected.type)
			}
			return Unit
		}
		case 'fn': {
			const paramsAst = exp.variadic ? 'infVector' : 'vector'
			const paramsItems: Exp[] | ExpInfVector = _.values(exp.params)
			const paramsExp: Exp = {ast: paramsAst, items: paramsItems}

			const params = assertExpType(paramsExp) as ValueFnType['params']
			const out = assertExpType(exp.body)

			return createFnType(params, out)
		}
		case 'list': {
			const fn = assertExpType(exp.fn)
			return isKindOf(fn, 'fnType') ? fn.out : fn
		}
		case 'vector':
			return exp.items.map(assertExpType)
		case 'infVector':
			return createInfVector(...exp.items.map(assertExpType))
		case 'hashMap':
			return TypeHashMap
		case 'scope':
			return exp.out ? assertExpType(exp) : Unit
	}
}

function getParamType(fn: ValueFn): ValueFnType['params'] {
	const params = _.values(fn.params)
	return fn.variadic ? {kind: 'infVector', items: params} : params
}

export function evalExp(exp: Exp, env?: Record<string, Exp>): WithLogs<Value> {
	const _eval = (e: Exp) => evalExp(e, env)

	switch (exp.ast) {
		case 'value':
			return withLog(exp.value, [])
		case 'symbol':
			return evalSymbol(exp)
		case 'fn':
			return evalFn(exp)
		case 'list':
			return evalList(exp)
		case 'vector':
			return evalVector(exp)
		case 'infVector':
			return evalInfVector(exp)
		case 'hashMap':
			return evalHashMap(exp)
		case 'scope':
			return exp.out ? _eval(exp.out) : withLog(Unit)
	}

	function evalSymbol(exp: ExpSymbol): WithLogs<Value> {
		const {result, logs} = resolveSymbol(exp)
		if (result.semantic === 'ref') {
			return _eval(result.ref)
		} else if (result.semantic === 'param') {
			if (env) {
				if (!(exp.name in env)) {
					throw new Error('Cannot evaluated the parameter symbol')
				}
				return _eval(env[exp.name])
			} else {
				const {result: type, logs} = _eval(result.type)
				return withLog(castType(type, Unit), logs)
			}
		} else {
			return withLog(Unit, logs)
		}
	}

	function evalFn(exp: ExpFn): WithLogs<Value> {
		const paramsResult = _.mapValues(exp.params, _eval)
		const paramsLog = _.values(paramsResult).flatMap(r => r.logs)
		const params = _.mapValues(paramsResult, r => r.result)

		const clonedBody = cloneExp(exp.body)
		clonedBody.parent = exp

		const body: ValueFn['body'] = function (...params) {
			const env = _.fromPairs(_$.zipShorter(_.keys(exp.params), params))
			return evalExp(clonedBody, env).result
		}

		const fn: ValueFn = {
			kind: 'fn',
			params,
			out: TypeNumber,
			variadic: exp.variadic,
			body,
			expBody: exp.body,
		}

		return withLog(fn, paramsLog)
	}

	function evalList(exp: ExpList): WithLogs<Value> {
		const {result: fn, logs: fnLogs} = _eval(exp.fn)

		if (!isKindOf(fn, 'fn')) {
			return _eval(exp.fn)
		}

		const paramsType = getParamType(fn)

		const {result: params, logs: castLogs} = castExpParam(
			paramsType,
			exp.params
		)

		const paramsLogs: Log[] = []
		const execLogs: Log[] = []

		const context: ValueFnThis = {
			log(log) {
				execLogs.push(log)
			},
			eval(e) {
				const {result, logs} = _eval(e)
				paramsLogs.push(...logs)
				return result as any
			},
		}

		const evaluated = fn.body.call(context, ...params)
		const logs = [...fnLogs, ...castLogs, ...paramsLogs, ...execLogs]

		return withLog(evaluated, logs)
	}

	function evalVector(exp: ExpVector): WithLogs<Value[]> {
		const evaluated = exp.items.map(_eval)
		return withLog(
			evaluated.map(e => e.result),
			evaluated.flatMap(e => e.logs)
		)
	}

	function evalInfVector(exp: ExpInfVector): WithLogs<ValueInfVector> {
		const result = exp.items.map(_eval)
		const evaluated = createInfVector(...result.map(e => e.result))
		const logs = result.flatMap(e => e.logs)
		return withLog(evaluated, logs)
	}

	function evalHashMap(exp: ExpHashMap): WithLogs<ValueHashMap> {
		const result = _.mapValues(exp.items, _eval)
		const evaluated = createHashMap(_.mapValues(result, e => e.result))
		const logs = _.values(result).flatMap(e => e.logs)
		return withLog(evaluated, logs)
	}
}

function isKindOf(x: Value, kind: 'any'): x is ValueAny
function isKindOf(x: Value, kind: 'unit'): x is ValueUnit
function isKindOf(x: Value, kind: 'fn'): x is ValueFn
function isKindOf(x: Value, kind: 'fnType'): x is ValueFnType
function isKindOf(x: Value, kind: 'hashMap'): x is ValueHashMap
function isKindOf(x: Value, kind: 'union'): x is ValueUnion
function isKindOf(x: Value, kind: 'valueType'): x is ValueValueType
function isKindOf(x: Value, kind: 'infVector'): x is ValueInfVector
function isKindOf(x: Value, kind: 'singleton'): x is ValueCustomSingleton
function isKindOf<
	T extends Exclude<Value, null | boolean | number | string | any[]>
>(x: Value, kind: T['kind']): x is T {
	return _.isObject(x) && !_.isArray(x) && x.kind === kind
}

function cloneExp(exp: Exp): Exp {
	switch (exp.ast) {
		case 'value':
			return {ast: 'value', value: exp.value}
		case 'symbol':
			return {ast: 'symbol', name: exp.name}
		case 'fn':
			throw new Error('Not yet implemented')
		case 'list': {
			const fn = cloneExp(exp.fn)
			const params = exp.params.map(cloneExp)
			return createExpList(fn, params)
		}
		default:
			throw new Error('Not yet implemented')
	}
}

export function isSubtypeOf(a: Value, b: Value) {
	return compareType(a, b, false)
}
export function isInstanceOf(a: Value, b: Value) {
	return compareType(a, b, true)
}

function compareType(a: Value, b: Value, onlyInstance: boolean): boolean {
	const compare = (a: Value, b: Value) => compareType(a, b, onlyInstance)

	if (!_.isObject(b)) return a === b
	if (_.isArray(b)) return vector(a, b)

	switch (b.kind) {
		case 'any':
			return true
		case 'unit':
			return isKindOf(a, 'unit')
		case 'valueType':
			return valueType(a, b)
		case 'infVector':
			return infVector(a, b)
		case 'union':
			return union(a, b)
		case 'fnType':
			return fnType(a, b)
		case 'fn':
		case 'singleton':
			return a === b
		default:
			throw new Error('Not yet implemented')
	}

	// Predicates for each types
	function vector(a: Value, b: Value[]) {
		if (!_.isArray(a) || a.length < b.length) return false
		return _$.everyByPair(a, b, compare)
	}

	function infVector(a: Value, b: ValueInfVector) {
		let aItems: {inf: boolean; value: Value}[]

		if (_.isArray(a)) {
			aItems = a.map(value => ({inf: false, value}))
		} else if (isKindOf(a, 'infVector')) {
			const aLen = a.items.length
			aItems = a.items.slice(0, aLen - 1).map(value => ({inf: false, value}))
			aItems.push({inf: true, value: a.items[aLen - 1]})
		} else {
			return false
		}

		const bLen = b.items.length
		const bItems = b.items
			.slice(0, bLen - 1)
			.map(value => ({inf: false, value}))
		bItems.push({inf: true, value: b.items[bLen - 1]})

		let ai = 0,
			bi = 0
		while (ai < aItems.length) {
			if (bItems.length <= bi) return false

			const a = aItems[ai]
			const b = bItems[bi]

			if (!compare(a.value, b.value)) return false

			if (a.inf === b.inf) {
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

	function union(a: Value, b: ValueUnion) {
		const aTypes: Value[] = isKindOf(a, 'union') ? a.items : [a]
		const bTypes = b.items
		return aTypes.every(at => bTypes.some(bt => compare(at, bt)))
	}

	function valueType(a: Value, b: ValueValueType) {
		if (onlyInstance) {
			return b.predicate(a)
		} else {
			return b.predicate(a) || (isKindOf(a, 'valueType') && a.id === b.id)
		}
	}

	function fnType(a: Value, b: ValueFnType) {
		const _a = normalizeToFn(a)
		return isSubtypeOf(_a.params, b.params) && isSubtypeOf(_a.out, b.out)

		function normalizeToFn(a: Value): Omit<ValueFnType, 'kind'> {
			if (isKindOf(a, 'fn')) {
				const params = getParamType(a)
				return {params, out: a.out}
			} else {
				return {params: [], out: a}
			}
		}
	}
}

function castType(type: Value, value: Value): Value {
	if (!_.isObject(type)) {
		return type
	}

	if (_.isArray(type)) {
		const values = _.isArray(value) ? value : []
		return type.map((t, i) =>
			castType(t, values[i] !== undefined ? values[i] : Unit)
		)
	}

	switch (type.kind) {
		case 'valueType':
			return isInstanceOf(value, type) ? value : type.cast(value)
		case 'fnType':
			return castType(type.out, Unit)
		case 'union':
			return type.cast
				? isInstanceOf(value, type)
					? value
					: type.cast(value)
				: castType(type.items[0], Unit)
		case 'singleton':
			return type
		default:
			throw new Error('Not yet implemented')
	}
}

function castExpParam(
	to: Value[] | ValueInfVector,
	from: Exp[]
): WithLogs<Exp[]> {
	const logs: Log[] = []

	if (_.isArray(to)) {
		if (to.length > from.length) {
			logs.push({level: 'error', reason: 'Too short aguments'})
		}
	} else {
		const minLength = to.items.length - 1
		if (from.length < minLength) {
			logs.push({level: 'error', reason: 'Too short arguments'})

			from = [...from]
			while (from.length < minLength) {
				from.push(wrapValue(castType(to.items[from.length], null)))
			}
		}

		const variadicCount = from.length - minLength
		to = [
			...to.items.slice(0, minLength),
			..._.times(variadicCount, _.constant(to.items[minLength])),
		]
	}

	const casted: Exp[] = []

	for (let i = 0; i < to.length; i++) {
		const toType = to[i]
		const fromItem: Exp = from[i] || {ast: 'value', value: Unit}

		const fromType = assertExpType(fromItem)

		if (isSubtypeOf(fromType, toType)) {
			casted.push(fromItem)
		} else {
			const fromStr = printValue(fromType)
			const toStr = printValue(toType)

			if (!isKindOf(fromType, 'unit')) {
				logs.push({
					level: 'error',
					reason: `Type ${fromStr} cannot be casted to ${toStr}`,
				})
			}
			casted.push(
				createExpList(castTypeFn, [wrapValue(toType), fromItem], false)
			)
		}
	}

	return withLog(casted, logs)
}

export function printExp(exp: Exp): string {
	switch (exp.ast) {
		case 'value':
			return printValue(exp.value)
		case 'symbol':
			return exp.name
		case 'fn': {
			const params = _.entries(exp.params).map(
				([name, type]) => name + ':' + printExp(type)
			)
			const body = printExp(exp.body)
			const variadic = exp.variadic ? '...' : ''
			return `(=> [${params.join(' ')}${variadic}] ${body})`
		}
		case 'list': {
			const fn = printExp(exp.fn)
			const params = exp.params.map(printExp)
			return `(${fn} ${params.join(' ')})`
		}
		case 'vector':
			return '[' + exp.items.map(printExp).join(' ') + ']'
		case 'infVector':
			return '[' + exp.items.map(printExp).join(' ') + '...]'
		case 'hashMap': {
			const entries = _.entries(exp.items)
			const pairs = entries.map(([k, v]) => `${k}: ${printExp(v)}`)
			return '{' + pairs.join(' ') + '}'
		}
		case 'scope': {
			const entries = _.entries(exp.scope)
			const pairs = entries.map(([k, v]) => `${k} = ${printExp(v)}`)
			const out = exp.out ? printExp(exp.out) : ''
			return `{${pairs.join(' ')} ${out}}`
		}
	}
}

function retrieveValueName(
	s: ValueUnion | ValueCustomSingleton | ValueValueType,
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

	const symInspected = resolveSymbol(sym).result

	if (symInspected.semantic !== 'ref' || symInspected.ref !== origExp) {
		return
	}

	return name
}

export function printValue(val: Value, baseExp: Exp = GlobalScope): string {
	if (!_.isObject(val)) {
		return JSON.stringify(val)
	}

	if (_.isArray(val)) {
		return '[' + val.map(v => printValue(v, baseExp)).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return '*'
		case 'unit':
			return '_'
		case 'valueType':
			return retrieveValueName(val, baseExp) ?? `<valueType>`
		case 'infVector': {
			const items = val.items.map(v => printValue(v, baseExp))
			return '[' + items.join(' ') + '...]'
		}
		case 'union': {
			const name = retrieveValueName(val, baseExp)
			if (name) return name
			return '(| ' + val.items.map(v => printValue(v, baseExp)).join(' ') + ')'
		}
		case 'singleton':
			return retrieveValueName(val, baseExp) ?? '<singleton>'
		case 'fnType':
			return '(-> ' + printValue(val.params) + ' ' + printValue(val.out) + ')'
		case 'fn': {
			const params = _.entries(val.params).map(
				([name, type]) => name + ':' + printValue(type)
			)
			const body = val.expBody ? printExp(val.expBody) : '<JS Function>'
			const variadic = val.variadic ? '...' : ''
			return `(=> [${params.join(' ')}${variadic}] ${body})`
		}
		case 'hashMap': {
			const entries = _.entries(val.value)
			const pairs = entries.map(([k, v]) => `${k}: ${printValue(v)}`)
			return '{' + pairs.join(' ') + '}'
		}
		case 'object':
			return `<object of ${printValue(val.type, baseExp)}>`
	}
}

runTest()
