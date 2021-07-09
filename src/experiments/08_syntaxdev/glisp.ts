import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Value =
	| ValueAny
	| ValueUnit
	| Value[]
	| ValueInfVector
	| ValueSingleton
	| ValueValType
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

interface ValueValType {
	kind: 'valType'
	id: symbol
	origExp?: Exp
	cast: (value: Value) => Value
}

interface ValueUnion {
	kind: 'union'
	items: Exclude<Value, ValueUnion>[]
	cast?: (value: Value) => Value
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
	variadic?: true
	body: <A extends Exp[], R extends Value>(this: ValueFnThis, ...arg0: A) => R
}

interface ValueHashMap {
	kind: 'hashMap'
	value: {
		[key: string]: Value
	}
}

interface ValueObject {
	kind: 'object'
	type: ValueValType
	value: any
}

type Exp =
	| ExpValue
	| ExpSymbol
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

interface ExpList extends ExpBase {
	ast: 'list'
	items: Exp[]
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

type InspectedResult =
	| {semantic: 'raw'}
	| InspectedResultSymbol
	| InspectedResultList
	| InspectedResultVector
	| InspectedResultHashMap
	| InspectedResultScope

type InspectedResultSymbol =
	| {semantic: 'ref'; ref: Exp}
	| {semantic: 'capture'}
	| {semantic: 'undefined'}

type InspectedResultList =
	| {semantic: 'application'; fn: Exp; params: Exp[]}
	| {semantic: 'fndef'; params: Record<string, Exp>; body: Exp}
	| {semantic: 'null'}

type InspectedResultScope = {
	semantic: 'scope'
}

type InspectedResultVector = {semantic: 'vector'}

type InspectedResultHashMap = {
	semantic: 'hashMap'
}

export function readStr(str: string): Exp {
	const exp = parser.parse(str) as Exp | undefined

	if (exp === undefined) {
		return createExpValue(null)
	} else {
		// Set global scope as parent
		exp.parent = GlobalScope
		return exp
	}
}

function createExpValue(value: Value): ExpValue {
	const ret: ExpValue = {ast: 'value', value}
	if (isKindOf(value, 'singleton') || isKindOf(value, 'valType')) {
		value.origExp = ret
	}
	return ret
}

function createExpSymbol(name: string): ExpSymbol {
	return {ast: 'symbol', name}
}

function createExpList(items: ExpList['items'], setParent = true): ExpList {
	const ret: ExpList = {ast: 'list', items: [...items]}

	if (setParent) {
		ret.items.forEach(it => (it.parent = ret))
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
): ExpScope {
	const ret: ExpScope = {ast: 'scope', scope, out}

	if (setParent) {
		_.values(scope).forEach(e => (e.parent = ret))
	}

	return ret
}

// Value initializer
function createAny(): ValueAny {
	return {kind: 'any'}
}

function createInfVector<T extends Value = Value>(
	...items: T[]
): ValueInfVector<T> {
	return {
		kind: 'infVector',
		items,
	}
}

function createValType(
	base: ValueValType | string,
	cast: ValueValType['cast']
): ValueValType {
	const id = _.isString(base) ? Symbol(base) : base.id
	const origExp = _.isString(base) ? undefined : base.origExp

	return {
		kind: 'valType',
		id,
		cast,
		origExp,
	}
}

const TypeBoolean = uniteType([false, true], v => !!v)
const TypeNumber = createValType('number', () => 0)
const TypeString = createValType('string', () => '')
const TypeFnType = createValType('fnType', () => null)
export const TypeIO = createValType('IO', () => null)
const TypeHashMap = createValType('hashMap', () => ({
	kind: 'hashMap',
	value: {},
}))

const OrderingLT: ValueSingleton = {kind: 'singleton'}
const OrderingEQ: ValueSingleton = {kind: 'singleton'}
const OrderingGT: ValueSingleton = {kind: 'singleton'}

const castTypeFn = createExpValue({
	kind: 'fn',
	params: {type: createAny(), value: createAny()},
	out: createAny(),
	body: function (this: ValueFnThis, type: Exp, value: Exp) {
		const t = this.eval(type)
		const v = this.eval(value)

		const casted = castType(t, v)

		this.log({
			level: 'info',
			reason: `Value ${printValue(v)} is converted to ${printValue(casted)}`,
		})

		return casted
	} as any,
})

export const GlobalScope = createExpScope({
	scope: {
		Any: createExpValue(createAny()),
		Number: createExpValue(TypeNumber),
		String: createExpValue(TypeString),
		Boolean: createExpValue(TypeBoolean),
		IO: createExpValue(TypeIO),
		LT: createExpValue(OrderingLT),
		EQ: createExpValue(OrderingEQ),
		GT: createExpValue(OrderingGT),
		Ordering: createExpValue({
			kind: 'union',
			items: [OrderingLT, OrderingEQ, OrderingGT],
		}),
		PI: createExpValue(Math.PI),
		'+': createExpValue({
			kind: 'fn',
			params: {xs: TypeNumber},
			out: TypeNumber,
			variadic: true,
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs.map(x => this.eval<number>(x)).reduce((a, b) => a + b, 0)
			} as any,
		}),
		'*': createExpValue({
			kind: 'fn',
			params: {xs: createValType(TypeNumber, () => 1)},
			out: TypeNumber,
			variadic: true,
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs.map(x => this.eval<number>(x)).reduce((a, b) => a * b, 1)
			} as any,
		}),
		and: createExpValue({
			kind: 'fn',
			params: {xs: TypeBoolean},
			out: TypeBoolean,
			variadic: true,
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs.map(x => this.eval<boolean>(x)).reduce((a, b) => a && b, true)
			} as any,
		}),
		or: createExpValue({
			kind: 'fn',
			params: {xs: TypeBoolean},
			out: TypeBoolean,
			variadic: true,
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs
					.map(x => this.eval<boolean>(x))
					.reduce((a, b) => a || b, false)
			} as any,
		}),
		':->': createExpValue({
			kind: 'fn',
			params: {params: createInfVector(createAny()), out: createAny()},
			out: TypeFnType,
			body: function (this: ValueFnThis, params: Exp, out: Exp) {
				return {
					kind: 'fnType',
					params: this.eval(params),
					out: this.eval(out),
				}
			} as any,
		}),
		'|': createExpValue({
			kind: 'fn',
			params: {xs: createAny()},
			out: createAny(),
			variadic: true,
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return uniteType(xs.map(this.eval))
			} as any,
		}),
		def: createExpValue({
			kind: 'fn',
			params: {name: TypeString, value: createAny()},
			out: TypeIO,
			body: function (this: ValueFnThis, name: Exp, value: Exp) {
				const n = this.eval<string>(name)
				const v = this.eval(value)
				return {
					kind: 'object',
					type: TypeIO,
					value: () => {
						GlobalScope.scope[n] = createExpValue(v)
					},
				}
			} as any,
		}),
		type: createExpValue({
			kind: 'fn',
			params: {x: createAny()},
			out: createAny(),
			body: function (this: ValueFnThis, t: Exp) {
				return assertExpType(createExpValue(this.eval(t)))
			} as any,
		}),
		isa: createExpValue({
			kind: 'fn',
			params: {value: createAny(), type: createAny()},
			out: TypeBoolean,
			body: function (this: ValueFnThis, a: Exp, b: Exp) {
				return isInstance(this.eval(a), this.eval(b))
			} as any,
		}),
		'==': createExpValue({
			kind: 'fn',
			params: {xs: createAny()},
			out: TypeBoolean,
			variadic: true,
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				const _xs = xs.map(x => this.eval(x))
				if (_xs.length === 0) {
					return true
				} else {
					const [fst, ...rest] = _xs
					return rest.every(r => equalsValue(fst, r))
				}
			} as any,
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

				if (isInstance(bItem, aItem)) {
					items[b] = undefined
				} else if (isInstance(aItem, bItem)) {
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
	if (isLiteralSingleton(a)) {
		return a === b
	}

	if (_.isArray(a)) {
		return (
			_.isArray(b) &&
			a.length === b.length &&
			_$.zipShorter(a, b).every(_.spread(equalsValue))
		)
	}

	switch (a.kind) {
		case 'any':
			return isKindOf(b, 'any')
		case 'unit':
			return isKindOf(b, 'unit')
		case 'singleton':
		case 'fn':
		case 'valType':
			return a === b
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

function inspectExp(exp: Exp): WithLogs<InspectedResult> {
	switch (exp.ast) {
		case 'symbol':
			return inspectExpSymbol(exp)
		case 'list':
			return inspectExpList(exp)
		case 'vector':
			return inspectExpVector()
		case 'hashMap':
			return inspectExpHashMap()
		case 'scope':
			return withLog({semantic: 'scope', scope: exp.scope, out: exp.out})
		default:
			return withLog({semantic: 'raw'})
	}
}

function inspectExpSymbol(exp: ExpSymbol): WithLogs<InspectedResultSymbol> {
	// Search ancestors
	let parent = exp.parent
	let name = exp.name
	const history = new WeakSet<ExpSymbol>([exp])
	while (parent) {
		// If the parent is a scope containing the symbol
		if (parent.ast === 'scope' && name in parent.scope) {
			const ref: Exp = parent.scope[name]
			if (ref.ast === 'symbol') {
				// If the the reference is an another symbol
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
		}
		parent = parent.parent
	}

	// Not Defined
	return withLog({semantic: 'undefined'}, [
		{level: 'error', reason: `${exp.name} is not defined`},
	])
}

function defineFn(params: ValueFn['params'], body: Exp): ValueFn {
	const out = assertExpType(body)

	const fn: ValueFn['body'] = function () {
		return 1234
	} as any

	return {
		kind: 'fn',
		params,
		out,
		body: fn,
	}
}

function inspectExpList(exp: ExpList): WithLogs<InspectedResultList> {
	if (exp.items.length >= 1) {
		const [fst, ...rest] = exp.items

		if (fst.ast === 'symbol') {
			if (fst.name === '=>') {
				// Function definition
				if (rest.length >= 2) {
					const [params, body] = rest
					if (params.ast === 'hashMap') {
						return withLog({
							semantic: 'fndef',
							params: params.items,
							body,
						})
					}
				}
				return withLog({semantic: 'null'}, [
					{level: 'warn', reason: 'Invalid fndef form'},
				])
			}
		}

		return withLog({semantic: 'application', fn: fst, params: rest})
	}

	return withLog({semantic: 'null'})
}

function inspectExpVector(): WithLogs<InspectedResultVector> {
	return withLog({semantic: 'vector'})
}

function inspectExpHashMap(): WithLogs<InspectedResultHashMap> {
	return withLog({semantic: 'hashMap'})
}

function assertValueType(v: Value): Value {
	if (isLiteralSingleton(v)) {
		return v
	}

	if (_.isArray(v)) {
		return v.map(assertValueType)
	}

	switch (v.kind) {
		case 'any':
		case 'unit':
		case 'singleton':
		case 'valType':
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
			return TypeHashMap
		case 'object':
			return createAny()
	}
}

function assertExpType(exp: Exp): Value {
	switch (exp.ast) {
		case 'value':
			return assertValueType(exp.value)
		case 'symbol': {
			const inspected = inspectExpSymbol(exp).result
			if (inspected.semantic == 'ref') {
				return assertValueType(evalExp(inspected.ref).result)
			}
			return createAny()
		}
		case 'list': {
			const inspected = inspectExpList(exp).result
			if (inspected.semantic === 'application') {
				const fn = evalExp(inspected.fn).result
				return isKindOf(fn, 'fn') ? fn.out : assertExpType(inspected.fn)
			} else if (inspected.semantic === 'fndef') {
				const {params, body} = inspected

				const paramsType = _.values(params)
					.map(evalExp)
					.map(({result}) => result)

				const out = assertExpType(body)
				return {
					kind: 'fnType',
					params: paramsType,
					out,
				}
			} else {
				return null
			}
		}
		case 'vector':
			return exp.items.map(assertExpType)
		case 'infVector':
			return createInfVector(...exp.items.map(assertExpType))
		case 'hashMap':
			return TypeHashMap
		case 'scope':
			return exp.out ? assertExpType(exp) : null
	}
}

function evalExpSymbol(exp: ExpSymbol): WithLogs<Value> {
	const {result: inspected, logs} = inspectExpSymbol(exp)
	switch (inspected.semantic) {
		case 'ref':
			return evalExp(inspected.ref)
		default:
			return withLog(null, logs)
	}
}

function evalExpVector(exp: ExpVector): WithLogs<Value[]> {
	const evaluated = exp.items.map(evalExp)
	return withLog(
		evaluated.map(e => e.result),
		evaluated.flatMap(e => e.logs)
	)
}

function evalExpInfVector(exp: ExpInfVector): WithLogs<ValueInfVector> {
	const evaluated = exp.items.map(evalExp)
	return withLog(
		createInfVector(...evaluated.map(e => e.result)),
		evaluated.flatMap(e => e.logs)
	)
}

function getParamType(fn: ValueFn): ValueFnType['params'] {
	let params: ValueFnType['params'] = Object.values(fn.params)
	if (fn.variadic) {
		params = {kind: 'infVector', items: params}
	}

	return params
}

function evalExpList(exp: ExpList): WithLogs<Value> {
	const {result: inspected, logs: inspectLogs} = inspectExpList(exp)
	if (inspected.semantic === 'application') {
		const {result: fn, logs: fnLogs} = evalExp(inspected.fn)

		if (isKindOf(fn, 'fn')) {
			const {result: params, logs: castLogs} = castExpParam(
				getParamType(fn),
				inspected.params
			)

			const paramsLogs: Log[] = []
			const execLogs: Log[] = []

			const result = fn.body.call(
				{
					log: function (log) {
						execLogs.push(log)
					},
					eval: function (e: Exp) {
						const {result, logs: logs} = evalExp(e)
						paramsLogs.push(...logs)
						return result
					} as any,
				},
				...params
			)
			return withLog(result, [
				...inspectLogs,
				...fnLogs,
				...castLogs,
				...paramsLogs,
				...execLogs,
			])
		}
		return withLog(fn, [...inspectLogs, ...fnLogs])
	} else if (inspected.semantic === 'fndef') {
		return withLog(
			defineFn(
				_.mapValues(inspected.params, e => evalExp(e).result),
				inspected.body
			)
		)
	}
	return withLog(null, inspectLogs)
}

function evalExpHashMap(exp: ExpHashMap): WithLogs<ValueHashMap> {
	console.log('eval hash', exp)
	const evaluated = _.mapValues(exp.items, evalExp)
	return withLog(
		{
			kind: 'hashMap',
			value: _.mapValues(evaluated, e => e.result),
		},
		_.values(evaluated).flatMap(e => e.logs)
	)
}

function evalExpScope(exp: ExpScope): WithLogs<Value> {
	if (exp.out) {
		const {result, logs} = evalExp(exp.out)
		return withLog(result, logs)
	} else {
		return withLog(null, [])
	}
}

export function evalExp(exp: Exp): WithLogs<Value> {
	switch (exp.ast) {
		case 'value':
			return withLog(exp.value, [])
		case 'symbol':
			return evalExpSymbol(exp)
		case 'list':
			return evalExpList(exp)
		case 'vector':
			return evalExpVector(exp)
		case 'infVector':
			return evalExpInfVector(exp)
		case 'hashMap':
			return evalExpHashMap(exp)
		case 'scope':
			return evalExpScope(exp)
	}
}

// Kind predicates
function isLiteralSingleton(x: Value): x is ValueLiteralSingleton {
	return x === null || typeof x !== 'object'
}

function isKindOf(x: Value, kind: 'any'): x is ValueAny
function isKindOf(x: Value, kind: 'unit'): x is ValueUnit
function isKindOf(x: Value, kind: 'fn'): x is ValueFn
function isKindOf(x: Value, kind: 'fnType'): x is ValueFnType
function isKindOf(x: Value, kind: 'hashMap'): x is ValueHashMap
function isKindOf(x: Value, kind: 'union'): x is ValueUnion
function isKindOf(x: Value, kind: 'valType'): x is ValueValType
function isKindOf(x: Value, kind: 'infVector'): x is ValueInfVector
function isKindOf(x: Value, kind: 'singleton'): x is ValueCustomSingleton
function isKindOf<
	T extends Exclude<Value, null | boolean | number | string | any[]>
>(x: Value, kind: T['kind']): x is T {
	return x instanceof Object && !_.isArray(x) && x.kind === kind
}

function isInstance(a: Value, b: Value): boolean {
	if (a === b) {
		return true
	}

	if (isKindOf(b, 'any')) {
		return true
	}

	if (isKindOf(a, 'any')) {
		return false
	}

	if (isKindOf(a, 'valType')) {
		return isKindOf(b, 'valType') && a.id === b.id
	}

	// Handling Vector/VariadicVector

	if (isKindOf(b, 'infVector')) {
		if (isKindOf(a, 'infVector')) {
			const alen = a.items.length,
				blen = b.items.length
			if (alen < blen) {
				return false
			}
			const bitems = [
				...b.items,
				..._.times(alen - blen, _.constant(b.items[blen - 1])),
			]
			return _$.zipShorter(a.items, bitems).every(_.spread(isInstance))
		} else if (_.isArray(a)) {
			const minLength = b.items.length - 1
			if (a.length < minLength) {
				return false
			}
			const restCount = a.length - minLength
			const bLast = b.items[b.items.length - 1]
			const bv = [
				...b.items.slice(0, minLength),
				..._.times(restCount, _.constant(bLast)),
			]
			return isInstance(a, bv)
		}
		return false
	}

	if (_.isArray(b)) {
		if (_.isArray(a)) {
			if (a.length < b.length) {
				return false
			}
			return _$.zipShorter(a, b).every(([a, b]) => isInstance(a, b))
		}
		return false
	}

	if (_.isArray(a)) {
		return false
	}

	// Handle for union type
	if (isKindOf(b, 'union')) {
		const aTypes: Value[] = isKindOf(a, 'union') ? a.items : [a]
		const bTypes = b.items
		return aTypes.every(at => bTypes.some(bt => isInstance(at, bt)))
	}

	if (isKindOf(a, 'union')) {
		return false
	}

	// Handle for literals / value
	if (_.isNumber(a)) {
		return isKindOf(b, 'valType') && b.id === TypeNumber.id
	}
	if (_.isString(a)) {
		return isKindOf(b, 'valType') && b.id === TypeString.id
	}

	if (isKindOf(a, 'fn')) {
		return a === b || isInstance(assertValueType(a), b)
	}

	if (_.isNumber(b) || _.isString(b) || isKindOf(b, 'fn')) {
		return false
	}

	// Either is singleton
	if (
		a === null ||
		b === null ||
		_.isBoolean(a) ||
		_.isBoolean(b) ||
		a.kind === 'singleton' ||
		b.kind === 'singleton'
	) {
		return false
	}

	// Either is fnType
	const na = normalizeTypeToFn(a)
	const nb = normalizeTypeToFn(b)

	return isInstance(nb.params, na.params) && isInstance(na.out, nb.out)

	function normalizeTypeToFn(type: Value): {
		params: ValueFnType['params']
		out: Value
	} {
		if (!isLiteralSingleton(type) && !_.isArray(type)) {
			if (type.kind == 'fnType') {
				return {params: type.params, out: type.out}
			}
		}
		return {params: [], out: type}
	}
}

/*
function testSubtype(aStr: string, bStr: string, toBe: boolean) {
	const a = assertExpType(readStr(aStr))
	const b = assertExpType(readStr(bStr))

	const ret = isSubtypeOf(a, b)

	const fn = ret === toBe ? console.log : console.error

	fn(
		`a=${aStr}, b=${bStr}, a :< b = ${printValue(a)} :< ${printValue(
			b
		)} = ${printValue(ret)}`
	)
}

testSubtype('Number', 'Any', true)
testSubtype('true', 'Boolean', true)
testSubtype('Any', 'Number', false)
testSubtype('Number', 'Number', true)
testSubtype('Number', 'String', false)
testSubtype('[Number Number]', '[Number]', true)
testSubtype('[Number Number]', '[]', true)
testSubtype('[Number Number]', 'Any', true)
testSubtype('(+ 1 2)', 'Number', true)
*/

function castType(type: Value, value: Value): Value {
	if (isLiteralSingleton(type)) {
		return type
	}

	if (_.isArray(type)) {
		const values = _.isArray(value) ? value : []
		return type.map((t, i) =>
			castType(t, values[i] !== undefined ? values[i] : null)
		)
	}

	switch (type.kind) {
		case 'valType':
			return isInstance(value, type) ? value : type.cast(value)
		case 'fnType':
			return castType(type.out, null)
		case 'union':
			return type.cast
				? isInstance(value, type)
					? value
					: type.cast(value)
				: castType(type.items[0], null)
		case 'singleton':
			return type
	}

	return null
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
				from.push(createExpValue(castType(to.items[from.length], null)))
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
		const fromItem: Exp = from[i] || {ast: 'value', value: null}

		const fromType = assertExpType(fromItem)

		if (isInstance(fromType, toType)) {
			casted.push(fromItem)
		} else {
			logs.push({
				level: 'error',
				reason:
					'Type ' +
					printValue(fromType) +
					' cannot be casted to ' +
					printValue(toType),
			})
			casted.push({
				ast: 'list',
				items: [castTypeFn, createExpValue(toType), fromItem],
			})
		}
	}

	return withLog(casted, logs)
}

export function printExp(exp: Exp): string {
	switch (exp.ast) {
		case 'list':
			return '(' + exp.items.map(printExp).join(' ') + ')'
		case 'vector':
			return '[' + exp.items.map(printExp).join(' ') + ']'
		case 'infVector':
			return '[' + exp.items.map(printExp).join(' ') + '...]'
		case 'hashMap':
			return (
				'{' +
				_.entries(exp.items)
					.map(([k, v]) => `${k}: ${printExp(v)}`)
					.join(' ') +
				'}'
			)
		case 'symbol':
			return exp.name
		case 'value':
			return printValue(exp.value)
		case 'scope':
			return (
				'{' +
				_.entries(exp.scope)
					.map(([k, v]) => k + ' = ' + printExp(v))
					.join(' ') +
				(exp.out ? printExp(exp.out) : '') +
				'}'
			)
	}
}

function retrieveValueName(
	s: ValueCustomSingleton | ValueValType,
	baseExp: Exp
): string | undefined {
	if (!s.origExp) {
		return
	}

	const {origExp} = s

	if (!origExp.parent) {
		return
	}

	const parent = origExp.parent

	if (parent.ast !== 'scope') {
		return
	}

	const name = _.findKey(parent.scope, e => e === origExp)

	if (!name) {
		return
	}

	const sym: ExpSymbol = {
		parent: baseExp,
		ast: 'symbol',
		name,
	}

	const symInspected = inspectExpSymbol(sym).result

	if (symInspected.semantic !== 'ref' || symInspected.ref !== origExp) {
		return
	}

	return name
}

export function printValue(val: Value, baseExp: Exp = GlobalScope): string {
	if (val === null) {
		return 'null'
	}
	switch (typeof val) {
		case 'boolean':
			return val ? 'true' : 'false'
		case 'number':
			return val.toString()
		case 'string':
			return `"${val}"`
	}
	if (_.isArray(val)) {
		return '[' + val.map(v => printValue(v, baseExp)).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return 'Any'
		case 'unit':
			return '()'
		case 'valType':
			return retrieveValueName(val, baseExp) || `<valType>`
		case 'infVector': {
			const items = val.items.map(v => printValue(v, baseExp))
			return '[' + items.join(' ') + '...]'
		}
		case 'union':
			return '(| ' + val.items.map(v => printValue(v, baseExp)).join(' ') + ')'
		case 'singleton':
			return retrieveValueName(val, baseExp) || '<singleton>'
		case 'fnType':
			return '(:-> ' + printValue(val.params) + ' ' + printValue(val.out) + ')'
		case 'fn':
			return '<JS Function>'
		case 'hashMap':
			return (
				'{' +
				_.entries(val.value)
					.map(([k, v]) => `${k}: ${printValue(v)}`)
					.join(' ') +
				'}'
			)
		case 'object':
			return `<object of ${printValue(val.type, baseExp)}>`
	}
}
