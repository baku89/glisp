import _ from 'lodash'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Value =
	| ValuePrim
	| Value[]
	| ValueType
	| ValueFnType
	| ValueExp
	| ValueHashMap
	| ValueFn

type ValuePrim = boolean | number | string

type ValueType = ValueValType | ValueFnType | ValueType[]

interface ValueValType {
	kind: 'valType'
	supertype: null | ValueType
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
	eval: (exp: Exp) => Value
}

interface ValueFn {
	kind: 'fn'
	type: ValueFnType
	body: <A extends Exp, R extends Value>(this: ValueFnThis, ...arg0: A[]) => R
}

interface ValueHashMap {
	kind: 'hashMap'
	value: {
		[key: string]: Value
	}
}

type Exp = ExpValue | ExpSymbol | ExpColl

type InspectedResult =
	| InspectedResultSymbol
	| InspectedResultList
	| InspectedResultVector
	| InspectedResultHashMap

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
	| {semantic: 'invalid'}

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

const TypeAny: ValueType = {kind: 'valType', supertype: null}
const TypeBoolean: ValueType = {kind: 'valType', supertype: TypeAny}
const TypeNumber: ValueType = {kind: 'valType', supertype: TypeAny}
const TypeString: ValueType = {kind: 'valType', supertype: TypeAny}
const TypeType: ValueType = {kind: 'valType', supertype: TypeAny}
const TypeFnType: ValueType = {kind: 'valType', supertype: TypeType}
const TypeHashMap: ValueType = {kind: 'valType', supertype: TypeAny}

const GlobalSymbols: {[name: string]: Exp} = {
	Any: {
		parent: null,
		ast: 'value',
		value: TypeAny,
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
				return (this.eval(a) as number) + (this.eval(b) as number)
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
				const _params = this.eval(params) as ValueType[] | ValueType
				const _out = this.eval(out) as ValueType
				const ret = {
					kind: 'fnType',
					params: _params,
					out: _out,
				}
				console.log(ret)
				return ret
			} as any,
		},
	},
	':type': {
		parent: null,
		ast: 'value',
		value: {
			kind: 'fn',
			type: {kind: 'fnType', params: TypeAny, out: TypeType},
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

export function inspectAst(exp: ExpSymbol): WithLogs<InspectedResultSymbol>
export function inspectAst(exp: ExpList): WithLogs<InspectedResultList>
export function inspectAst(exp: ExpVector): WithLogs<InspectedResultVector>
export function inspectAst(exp: ExpHashMap): WithLogs<InspectedResultHashMap>
export function inspectAst(exp: Exp): null | WithLogs<InspectedResult> {
	switch (exp.ast) {
		case 'value':
			return null
		case 'symbol':
			if (exp.name in GlobalSymbols) {
				return withLog({
					semantic: 'ref',
					ref: GlobalSymbols[exp.name],
				})
			}
			// Not Defined
			return withLog({semantic: 'invalid'}, [
				{level: 'error', reason: `${exp.name} is not defined`},
			])

		case 'list':
			if (exp.items.length >= 1 && exp.items[0].ast === 'symbol') {
				return withLog({
					semantic: 'application',
					fn: exp.items[0],
					params: exp.items.slice(1),
				})
			}
			return withLog({semantic: 'invalid'})

		case 'vector':
			if (exp.items.length === 1) {
				return withLog({semantic: 'value', value: exp.items[0]})
			} else {
				return withLog({semantic: 'vector', items: exp.items})
			}

		case 'hashMap': {
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
	}
}

function assertValueType(v: Value): ValueType {
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
			const inspected = inspectAst(exp).result
			if (inspected.semantic == 'ref') {
				return assertValueType(evalExp(inspected.ref).result)
			}
			return []
		}
		case 'list': {
			const inspected = inspectAst(exp).result
			switch (inspected.semantic) {
				case 'application': {
					const fn = evalExp(inspected.fn).result
					if (
						typeof fn === 'object' &&
						!Array.isArray(fn) &&
						fn.kind === 'fn'
					) {
						return fn.type.out
					}
				}
			}
			return []
		}
		case 'vector':
			return exp.items.length === 1
				? assertExpType(exp.items[0])
				: exp.items.map(assertExpType)
		case 'hashMap':
			return TypeHashMap
	}
}

export function evalExp(exp: Exp): WithLogs<Value> {
	switch (exp.ast) {
		case 'value':
			return withLog(exp.value)

		case 'symbol': {
			const inspected = inspectAst(exp).result
			switch (inspected.semantic) {
				case 'ref':
					return evalExp(inspected.ref)
				case 'capture':
				case 'undefined':
					return withLog(
						[],
						[{level: 'error', reason: `Symbol ${exp.name} is not defined.`}]
					)
			}
			break
		}

		case 'list':
			{
				const {result: inspected, logs} = inspectAst(exp)
				switch (inspected.semantic) {
					case 'application': {
						switch (inspected.fn.ast) {
							case 'symbol': {
								const {result: fn, logs} = evalExp(inspected.fn)

								if (
									typeof fn === 'object' &&
									!Array.isArray(fn) &&
									fn.kind === 'fn'
								) {
									const result = fn.body.call(
										{eval: e => evalExp(e).result},
										...inspected.params
									)
									return withLog(result, logs)
								} else {
									return withLog(
										[],
										[{level: 'error', reason: 'This is not a function.'}]
									)
								}
							}
						}
						return withLog([], logs)
					}
					case 'invalid':
						return withLog([], logs)
				}
			}
			break

		case 'vector': {
			const inspected = inspectAst(exp).result
			switch (inspected.semantic) {
				case 'value':
					return evalExp(inspected.value)
				case 'vector':
					return withLog(inspected.items.map(evalExp))
			}
			break
		}

		case 'hashMap': {
			const inspected = inspectAst(exp).result
			return {
				kind: 'hashMap',
				value: _.mapValues(inspected.items, evalExp),
			}
		}
	}
}

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
		case 'valType':
			switch (val) {
				case TypeAny:
					return 'Any'
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
