import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Value =
	| Value[]
	| ValueVariadic
	| ValueAny
	| ValueSingleton
	| ValueValType
	| ValueUnionType
	| ValueFnType
	| ValueVariadic
	| ValueHashMap
	| ValueFn
	| ValueObject

interface ValueAny {
	kind: 'any'
}

type ValueSingleton = ValueLiteralSingleton | ValueCustomSingleton

type ValueLiteralSingleton = null | boolean | string | number
interface ValueCustomSingleton {
	kind: 'singleton'
	origExp?: Exp
}

interface ValueVariadic<T extends Value = Value> {
	kind: 'variadic'
	items: T[]
}

interface ValueValType {
	kind: 'valType'
	id: symbol
	origExp?: Exp
	cast: (value: Value) => Value
}

interface ValueUnionType {
	kind: 'unionType'
	items: Exclude<Value, ValueUnionType>[]
	cast?: (value: Value) => Value
}

interface ValueFnType {
	kind: 'fnType'
	params: Value[] | ValueVariadic
	out: Value
}

interface ValueFnThis {
	log: (log: Log) => void
	eval: <R extends Value>(exp: Exp) => R
}

interface ValueFn {
	kind: 'fn'
	params: {[name: string]: Value}
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
	| ExpHashMap
	| ExpPair
	| ExpScope

interface Log {
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

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	items: Exp[]
}

interface ExpPair extends ExpBase {
	ast: 'pair'
	left: Exp
	right: Exp
}

interface ExpScope extends ExpBase {
	ast: 'scope'
	scope: {[name: string]: Exp}
	out?: Exp
}

type InspectedResult =
	| {semantic: 'raw'}
	| InspectedResultSymbol
	| InspectedResultList
	| InspectedResultVector
	| InspectedResultHashMap

type InspectedResultSymbol =
	| {semantic: 'ref'; ref: Exp}
	| {semantic: 'capture'}
	| {semantic: 'undefined'}
	| {semantic: 'circular'}

type InspectedResultList =
	| {semantic: 'application'; fn: Exp; params: Exp[]}
	| {semantic: 'fndef'; params: {[name: string]: Exp}; body: Exp}
	| {semantic: 'scope'; scope: ExpScope['scope']; out?: ExpScope['out']}
	| {semantic: 'null'}

type InspectedResultVector =
	| {semantic: 'fixed'; items: Exp[]}
	| {semantic: 'variadic'; items: Exp[]}

type InspectedResultHashMap = {
	semantic: 'hashMap'
	items: {
		[hash: string]: Exp
	}
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

function createVariadic<T extends Value = Value>(
	...items: T[]
): ValueVariadic<T> {
	return {
		kind: 'variadic',
		items,
	}
}

function createValType(
	base: ValueValType | string,
	cast: ValueValType['cast']
): ValueValType {
	const id = typeof base === 'string' ? Symbol(base) : base.id
	const origExp = typeof base === 'string' ? undefined : base.origExp

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
			kind: 'unionType',
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
		'#=>': createExpValue({
			kind: 'fn',
			params: {params: createVariadic(createAny()), out: createAny()},
			out: TypeFnType,
			body: function (this: ValueFnThis, params: Exp, out: Exp) {
				return {
					kind: 'fnType',
					params: this.eval(params),
					out: this.eval(out),
				}
			} as any,
		}),
		'#|': createExpValue({
			kind: 'fn',
			params: {xs: createAny()},
			out: createAny(),
			variadic: true,
			body: function (this: ValueFnThis, ...a: Exp[]) {
				return uniteType(a.map(this.eval))
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
						GlobalScope.scope[n] = value
					},
				}
			} as any,
		}),
		type: createExpValue({
			kind: 'fn',
			params: {x: createAny()},
			out: createAny(),
			body: function (this: ValueFnThis, t: Exp) {
				return assertExpType(t)
			} as any,
		}),
		'#<': createExpValue({
			kind: 'fn',
			params: {value: createAny(), type: createAny()},
			out: TypeBoolean,
			body: function (this: ValueFnThis, a: Exp, b: Exp) {
				return isSubtypeOf(this.eval(a), this.eval(b))
			} as any,
		}),
		'#': castTypeFn,
	},
})

interface WithLogs<T> {
	result: T
	logs: Log[]
}

function uniteType(
	types: Value[],
	cast?: NonNullable<ValueUnionType['cast']>
): Value {
	const items: (Exclude<Value, ValueUnionType> | undefined)[] = types.flatMap(
		t => (isKindOf(t, 'unionType') ? t.items : [t])
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

	const uniqItems = items.filter(
		i => i !== undefined
	) as ValueUnionType['items']

	return uniqItems.length > 0
		? {kind: 'unionType', items: uniqItems, cast}
		: uniqItems[0]
}

function equalsValue(a: Value, b: Value): boolean {
	if (isLiteralSingleton(a)) {
		return a === b
	}

	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			_$.zipShorter(a, b).every(_.spread(equalsValue))
		)
	}

	switch (a.kind) {
		case 'any':
			return isAny(b)
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
				const aKeys = Object.keys(a.value)
				const bKeys = Object.keys(b.value)
				return (
					aKeys.length === bKeys.length &&
					aKeys.every(
						k => bKeys.includes(k) && equalsValue(a.value[k], b.value[k])
					)
				)
			}
			return false
		case 'unionType':
			return (
				isKindOf(b, 'unionType') &&
				_.xorWith(a.items, b.items, equalsValue).length === 0
			)
		case 'variadic':
			return isKindOf(b, 'variadic') && equalsValue(a.items, b.items)
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
			return inspectExpVector(exp)
		case 'hashMap':
			return inspectExpHashMap(exp)
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
		const inspected: InspectedResult = inspectExp(parent).result
		if (inspected.semantic === 'scope') {
			if (name in inspected.scope) {
				const ref: Exp = inspected.scope[name]
				if (ref.ast === 'symbol') {
					if (history.has(ref)) {
						return withLog({semantic: 'circular'}, [
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
					return withLog({
						semantic: 'ref',
						ref,
					})
				}
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
			if (fst.name === '@') {
				const scope: {[name: string]: Exp} = {}
				let out: Exp | undefined
				const logs: Log[] = []

				if (rest.length >= 1 && rest[0].ast !== 'pair') {
					out = rest[0]
					rest.shift()
				}

				rest.forEach(pair => {
					if (pair.ast !== 'pair') {
						logs.push({
							level: 'warn',
							reason: `${printExp(pair)} is not a pair`,
						})
					} else if (pair.left.ast !== 'symbol') {
						logs.push({
							level: 'warn',
							reason: `${printExp(pair.left)} is not a symbol`,
						})
					} else {
						if (pair.left.name in scope) {
							logs.push({
								level: 'warn',
								reason: `The scope has duplicated key ${printExp(pair.left)}`,
							})
						}
						scope[pair.left.name] = pair.right
					}
				})

				return withLog({semantic: 'scope', scope, out}, logs)
			} else if (fst.name === '=>') {
				if (rest.length >= 2) {
					const [params, body] = rest
					if (params.ast === 'hashMap') {
						const {result: inspectedParams, logs} = inspectExpHashMap(params)
						return withLog({
							semantic: 'fndef',
							params: inspectedParams.items,
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

function inspectExpVector(exp: ExpVector): WithLogs<InspectedResultVector> {
	if (exp.items.length >= 2) {
		const idx = _.findLastIndex(
			exp.items,
			it => it.ast === 'symbol' && it.name === '...'
		)

		if (idx === exp.items.length - 2) {
			const items = [...exp.items]
			items.splice(-2, 1)
			return withLog({semantic: 'variadic', items})
		}
	}

	return withLog({semantic: 'fixed', items: exp.items})
}

function inspectExpHashMap(exp: ExpHashMap): WithLogs<InspectedResultHashMap> {
	const items: {[hash: string]: Exp} = {}

	const logs: Log[] = []

	exp.items.forEach(it => {
		if (it.ast !== 'pair') {
			logs.push({
				level: 'warn',
				reason: `Item ${printExp(it)} is not a pair`,
			})
		} else if (it.left.ast !== 'symbol') {
			logs.push({
				level: 'warn',
				reason: `Key ${printExp(it.left)} is not a string`,
			})
		} else {
			items[it.left.name] = it.right
		}
	})

	return withLog({semantic: 'hashMap', items}, logs)
}

function assertValueType(v: Value): Value {
	if (isLiteralSingleton(v)) {
		return v
	}

	if (Array.isArray(v)) {
		return v.map(assertValueType)
	}

	switch (v.kind) {
		case 'any':
		case 'singleton':
		case 'valType':
		case 'fnType':
		case 'unionType':
		case 'variadic':
			return v
		case 'fn': {
			let params: Value[] | ValueVariadic = Object.values(v.params)
			if (v.variadic) {
				params = {kind: 'variadic', items: params}
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

				const paramsType = Object.values(params)
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
		case 'hashMap':
			return TypeHashMap
		case 'pair':
			return assertExpType(exp.right)
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

function evalExpVector(exp: ExpVector): WithLogs<Value> {
	const {result: inspected} = inspectExpVector(exp)

	switch (inspected.semantic) {
		case 'fixed': {
			const evaluated = inspected.items.map(evalExp)
			return withLog(
				evaluated.map(e => e.result),
				evaluated.flatMap(e => e.logs)
			)
		}
		case 'variadic': {
			const evaluated = inspected.items.map(evalExp)
			return withLog(
				{kind: 'variadic', items: evaluated.map(e => e.result)},
				evaluated.flatMap(e => e.logs)
			)
		}
	}
}

function getParamType(fn: ValueFn): ValueFnType['params'] {
	let params: ValueFnType['params'] = Object.values(fn.params)
	if (fn.variadic) {
		params = {kind: 'variadic', items: params}
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
	} else if (inspected.semantic === 'scope') {
		if (inspected.out !== undefined) {
			const {result, logs} = evalExp(inspected.out)
			return withLog(result, [...inspectLogs, ...logs])
		}
	}
	return withLog(null, inspectLogs)
}

function evalExpHashMap(exp: ExpHashMap): WithLogs<ValueHashMap> {
	const {result: inspected, logs} = inspectExpHashMap(exp)
	const evaluated = _.mapValues(inspected.items, evalExp)
	return withLog(
		{
			kind: 'hashMap',
			value: _.mapValues(evaluated, e => e.result),
		},
		[...logs, ..._.values(evaluated).flatMap(e => e.logs)]
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
		case 'hashMap':
			return evalExpHashMap(exp)
		case 'pair':
			return evalExp(exp.right)
		case 'scope':
			return evalExpScope(exp)
	}
}

// Kind predicates
function isAny(x: Value): x is ValueAny {
	return x instanceof Object && !Array.isArray(x) && x.kind === 'any'
}

function isLiteralSingleton(x: Value): x is ValueLiteralSingleton {
	return x === null || typeof x !== 'object'
}

function isKindOf(x: Value, kind: 'any'): x is ValueAny
function isKindOf(x: Value, kind: 'fn'): x is ValueFn
function isKindOf(x: Value, kind: 'fnType'): x is ValueFnType
function isKindOf(x: Value, kind: 'hashMap'): x is ValueHashMap
function isKindOf(x: Value, kind: 'unionType'): x is ValueUnionType
function isKindOf(x: Value, kind: 'valType'): x is ValueValType
function isKindOf(x: Value, kind: 'variadic'): x is ValueVariadic
function isKindOf(x: Value, kind: 'singleton'): x is ValueCustomSingleton
function isKindOf<
	T extends Exclude<Value, null | boolean | number | string | any[]>
>(x: Value, kind: T['kind']): x is T {
	return x instanceof Object && !Array.isArray(x) && x.kind === kind
}

function isSubtypeOf(a: Value, b: Value): boolean {
	if (a === b) {
		return true
	}

	if (isAny(b)) {
		return true
	}

	if (isAny(a)) {
		return false
	}

	if (isKindOf(a, 'valType')) {
		return isKindOf(b, 'valType') && a.id === b.id
	}

	// Handling Vector/VariadicVector

	if (isKindOf(b, 'variadic')) {
		if (isKindOf(a, 'variadic')) {
			const alen = a.items.length,
				blen = b.items.length
			if (alen < blen) {
				return false
			}
			const bitems = [...b.items, ...Array(alen - blen).fill(b.items[blen - 1])]
			return _$.zipShorter(a.items, bitems).every(_.spread(isSubtypeOf))
		} else if (Array.isArray(a)) {
			const minLength = b.items.length - 1
			if (a.length < minLength) {
				return false
			}
			const variadicCount = a.length - minLength
			const bLast = b.items[b.items.length - 1]
			const bv = [
				...b.items.slice(0, minLength),
				...Array(variadicCount).fill(bLast),
			]
			return isSubtypeOf(a, bv)
		}
		return false
	}

	if (Array.isArray(b)) {
		if (Array.isArray(a)) {
			if (a.length < b.length) {
				return false
			}
			return _$.zipShorter(a, b).every(([a, b]) => isSubtypeOf(a, b))
		}
		return false
	}

	if (Array.isArray(a)) {
		return false
	}

	// Handle for union type
	if (isKindOf(b, 'unionType')) {
		const aTypes: Value[] = isKindOf(a, 'unionType') ? a.items : [a]
		const bTypes = b.items
		return aTypes.every(at => bTypes.some(bt => isSubtypeOf(at, bt)))
	}

	if (isKindOf(a, 'unionType')) {
		return false
	}

	// Handle for literals / value
	if (typeof a === 'number') {
		return isKindOf(b, 'valType') && b.id === TypeNumber.id
	}
	if (typeof a === 'string') {
		return isKindOf(b, 'valType') && b.id === TypeString.id
	}

	if (isKindOf(a, 'fn')) {
		return a === b || isSubtypeOf(assertValueType(a), b)
	}

	if (typeof b === 'number' || typeof b === 'string' || isKindOf(b, 'fn')) {
		return false
	}

	// Either is singleton
	if (
		a === null ||
		b === null ||
		typeof a === 'boolean' ||
		typeof b === 'boolean' ||
		a.kind === 'singleton' ||
		b.kind === 'singleton'
	) {
		return false
	}

	// Either is fnType
	const na = normalizeTypeToFn(a)
	const nb = normalizeTypeToFn(b)

	return isSubtypeOf(nb.params, na.params) && isSubtypeOf(na.out, nb.out)

	function normalizeTypeToFn(type: Value): {
		params: ValueFnType['params']
		out: Value
	} {
		if (!isLiteralSingleton(type) && !Array.isArray(type)) {
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

	if (Array.isArray(type)) {
		const values = Array.isArray(value) ? value : []
		return type.map((t, i) =>
			castType(t, values[i] !== undefined ? values[i] : null)
		)
	}

	switch (type.kind) {
		case 'valType':
			return isSubtypeOf(value, type) ? value : type.cast(value)
		case 'fnType':
			return castType(type.out, null)
		case 'unionType':
			return type.cast
				? isSubtypeOf(value, type)
					? value
					: type.cast(value)
				: castType(type.items[0], null)
		case 'singleton':
			return type
	}

	return null
}

function castExpParam(
	to: Value[] | ValueVariadic,
	from: Exp[]
): WithLogs<Exp[]> {
	const logs: Log[] = []

	if (Array.isArray(to)) {
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
			...Array(variadicCount).fill(to.items[minLength]),
		]
	}

	const casted: Exp[] = []

	for (let i = 0; i < to.length; i++) {
		const toType = to[i]
		const fromItem: Exp = from[i] || {ast: 'value', value: null}

		const fromType = assertExpType(fromItem)

		if (isSubtypeOf(fromType, toType)) {
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
		case 'hashMap':
			return '{' + exp.items.map(printExp).join(' ') + '}'
		case 'symbol':
			return exp.name
		case 'value':
			return printValue(exp.value)
		case 'pair':
			return printExp(exp.left) + ':' + printExp(exp.right)
		case 'scope':
			return (
				'(@' +
				Object.entries(exp.scope)
					.map(([k, v]) => k + ' ' + printExp(v))
					.join(' ') +
				(exp.out ? printExp(exp.out) : '') +
				')'
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

	const inspected = inspectExp(origExp.parent).result

	if (inspected.semantic !== 'scope') {
		return
	}

	const name = _.findKey(inspected.scope, e => e === origExp)

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
	if (Array.isArray(val)) {
		return '[' + val.map(v => printValue(v, baseExp)).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return 'Any'
		case 'valType':
			return retrieveValueName(val, baseExp) || `<valType>`
		case 'variadic': {
			const items = val.items.map(v => printValue(v, baseExp))
			items.splice(-1, 0, '...')
			return '[' + items.join(' ') + ']'
		}
		case 'unionType':
			return '(:| ' + val.items.map(v => printValue(v, baseExp)).join(' ') + ')'
		case 'singleton':
			return retrieveValueName(val, baseExp) || '<singleton>'
		case 'fnType':
			return '(:=> ' + printValue(val.params) + ' ' + printValue(val.out) + ')'
		case 'fn':
			return '<JS Function>'
		case 'hashMap':
			return (
				'{' +
				Object.entries(val.value)
					.flatMap(([k, v]) => [`${k}:`, printValue(v)])
					.join(' ') +
				'}'
			)
		case 'object':
			return `<object of ${printValue(val.type, baseExp)}>`
	}
}
