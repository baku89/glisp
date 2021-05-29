import _ from 'lodash'
import peg from 'pegjs'

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

interface ValueVoid {
	kind: 'void'
}

type ValueAny = []

function createValueAny() {
	return []
}

type ValuePrim = boolean | number | string

type ValueType = ValueVoid | ValueValType | ValueFnType | ValueType[]

interface ValueValType {
	kind: 'valType'
	supertype: ValueValType | ValueAny
}

interface ValueFnType {
	kind: 'fnType'
	params: ValueType | ValueType[]
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

type InspectedResultVector =
	| {semantic: 'value'; value: Exp}
	| {semantic: 'vector'; items: Exp[]}

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

const TypeBoolean: ValueType = {kind: 'valType', supertype: []}
const TypeNumber: ValueType = {kind: 'valType', supertype: []}
const TypeString: ValueType = {kind: 'valType', supertype: []}
const TypeType: ValueType = {kind: 'valType', supertype: []}
const TypeFnType: ValueType = {kind: 'valType', supertype: TypeType}
const TypeHashMap: ValueType = {kind: 'valType', supertype: []}

const GlobalSymbols: {[name: string]: Exp} = {
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
				params: [TypeType, TypeType],
				out: TypeFnType,
			},
			body: function (this: ValueFnThis, params: Exp, out: Exp) {
				const _params = this.eval<ValueType[] | ValueType>(params)
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

function inspectExpVector(exp: ExpVector): WithLogs<InspectedResultVector> {
	if (exp.items.length === 1) {
		return withLog({semantic: 'value', value: exp.items[0]})
	} else {
		return withLog({semantic: 'vector', items: exp.items})
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

function assertValueType(v: Value): ValueType | ValueVoid {
	switch (typeof v) {
		case 'boolean':
			return TypeBoolean
		case 'number':
			return TypeNumber
		case 'string':
			return TypeString
	}

	if (Array.isArray(v)) {
		return v.length === 1 ? assertValueType(v[0]) : v.map(assertValueType)
	}

	switch (v.kind) {
		case 'void':
			return {kind: 'void'}
		case 'exp':
			return assertExpType(v.exp)
		case 'fn':
			return v.type
		case 'valType':
		case 'fnType':
			return v
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
				return {kind: 'void'}
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
	const inspected = inspectExpVector(exp).result
	switch (inspected.semantic) {
		case 'value':
			return evalExp(inspected.value)
		case 'vector': {
			const evaluated = inspected.items.map(evalExp)
			return withLog(
				evaluated.map(e => e.result),
				evaluated.flatMap(e => e.logs)
			)
		}
	}
}

function evalExpList(exp: ExpList): WithLogs<Value> {
	const {result: inspected, logs} = inspectExpList(exp)
	if (inspected.semantic === 'application') {
		const {result: fn, logs} = evalExp(inspected.fn)

		if (isFn(fn)) {
			const result = fn.body.call(
				{eval: e => evalExp(e).result as any},
				...inspected.params
			)
			return withLog(result, logs)
		}
		return withLog(fn, [])
	} else {
		return withLog({kind: 'void'}, logs)
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
	return Array.isArray(x) && x.length == 0
}

function isFn(x: Value): x is ValueFn {
	return typeof x === 'object' && !Array.isArray(x) && x.kind === 'fn'
}

function isSubtypeOf(
	a: ValueValType | ValueAny,
	b: ValueValType | ValueAny
): boolean {
	if (isAny(b)) return true
	if (isAny(a)) return false
	if (a.supertype === b) return true

	return isSubtypeOf(a.supertype, b)
}

/*
function castExpParam(to: ValueType[], from: Exp[]): WithLogs<Exp[]> {
	const logs: Log[] = []

	if (to.length > from.length) {
		logs.push({level: 'error', reason: 'Too short arguments'})
	}

	for (let i = 0; i < to.length; i++) {
		const toItem = to[i]
		const fromItem = from[i]
	}
}
*/

export function printValue(val: Value): string {
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
		case 'void':
			return '()'
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
