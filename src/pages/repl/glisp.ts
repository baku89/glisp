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
	| ValueSpread
	| ValueSingleton
	| ValueValueType
	| ValueFnType
	| ValueUnion
	| ValueSpread
	| ValueDict
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

interface ValueSpread<T extends Value = Value> {
	kind: 'spread'
	items: {inf: boolean; value: T}[]
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
	params: ValueSpread
	out: Value
}

interface ValueFnThis {
	log: (log: Log) => void
	eval: <R extends Value = Value>(exp: Exp) => R
}

interface ValueFn {
	kind: 'fn'
	params: Record<string, {inf: boolean; value: Value}>
	out: Value
	body: (this: ValueFnThis, ...arg0: Exp[]) => Value
	expBody?: Exp
}

interface ValueDict {
	kind: 'dict'
	value: {
		[key: string]: Value
	}
	rest?: Value
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
	| ExpSpread
	| ExpDict
	| ExpCast
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
	params: Record<string, {inf: boolean; value: Exp}>
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

interface ExpSpread extends ExpBase {
	ast: 'spread'
	items: {inf: boolean; value: Exp}[]
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
	if (isKindOf('singleton', value) || isKindOf('valueType', value)) {
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
	cast: v => !!v,
}
const ExpTypeBoolean = wrapValue(TypeBoolean)
TypeBoolean.origExp = ExpTypeBoolean
const TypeNumber = createValueType('number', _.isNumber, () => 0)
const TypeString = createValueType('string', _.isString, () => '')
export const TypeIO = createValueType('IO', _.isFunction, () => null)
const TypeFnType = createValueType(
	'fnType',
	v => isKindOf('fnType', v),
	() => ({
		kind: 'fnType',
		params: createVariadicVector(Any),
		out: Any,
	})
)
const TypeDict = createValueType(
	'dict',
	v => isKindOf('dict', v),
	() => createDict({})
)

const OrderingLT: ValueSingleton = {kind: 'singleton'}
const OrderingEQ: ValueSingleton = {kind: 'singleton'}
const OrderingGT: ValueSingleton = {kind: 'singleton'}

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
					value: createValueType(TypeNumber, TypeNumber.predicate, () => 1),
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
			params: {x: {inf: false, value: TypeBoolean}},
			out: TypeBoolean,
			body(x) {
				return !this.eval(x)
			},
		}),
		'->': wrapValue({
			kind: 'fn',
			params: {
				params: {inf: false, value: createVariadicVector(Any)},
				out: {inf: false, value: Any},
			},
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
			params: {xs: {inf: false, value: Any}},
			out: Any,
			body(xs) {
				return uniteType(this.eval<Value[]>(xs))
			},
		}),
		range: wrapValue({
			kind: 'fn',
			params: {
				start: {inf: false, value: TypeNumber},
				end: {inf: false, value: TypeNumber},
				step: {inf: false, value: TypeNumber},
			},
			out: createVariadicVector(TypeNumber),
			body(start, end, step) {
				const _start = this.eval<number>(start)
				const _end = this.eval<number>(end)
				const _step = this.eval<number>(step)
				return _.range(_start, _end, _step)
			},
		}),
		def: wrapValue({
			kind: 'fn',
			params: {
				name: {inf: false, value: TypeString},
				value: {inf: false, value: Any},
			},
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
			params: {x: {inf: false, value: Any}},
			out: Any,
			body(x) {
				return assertExpType(wrapValue(this.eval(x)))
			},
		}),
		instanceof: wrapValue({
			kind: 'fn',
			params: {value: {inf: false, value: Any}, type: {inf: false, value: Any}},
			out: TypeBoolean,
			body(value, type) {
				return isInstanceOf(this.eval(value), this.eval(type))
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

export interface WithLog<T> {
	result: T
	log: Log[]
}

function uniteType(
	types: Value[],
	cast?: NonNullable<ValueUnion['cast']>
): Value {
	const items: (Exclude<Value, ValueUnion> | undefined)[] = types.flatMap(t =>
		isKindOf('union', t) ? t.items : [t]
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

	return uniqItems.length >= 2
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
			return isKindOf('any', b)
		case 'unit':
			return isKindOf('unit', b)
		case 'singleton':
		case 'fn':
			return a === b
		case 'valueType':
			return isKindOf('valueType', b) && a.id === b.id
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
		case 'spread':
			return (
				isKindOf('spread', b) &&
				a.items.length === b.items.length &&
				_$.everyByPair(
					a.items,
					b.items,
					(ai, bi) => ai.inf === bi.inf && equalsValue(ai.value, bi.value)
				)
			)
		case 'object':
			return false
	}
}

function withLog<T>(result: T, log: Log[] = []) {
	return {result, log}
}

function mapWithLog<A, R>(arr: A[], map: (a: A) => WithLog<R>): WithLog<R[]> {
	const mapped = arr.map(map)
	const result = mapped.map(r => r.result)
	const log = mapped.flatMap(r => r.log)
	return {result, log}
}

function mapValueWithLog<R, T>(
	dict: Record<string, R>,
	map: (a: R) => WithLog<T>
): WithLog<Record<string, T>> {
	const mapped = _.mapValues(dict, map)
	const result = _.mapValues(mapped, m => m.result)
	const log = _.values(mapped).flatMap(m => m.log)

	return {result, log}
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
			const type = param.inf
				? ({
						ast: 'spread',
						items: [{inf: true, value: param.value}],
				  } as ExpSpread)
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
		case 'spread':
			return v
		case 'fn': {
			return {
				kind: 'fnType',
				params: getParamType(v),
				out: v.out,
			}
		}
		case 'dict':
			return Any
		case 'object':
			return v.type
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
			const paramsExp: ExpSpread = {
				ast: 'spread',
				items: _.values(exp.params),
			}
			const params = assertExpType(paramsExp) as ValueFnType['params']
			const out = assertExpType(exp.body)
			return createFnType(params, out)
		}
		case 'list': {
			const fn = assertExpType(exp.fn)
			return isKindOf('fnType', fn) ? fn.out : fn
		}
		case 'vector':
			return exp.items.map(assertExpType)
		case 'spread': {
			const items = exp.items.map(({inf, value}) => ({
				inf,
				value: assertExpType(value),
			}))
			return createSpread(items)
		}
		case 'dict':
			return TypeDict
		case 'cast':
			return assertExpType(exp.type)
		case 'scope':
			return exp.out ? assertExpType(exp) : Unit
	}
}

function assertExpParamsType(exp: Exp): Value[] | ValueSpread {
	const type = assertExpType(exp)
	if (!isKindOf('fnType', type)) {
		return []
	} else {
		return type.params
	}
}

function getParamType(fn: ValueFn): ValueFnType['params'] {
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
		case 'list':
			return evalList(exp)
		case 'vector':
			return mapWithLog(exp.items, _eval)
		case 'spread':
			return evalSpread(exp)
		case 'dict':
			return evalDict(exp)
		case 'cast':
			return evalCast(exp)
		case 'scope':
			return exp.out ? _eval(exp.out) : withLog(Unit)
	}

	function evalSymbol(exp: ExpSymbol): WithLog<Value> {
		const {result, log} = resolveSymbol(exp)
		if (result.semantic === 'ref') {
			return _eval(result.ref)
		} else if (result.semantic === 'param') {
			if (env) {
				if (!(exp.name in env)) {
					throw new Error('Cannot evaluated the parameter symbol')
				}
				return _eval(env[exp.name])
			} else {
				const {result: type, log} = _eval(result.type)
				return withLog(getDefault(type), log)
			}
		} else {
			return withLog(Unit, log)
		}
	}

	function evalFn(exp: ExpFn): WithLog<Value> {
		const {result: params, log: paramsLog} = mapValueWithLog(exp.params, p => {
			const {result, log} = _eval(p.value)
			return withLog({inf: p.inf, value: result}, log)
		})

		const {result: pdg, log: bodyLog} = createDependencyGraph(exp.body)
		pdg.parent = exp

		const body: ValueFn['body'] = function (...xs) {
			const env = _.fromPairs(_$.zipShorter(_.keys(exp.params), xs))
			return evalExp(pdg, env).result
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

	function evalList(exp: ExpList): WithLog<Value> {
		const {result: fn, log: fnLog} = _eval(exp.fn)

		if (!isKindOf('fn', fn)) {
			return _eval(exp.fn)
		}

		const paramsType = getParamType(fn)

		const {result: params, log: castLog} = assignParam(paramsType, exp.params)

		const paramsLog: Log[] = []
		const execLog: Log[] = []

		const context: ValueFnThis = {
			log(log) {
				execLog.push(log)
			},
			eval(e) {
				const {result, log} = _eval(e)
				paramsLog.push(...log)
				return result as any
			},
		}

		const evaluated = fn.body.call(context, ...params)
		const log = [...fnLog, ...castLog, ...paramsLog, ...execLog]

		return withLog(evaluated, log)
	}

	function evalSpread(exp: ExpSpread): WithLog<ValueSpread> {
		const {result: items, log} = mapWithLog(exp.items, p => {
			const {result, log} = _eval(p.value)
			return withLog({inf: p.inf, value: result}, log)
		})
		const evaluated = createSpread(items)
		return withLog(evaluated, log)
	}

	function evalDict(exp: ExpDict): WithLog<ValueDict> {
		const {result: items, log: itemsLog} = mapValueWithLog(exp.items, _eval)
		const restResult = exp.rest && _eval(exp.rest)
		let rest: Value | undefined = undefined,
			restLog: Log[] = []

		if (restResult) {
			rest = restResult.result
			restLog = restResult.log
		}

		const evaluated = createDict(items, rest)
		return withLog(evaluated, [...itemsLog, ...restLog])
	}

	function evalCast(exp: ExpCast) {
		const {result: value, log: valueLog} = _eval(exp.value)
		const {result: type, log: typeLog} = _eval(exp.type)

		const evaluated = castType(type, value)
		return withLog(evaluated, [...valueLog, ...typeLog])
	}
}

function isKindOf(kind: 'any', x: Value): x is ValueAny
function isKindOf(kind: 'unit', x: Value): x is ValueUnit
function isKindOf(kind: 'fn', x: Value): x is ValueFn
function isKindOf(kind: 'fnType', x: Value): x is ValueFnType
function isKindOf(kind: 'dict', x: Value): x is ValueDict
function isKindOf(kind: 'union', x: Value): x is ValueUnion
function isKindOf(kind: 'valueType', x: Value): x is ValueValueType
function isKindOf(kind: 'spread', x: Value): x is ValueSpread
function isKindOf(kind: 'singleton', x: Value): x is ValueCustomSingleton
function isKindOf<
	T extends Exclude<Value, null | boolean | number | string | any[]>
>(kind: T['kind'], x: Value): x is T {
	return _.isObject(x) && !_.isArray(x) && x.kind === kind
}

function createDependencyGraph(exp: Exp): WithLog<Exp> {
	switch (exp.ast) {
		case 'value':
			return withLog(exp)
		case 'symbol':
			return createSymbol(exp)
		case 'fn':
			throw new Error('Not yet implemented')
		case 'list':
			return createList(exp)
		case 'vector':
			return createVector(exp)
		case 'scope':
			return createDependencyGraph(exp.out ?? wrapValue(Unit))
		default:
			throw new Error('Not yet implemented')
	}

	function createSymbol(exp: ExpSymbol) {
		const {result, log} = resolveSymbol(exp)
		if (result.semantic === 'ref') {
			return withLog(result.ref)
		} else if (result.semantic === 'param') {
			return withLog(exp)
		} else {
			return withLog(wrapValue(Unit), log)
		}
	}

	function createList(exp: ExpList) {
		const {result: fn, log: fnLog} = createDependencyGraph(exp.fn)
		const {result: params, log: paramsLog} = mapWithLog(
			exp.params,
			createDependencyGraph
		)

		const paramsType = params.map(assertExpType)
		const fnParamsType = assertExpParamsType(fn)

		const typeAssertLog: Log[] = []
		if (!isSubtypeOf(paramsType, fnParamsType)) {
			const paramsStr = printValue(paramsType)
			const fnParamsStr = printValue(fnParamsType)

			typeAssertLog.push({
				level: 'error',
				reason: `Type ${paramsStr} cannot be casted to ${fnParamsStr}`,
			})
		}

		const ret = createExpList(fn, params, false)
		const logs = [...fnLog, ...paramsLog, ...typeAssertLog]
		return withLog(ret, logs)
	}

	function createVector(exp: ExpVector) {
		const {result: items, log} = mapWithLog(exp.items, createDependencyGraph)
		const ret: ExpVector = {ast: 'vector', items}
		return withLog(ret, log)
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
	if (_.isArray(b)) return compareVector(a, b)

	switch (b.kind) {
		case 'any':
			return true
		case 'unit':
			return isKindOf('unit', a)
		case 'valueType':
			return compareValueType(a, b)
		case 'spread':
			return compareSpread(a, b)
		case 'union':
			return compareUnion(a, b)
		case 'fnType':
			return compareFnType(a, b)
		case 'fn':
		case 'singleton':
			return a === b
		case 'dict':
			return compareDict(a, b)
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

	function compareUnion(a: Value, b: ValueUnion) {
		const aTypes: Value[] = isKindOf('union', a) ? a.items : [a]
		const bTypes = b.items
		return aTypes.every(at => bTypes.some(bt => compare(at, bt)))
	}

	function compareValueType(a: Value, b: ValueValueType) {
		if (onlyInstance) {
			return b.predicate(a)
		} else {
			return b.predicate(a) || (isKindOf('valueType', a) && a.id === b.id)
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
		if (b.rest) {
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
		case 'valueType':
			return isInstanceOf(value, type) ? value : type.cast(value)
		case 'fnType':
			return getDefault(type.out)
		case 'union':
			return type.cast
				? isInstanceOf(value, type)
					? value
					: type.cast(value)
				: getDefault(type.items[0])
		case 'singleton':
			return type
		default:
			throw new Error('Not yet implemented')
	}
}

function assignParam(to: ValueSpread, from: Exp[]): WithLog<Exp[]> {
	const log: Log[] = []

	const casted: Exp[] = []

	let isParamShort = false

	let i = 0
	for (let j = 0; j < to.items.length; j++) {
		const toType = to.items[j]
		if (!toType.inf) {
			isParamShort = from.length <= i
			const fromItem = isParamShort ? wrapValue(Unit) : from[i]
			const {result, log: assignLog} = assign(fromItem, toType.value)
			log.push(...assignLog)
			casted.push(result)
			i += 1
		} else {
			// inf
			const nextToType = j < to.items.length - 1 ? to.items[j + 1] : null

			const restCasted: Exp[] = []

			for (; i < from.length; i++) {
				const fromItem = from[i]
				const fromType = assertExpType(fromItem)
				if (nextToType && isSubtypeOf(fromType, nextToType.value)) {
					break
				}

				const {result, log: assignLog} = assign(fromItem, toType.value)
				log.push(...assignLog)
				restCasted.push(result)
			}

			casted.push({ast: 'vector', items: restCasted})
		}
	}

	return withLog(casted, log)

	function assign(from: Exp, to: Value): WithLog<Exp> {
		const fromType = assertExpType(from)

		if (isSubtypeOf(fromType, to)) {
			return withLog(from)
		} else {
			const cast = createExpCast(from, wrapValue(to), false)
			const log: Log[] = []

			if (!isKindOf('unit', fromType)) {
				const fromStr = printExp(from)
				const toStr = printValue(to)
				log.push({
					level: 'error',
					reason: `Type ${fromStr} cannot be casted to ${toStr}`,
				})
			}
			return withLog(cast, log)
		}
	}
}

export function printExp(exp: Exp): string {
	switch (exp.ast) {
		case 'value':
			return printValue(exp.value)
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
		case 'list': {
			const fn = printExp(exp.fn)
			const params = exp.params.map(printExp)
			return `(${fn} ${params.join(' ')})`
		}
		case 'vector':
			return '[' + exp.items.map(printExp).join(' ') + ']'
		case 'spread': {
			const items = exp.items.map(i => (i.inf ? '...' : '') + printExp(i.value))
			return `[${items.join(' ')}]`
		}
		case 'dict': {
			const entries = _.entries(exp.items)
			const pairs = entries.map(([k, v]) => `${k}: ${printExp(v)}`)
			const rest = exp.rest ? ['...' + printExp(exp.rest)] : []
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
	const print = (v: Value) => printValue(v, baseExp)

	if (!_.isObject(val)) {
		return JSON.stringify(val)
	}

	if (_.isArray(val)) {
		return '[' + val.map(print).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return '*'
		case 'unit':
			return '_'
		case 'valueType':
			return retrieveValueName(val, baseExp) ?? `<valueType>`
		case 'spread': {
			const items = val.items.map(
				i => (i.inf ? '...' : '') + printValue(i.value)
			)
			return `[${items.join(' ')}]`
		}
		case 'union': {
			const name = retrieveValueName(val, baseExp)
			if (name) return name
			return '(| ' + val.items.map(print).join(' ') + ')'
		}
		case 'singleton':
			return retrieveValueName(val, baseExp) ?? '<singleton>'
		case 'fnType':
			return '(-> ' + print(val.params) + ' ' + print(val.out) + ')'
		case 'fn': {
			const params = _.entries(val.params).map(
				([name, {inf, value}]) =>
					`${inf ? '...' : ''}${name}:${printValue(value)}`
			)
			const body = val.expBody ? printExp(val.expBody) : '<JS Function>'
			return `(=> [${params.join(' ')}] ${body})`
		}
		case 'dict': {
			const entries = _.entries(val.value)
			const pairs = entries.map(([k, v]) => `${k}: ${print(v)}`)
			const rest = val.rest ? ['...' + printValue(val.rest)] : []
			const lines = [...pairs, ...rest]
			return '{' + lines.join(' ') + '}'
		}
		case 'object':
			return `<object of ${print(val.type)}>`
	}
}

runTest()
