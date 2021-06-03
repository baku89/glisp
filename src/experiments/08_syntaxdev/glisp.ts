import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Value =
	| ValueAny
	| ValuePrim
	| Value[]
	| ValueType
	| ValueFnType
	| ValueExp
	| ValueHashMap
	| ValueFn

interface ValueAny {
	kind: 'any'
}

function createValueAny(): ValueAny {
	return {kind: 'any'}
}

type ValuePrim = null | boolean | number | string

type ValueType =
	| ValueAny
	| ValueCastableType
	| ValueValType
	| ValueFnType
	| ValueType[]

interface ValueCastableType {
	kind: 'castableType'
	type: ValueType
	cast: (x: Value) => Value
}

interface ValueValType {
	kind: 'valType'
}

interface ValueFnType {
	kind: 'fnType'
	params: ValueType[]
	out: ValueType
}

interface ValueExp {
	kind: 'exp'
	exp: Exp
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
		return {parent: null, ast: 'vector', items: []}
	} else {
		return exp
	}
}

const TypeBoolean: ValueType = {kind: 'valType'}
const TypeNumber: ValueType = {kind: 'valType'}
const TypeString: ValueType = {kind: 'valType'}
const TypeType: ValueType = {kind: 'valType'}
const TypeFnType: ValueType = {kind: 'valType'}
const TypeHashMap: ValueType = {kind: 'valType'}

const GlobalSymbols: {[name: string]: Exp} = {
	Any: {
		parent: null,
		ast: 'value',
		value: {kind: 'any'},
	},
	Number: {
		parent: null,
		ast: 'value',
		value: TypeNumber,
	},
	String: {
		parent: null,
		ast: 'value',
		value: TypeString,
	},
	Boolean: {
		parent: null,
		ast: 'value',
		value: TypeBoolean,
	},
	PI: {
		parent: null,
		ast: 'value',
		value: Math.PI,
	},
	'+': {
		parent: null,
		ast: 'value',
		value: {
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: [TypeNumber, TypeNumber],
				out: TypeNumber,
			},
			body: function (this: ValueFnThis, a: Exp, b: Exp) {
				return this.eval<number>(a) + this.eval<number>(b)
			} as any,
		},
	},
	':=>': {
		parent: null,
		ast: 'value',
		value: {
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: [createValueAny(), TypeType],
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
		},
	},
	':type': {
		parent: null,
		ast: 'value',
		value: {
			kind: 'fn',
			type: {kind: 'fnType', params: [], out: TypeType},
			body: assertExpType as any,
		},
	},
}

interface WithLogs<T> {
	result: T
	logs: Log[]
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
			logs.push({level: 'warn', reason: 'Key ... is not a string'})
			continue
		}
		items[key.value] = value
	}

	return withLog({semantic: 'hashMap', items}, logs)
}

function assertValueType(v: Value): ValueType {
	if (v === null) {
		return createValueAny()
	}
	switch (typeof v) {
		case 'boolean':
			return TypeBoolean
		case 'number':
			return TypeNumber
		case 'string':
			return TypeString
	}

	if (Array.isArray(v)) {
		return v.map(assertValueType)
	}

	switch (v.kind) {
		case 'any':
		case 'castableType':
		case 'valType':
		case 'fnType':
			return v
		case 'exp':
			return assertExpType(v.exp)
		case 'fn':
			return v.type
		case 'hashMap':
			return TypeHashMap
	}
}

function assertExpType(exp: Exp): ValueType {
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
				return isFn(fn) ? fn.type.out : assertExpType(inspected.fn)
			} else {
				return createValueAny()
			}
		}
		case 'vector':
			return exp.items.length === 1
				? assertExpType(exp.items[0])
				: exp.items.map(assertExpType)
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
			return withLog(createValueAny(), [
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

		if (isFn(fn)) {
			const params = castExpParam(fn.type.params, inspected.params)

			const result = fn.body.call(
				{eval: e => evalExp(e).result as any},
				...params.result
			)
			return withLog(result, [...logs, ...params.logs])
		}
		return withLog(fn, [])
	} else {
		return withLog(createValueAny(), logs)
	}
}

function evalExpHashMap(exp: ExpHashMap): WithLogs<ValueHashMap> {
	const inspected = inspectExpHashMap(exp).result
	const evaluated = _.mapValues(inspected.items, evalExp)
	return withLog(
		{
			kind: 'hashMap',
			value: _.mapValues(evaluated, e => e.result),
		},
		_.values(evaluated).flatMap(e => e.logs)
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

function isAny(x: Value): x is ValueAny {
	return x instanceof Object && !Array.isArray(x) && x.kind === 'any'
}

function isFn(x: Value): x is ValueFn {
	return x instanceof Object && !Array.isArray(x) && x.kind === 'fn'
}

function isValueSubtypeOf(
	a: ValueValType | ValueAny,
	b: ValueValType | ValueAny
): boolean {
	if (a === b) return true
	if (isAny(b)) return true

	return false
}

function normalizeTypeToFn(type: ValueType): ValueFnType {
	let normalized: ValueFnType = {
		kind: 'fnType',
		params: [],
		out: createValueAny(),
	}

	if (Array.isArray(type) || type.kind === 'any' || type.kind === 'valType') {
		normalized.out = type
	} else if (type.kind === 'castableType') {
		normalized = normalizeTypeToFn(type.type)
	} else {
		// === is fnType
		normalized = type
	}

	return normalized
}

function isVectorSubtypeOf(a: ValueType[], b: ValueType[]): boolean {
	if (a.length < b.length) {
		return false
	}

	return _$.zipShorter(a, b).every(([a, b]) => isSubtypeOf(a, b))
}

function isSubtypeOf(a: ValueType, b: ValueType): boolean {
	if (Array.isArray(a) && Array.isArray(b)) {
		return isVectorSubtypeOf(a, b)
	}

	if (Array.isArray(a) || Array.isArray(b)) {
		return false
	}

	if (a.kind === 'valType' && b.kind === 'valType') {
		return isValueSubtypeOf(a, b)
	}

	// Either is fnType
	const na = normalizeTypeToFn(a)
	const nb = normalizeTypeToFn(b)

	return isVectorSubtypeOf(nb.params, na.params) && isSubtypeOf(na.out, nb.out)
}

function testSubtype(aStr: string, bStr: string) {
	const a = assertExpType(readStr(aStr))
	const b = assertExpType(readStr(bStr))

	const ret = isSubtypeOf(a, b)

	console.log(
		`a=${aStr}, b=${bStr}, a :< b = ${printValue(a)} :< ${printValue(
			b
		)} = ${printValue(ret)}`
	)
}

testSubtype('[Number Number]', '[Number]')
testSubtype('[Number Number]', '[]')
testSubtype('[Number Number]', 'Any')
testSubtype('(+ 1 2)', 'Number')

function getDefault(type: ValueType): ExpValue {
	switch (type) {
		case TypeBoolean:
			return {parent: null, ast: 'value', value: false}
		case TypeNumber:
			return {parent: null, ast: 'value', value: 0}
		case TypeString:
			return {parent: null, ast: 'value', value: ''}
	}

	if (Array.isArray(type)) {
		return {
			parent: null,
			ast: 'value',
			value: type.map(t => getDefault(t).value),
		}
	}

	if (type.kind === 'fnType') {
		return getDefault(type.out)
	}

	return {parent: null, ast: 'value', value: []}
}

function castExpParam(to: ValueFnType['params'], from: Exp[]): WithLogs<Exp[]> {
	const logs: Log[] = []

	if (to.length > from.length) {
		logs.push({level: 'error', reason: 'Too short arguments'})
	}

	const casted: Exp[] = []

	for (let i = 0; i < to.length; i++) {
		const toItem = to[i]
		const fromItem = from[i] || null

		if (isSubtypeOf(assertExpType(fromItem), toItem)) {
			casted.push(fromItem)
		} else {
			logs.push({level: 'error', reason: 'Mismatch'})
			casted.push(getDefault(toItem))
		}
	}

	return withLog(casted, logs)
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
		case 'castableType':
			return `<Castable ${printValue(val.type)}`
		case 'valType':
			switch (val) {
				case TypeBoolean:
					return 'Boolean'
				case TypeNumber:
					return 'Number'
				case TypeString:
					return 'String'
				case TypeType:
					return 'Type'
				case TypeFnType:
					return 'FnType'
				default:
					throw new Error('aaa!!!')
			}
		case 'fnType':
			return '(:=> ' + printValue(val.params) + ' ' + printValue(val.out) + ')'
		case 'exp':
		case 'fn':
			throw new Error('aaa')
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
