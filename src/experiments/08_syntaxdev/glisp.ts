import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Value =
	| ValuePrim
	| Value[]
	| ValueVariadicVector
	| ValueType
	| ValueHashMap
	| ValueFn

interface ValueAny {
	kind: 'any'
}

function createValueAny(): ValueAny {
	return {kind: 'any'}
}

type ValueSingleton = ValueLiteralSingleton | ValueCustomSingleton

type ValueLiteralSingleton = null | boolean
interface ValueCustomSingleton {
	kind: 'singleton'
}

type ValuePrim = number | string

type ValueType =
	| ValueAny
	| ValueSingleton
	| ValueValType
	| ValueUnionType
	| ValueFnType
	| ValueType[]
	| ValueVariadicVector<ValueType>

interface ValueVariadicVector<T extends Value = Value> {
	kind: 'variadicVector'
	items: T[]
}

interface ValueValType {
	kind: 'valType'
	id: symbol
}

interface ValueUnionType {
	kind: 'unionType'
	items: Exclude<ValueType, ValueUnionType>[]
}

interface ValueFnType {
	kind: 'fnType'
	params:
		| Exclude<ValueType, ValueSingleton>[]
		| ValueVariadicVector<Exclude<ValueType, ValueSingleton>>
	out: Exclude<ValueType, ValueSingleton>
}

interface ValueFnThis {
	eval: <R extends Value>(exp: Exp) => R
}

interface ValueFn {
	kind: 'fn'
	type: ValueFnType
	body: <A extends Exp[], R extends Value>(this: ValueFnThis, ...arg0: A) => R
}

interface ValueHashMap {
	kind: 'hashMap'
	value: {
		[key: string]: Value
	}
}

type Exp = ExpValue | ExpSymbol | ExpColl

interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
}

type ExpColl = ExpList | ExpVector | ExpHashMap

interface ExpBase {
	parent: null | ExpColl
}

interface ExpValue extends ExpBase {
	ast: 'value'
	value: Value
}

type InspectedResultSymbol =
	| {semantic: 'ref'; ref: Exp}
	| {semantic: 'capture'}
	| {semantic: 'undefined'}

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	name: string
}

type InspectedResultList =
	| {semantic: 'application'; fn: Exp; params: Exp[]}
	| {semantic: 'void'}

interface ExpList extends ExpBase {
	ast: 'list'
	items: Exp[]
}

interface ExpVector extends ExpBase {
	ast: 'vector'
	items: Exp[]
}

type InspectedResultHashMap = {
	semantic: 'hashMap'
	items: {
		[hash: string]: Exp
	}
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	items: Exp[]
}

export function readStr(str: string): Exp {
	const exp = parser.parse(str) as Exp | undefined

	if (exp === undefined) {
		return createValue([])
	} else {
		return exp
	}
}

function createValue(value: Value): ExpValue {
	return {
		parent: null,
		ast: 'value',
		value,
	}
}

function createValueVariadicVector<T extends Value = Value>(
	items: T[]
): ValueVariadicVector<T> {
	return {
		kind: 'variadicVector',
		items,
	}
}

const TypeBoolean: ValueType = {kind: 'unionType', items: [true, false]}
const TypeNumber: ValueType = {kind: 'valType', id: Symbol('number')}
const TypeString: ValueType = {kind: 'valType', id: Symbol('string')}
const TypeFnType: ValueType = {kind: 'valType', id: Symbol('fnType')}
const TypeHashMap: ValueType = {kind: 'valType', id: Symbol('hashMap')}

const OrderingLT: ValueSingleton = {kind: 'singleton'}
const OrderingEQ: ValueSingleton = {kind: 'singleton'}
const OrderingGT: ValueSingleton = {kind: 'singleton'}

const GlobalSymbols: {[name: string]: Exp} = {
	Any: createValue(createValueAny()),
	Number: createValue(TypeNumber),
	String: createValue(TypeString),
	Boolean: createValue(TypeBoolean),
	LT: createValue(OrderingLT),
	EQ: createValue(OrderingEQ),
	GT: createValue(OrderingGT),
	Ordering: createValue({
		kind: 'unionType',
		items: [OrderingLT, OrderingEQ, OrderingGT],
	}),
	PI: createValue(Math.PI),
	'+': createValue({
		kind: 'fn',
		type: {
			kind: 'fnType',
			params: createValueVariadicVector([TypeNumber]),
			out: TypeNumber,
		},
		body: function (this: ValueFnThis, ...xs: Exp[]) {
			return xs.map(x => this.eval<number>(x)).reduce((a, b) => a + b, 0)
		} as any,
	}),
	'*': createValue({
		kind: 'fn',
		type: {
			kind: 'fnType',
			params: createValueVariadicVector([TypeNumber]),
			out: TypeNumber,
		},
		body: function (this: ValueFnThis, ...xs: Exp[]) {
			return xs.map(x => this.eval<number>(x)).reduce((a, b) => a * b, 1)
		} as any,
	}),
	':=>': createValue({
		kind: 'fn',
		type: {
			kind: 'fnType',
			params: [createValueAny(), createValueAny()],
			out: TypeFnType,
		},
		body: function (this: ValueFnThis, params: Exp, out: Exp) {
			const _params = this.eval<ValueType[]>(params)
			const _out = this.eval<ValueType>(out)
			return {
				kind: 'fnType',
				params: _params,
				out: _out,
			}
		} as any,
	}),
	':|': createValue({
		kind: 'fn',
		type: {
			kind: 'fnType',
			params: createValueVariadicVector([createValueAny()]),
			out: createValueAny(),
		},
		body: function (this: ValueFnThis, ...a: Exp[]) {
			return {
				kind: 'unionType',
				items: a.map(this.eval),
			}
		} as any,
	}),
	'...': createValue({
		kind: 'fn',
		type: {
			kind: 'fnType',
			params: createValueVariadicVector([createValueAny()]),
			out: createValueAny(),
		},
		body: function (this: ValueFnThis, ...xs: Exp[]) {
			const items: Value[] = xs.map(this.eval)

			if (items.length === 0) {
				items.push(createValueAny())
			} else if (items.length >= 2) {
				const last = items[items.length - 1]
				for (let i = items.length - 2; i >= 0; i--) {
					if (equalsValue(items[i], last)) {
						items.pop()
					}
				}
			}

			return {
				kind: 'variadicVector',
				items,
			}
		} as any,
	}),
	':type': createValue({
		kind: 'fn',
		type: {kind: 'fnType', params: [createValueAny()], out: createValueAny()},
		body: function (this: ValueFnThis, t: Exp) {
			return assertExpType(t)
		} as any,
	}),
	':<': createValue({
		kind: 'fn',
		type: {
			kind: 'fnType',
			params: [createValueAny(), createValueAny()],
			out: TypeBoolean,
		},
		body: function (this: ValueFnThis, a: Exp, b: Exp) {
			return isSubtypeOf(this.eval<ValueType>(a), this.eval<ValueType>(b))
		} as any,
	}),
}

interface WithLogs<T> {
	result: T
	logs: Log[]
}

function equalsValue(a: Value, b: Value): boolean {
	if (a === null || typeof a !== 'object') {
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
		case 'variadicVector':
			return isKindOf(b, 'variadicVector') && equalsValue(a.items, b.items)
	}
}

function withLog<T>(result: T, logs: Log[] = []) {
	return {result, logs}
}

function inspectExpSymbol(exp: ExpSymbol): WithLogs<InspectedResultSymbol> {
	if (exp.name in GlobalSymbols) {
		return withLog({
			semantic: 'ref',
			ref: GlobalSymbols[exp.name],
		})
	} else {
		// Not Defined
		return withLog({semantic: 'undefined'}, [
			{level: 'error', reason: `${exp.name} is not defined`},
		])
	}
}

function inspectExpList(exp: ExpList): WithLogs<InspectedResultList> {
	if (exp.items.length >= 1) {
		return withLog({
			semantic: 'application',
			fn: exp.items[0],
			params: exp.items.slice(1),
		})
	} else {
		return withLog({semantic: 'void'})
	}
}

function inspectExpHashMap(exp: ExpHashMap): WithLogs<InspectedResultHashMap> {
	const items: {[hash: string]: Exp} = {}

	const logs: Log[] = []

	if (exp.items.length % 2 !== 0) {
		logs.push({level: 'warn', reason: 'Odd number of hashMap items'})
	}

	for (let i = 0; i < exp.items.length; i += 2) {
		const key = exp.items[i]
		const value = exp.items[i + 1]
		if (key.ast !== 'value' || typeof key.value !== 'string') {
			logs.push({
				level: 'warn',
				reason: `Key ${printExp(key)} is not a string`,
			})
			continue
		}
		items[key.value] = value
	}

	return withLog({semantic: 'hashMap', items}, logs)
}

function assertValueType(v: Value): Value {
	if (v === null || typeof v !== 'object') {
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
		case 'variadicVector':
			return v
		case 'fn':
			return v.type
		case 'hashMap':
			return TypeHashMap
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
			return createValueAny()
		}
		case 'list': {
			const inspected = inspectExpList(exp).result
			if (inspected.semantic === 'application') {
				const fn = evalExp(inspected.fn).result
				return isKindOf(fn, 'fn') ? fn.type.out : assertExpType(inspected.fn)
			} else {
				return createValueAny()
			}
		}
		case 'vector':
			return exp.items.map(assertExpType)
		case 'hashMap':
			return TypeHashMap
	}
}

function evalExpSymbol(exp: ExpSymbol): WithLogs<Value> {
	const inspected = inspectExpSymbol(exp).result
	switch (inspected.semantic) {
		case 'ref':
			return evalExp(inspected.ref)
		case 'capture':
		case 'undefined':
			return withLog(null, [
				{level: 'error', reason: `Symbol ${exp.name} is not defined.`},
			])
	}
}

function evalExpVector(exp: ExpVector): WithLogs<Value> {
	const evaluated = exp.items.map(evalExp)
	return withLog(
		evaluated.map(e => e.result),
		evaluated.flatMap(e => e.logs)
	)
}

function evalExpList(exp: ExpList): WithLogs<Value> {
	const {result: inspected, logs} = inspectExpList(exp)
	if (inspected.semantic === 'application') {
		const {result: fn, logs} = evalExp(inspected.fn)

		if (isKindOf(fn, 'fn')) {
			const {result: params, logs: castLogs} = castExpParam(
				fn.type.params,
				inspected.params
			)

			const paramsLogs: Log[] = []

			const result = fn.body.call(
				{
					eval: function (e: Exp) {
						const {result, logs: logs} = evalExp(e)
						paramsLogs.push(...logs)
						return result
					} as any,
				},
				...params
			)
			return withLog(result, [...logs, ...castLogs, ...paramsLogs])
		}
		return withLog(fn, logs)
	} else {
		// ()
		return withLog(null, logs)
	}
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
	}
}

// Kind predicates
function isAny(x: Value): x is ValueAny {
	return x instanceof Object && !Array.isArray(x) && x.kind === 'any'
}

function isKindOf(x: Value, kind: 'any'): x is ValueAny
function isKindOf(x: Value, kind: 'fn'): x is ValueFn
function isKindOf(x: Value, kind: 'fnType'): x is ValueFnType
function isKindOf(x: Value, kind: 'hashMap'): x is ValueHashMap
function isKindOf(x: Value, kind: 'unionType'): x is ValueUnionType
function isKindOf(x: Value, kind: 'valType'): x is ValueValType
function isKindOf(x: Value, kind: 'variadicVector'): x is ValueVariadicVector
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

	if (isKindOf(b, 'variadicVector')) {
		if (isKindOf(a, 'variadicVector')) {
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
		return b === TypeNumber
	}
	if (typeof a === 'string') {
		return b === TypeString
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
		if (typeof type === 'object' && type !== null && !Array.isArray(type)) {
			if (type.kind == 'fnType') {
				return {params: type.params, out: type.out}
			}
		}
		return {params: [], out: type}
	}
}

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

function getDefault(type: ValueType): ExpValue {
	if (type === null || typeof type === 'boolean') {
		return createValue(type)
	}

	switch (type) {
		case TypeBoolean:
			return createValue(false)
		case TypeNumber:
			return createValue(0)
		case TypeString:
			return createValue('')
	}

	if (Array.isArray(type)) {
		return createValue(type.map(t => getDefault(t).value))
	}

	switch (type.kind) {
		case 'fnType':
			return getDefault(type.out)
		case 'unionType':
			return getDefault(type.items[0])
		case 'singleton':
			return createValue(type)
	}

	return createValue([])
}

function castExpParam(
	to: ValueType[] | ValueVariadicVector<ValueType>,
	from: Exp[]
): WithLogs<Exp[]> {
	const logs: Log[] = []

	if (Array.isArray(to)) {
		if (to.length > from.length) {
			logs.push({level: 'error', reason: 'Too short arguments'})
		}
	} else {
		const minLength = to.items.length - 1
		if (from.length < minLength) {
			logs.push({level: 'error', reason: 'Too short arguments'})

			from = [...from]
			while (from.length < minLength) {
				from.push(getDefault(to.items[from.length]))
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
		const toItem = to[i]
		const fromItem: Exp = from[i] || {ast: 'value', value: null}

		const fromType = assertExpType(fromItem)

		if (isSubtypeOf(fromType, toItem)) {
			casted.push(fromItem)
		} else {
			logs.push({
				level: 'error',
				reason:
					'Type ' +
					printValue(fromType) +
					' cannot be casted to ' +
					printValue(toItem),
			})
			casted.push(getDefault(toItem))
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
	}
}

export function printValue(val: Value): string {
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
		return '[' + val.map(printValue).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return 'Any'
		case 'valType':
			switch (val) {
				case TypeNumber:
					return 'Number'
				case TypeString:
					return 'String'
				case TypeFnType:
					return 'FnType'
				default:
					throw new Error('aaa!!!')
			}
		case 'variadicVector':
			return '(... ' + val.items.map(printValue).join(' ') + ')'
		case 'unionType':
			return '(:| ' + val.items.map(printValue).join(' ') + ')'
		case 'singleton':
			return '<singleton>'
		case 'fnType':
			return '(:=> ' + printValue(val.params) + ' ' + printValue(val.out) + ')'
		case 'fn':
			return '<JS Function>'
		case 'hashMap':
			return (
				'{' +
				Object.entries(val.value)
					.flatMap(([k, v]) => [`"${k}"`, printValue(v)])
					.join(' ') +
				'}'
			)
	}
}
