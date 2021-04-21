import _ from 'lodash'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type ReservedKeywordNames = '=>' | 'let' | '...'

type Value = ValuePrim | Value[] | ValueExp | ValueHashMap | ValueFn

type ValuePrim = null | boolean | number | string

type IFnJS = (<A0, R>(arg0: A0) => R) | (<A0, A1, R>(arg0: A0, arg1: A1) => R)

interface ValueExp {
	type: 'exp'
	exp: Exp
}

interface ValueFn {
	body: IFnJS
}

interface ValueHashMap {
	type: 'hashMap'
	value: {
		[key: string]: Value
	}
}

type Exp = ExpValue | ExpSymbol | ExpReservedKeyword | ExpVector | ExpHashMap

type NonNullable<T> = Exclude<T, undefined | null>

interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
}

type ExpColl = ExpList | ExpValue | ExpVector | ExpHashMap

interface ExpBase {
	parent: null | ExpColl
	logs?: Log[]
}

interface ExpValue extends ExpBase {
	ast: 'value'
	value: Value
}

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	name: string
	inspected?:
		| {semantic: 'ref'; ref: Exp}
		| {semantic: 'capture'}
		| {semantic: 'invalid'}
}

interface ExpReservedKeyword extends ExpBase {
	ast: 'reservedKeyword'
	name: ReservedKeywordNames
}

interface ExpList extends ExpBase {
	ast: 'list'
	items: Exp[]
	inspected?: {semantic: 'fncall'; fn: Exp; params: Exp[]}
}

interface ExpVector extends ExpBase {
	ast: 'vector'
	items: Exp[]
	inspected?: {semantic: 'vector'; items: Exp[]}
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	items: Exp[]
	inspected?: {
		semantic: 'hashMap'
		hashMap: {
			[hash: string]: Exp
		}
	}
	logs?: Log[]
}

export function readStr(str: string): Exp {
	const exp = parser.parse(str) as Exp | undefined

	if (exp === undefined) {
		return {
			parent: null,
			ast: 'value',
			value: null,
		}
	} else {
		return exp
	}
}

const ExpPI: ExpValue = {
	parent: null,
	ast: 'value',
	value: Math.PI,
}

function pushLog(exp: Exp, log: Log) {
	if (exp.logs) {
		exp.logs.push(log)
	} else {
		exp.logs = [log]
	}
}

export function inspectExp(exp: ExpSymbol): NonNullable<ExpSymbol['inspected']>
export function inspectExp(exp: ExpVector): NonNullable<ExpVector['inspected']>
export function inspectExp(
	exp: ExpHashMap
): NonNullable<ExpHashMap['inspected']>
export function inspectExp(
	exp: Exp
):
	| null
	| NonNullable<ExpSymbol['inspected']>
	| NonNullable<ExpVector['inspected']>
	| NonNullable<ExpHashMap['inspected']> {
	switch (exp.ast) {
		case 'value':
		case 'reservedKeyword':
			return null
		case 'symbol':
			if (exp.inspected) return exp.inspected
			if (exp.name === 'PI') {
				return {
					semantic: 'ref',
					ref: ExpPI,
				}
			}
			// Not Defined
			pushLog(exp, {level: 'error', reason: `${exp.name} is not defined`})
			return {semantic: 'invalid'}
		case 'vector':
			if (exp.inspected) return exp.inspected

			return {semantic: 'vector', items: exp.items}

		case 'hashMap': {
			if (exp.inspected) return exp.inspected

			const hashMap: {[hash: string]: Exp} = {}

			if (exp.items.length % 2 !== 0) {
				pushLog(exp, {level: 'warn', reason: 'Odd number of hashMap items'})
			}

			for (let i = 0; i < exp.items.length; i += 2) {
				const key = exp.items[i]
				const value = exp.items[i + 1]
				if (key.ast !== 'value' || typeof key.value !== 'string') {
					pushLog(exp, {level: 'warn', reason: 'Key ... is not a string'})
					continue
				}
				hashMap[key.value] = value
			}

			return {semantic: 'hashMap', hashMap}
		}
	}
}

export function evalExp(exp: Exp): Value {
	switch (exp.ast) {
		case 'value':
			return exp.value
		case 'reservedKeyword':
			return {type: 'exp', exp: exp}
		case 'symbol': {
			const inspected = inspectExp(exp)
			switch (inspected.semantic) {
				case 'ref':
					return evalExp(inspected.ref)
				case 'capture':
				case 'invalid':
					return null
			}
			break
		}
		case 'vector': {
			const inspected = inspectExp(exp)
			switch (inspected.semantic) {
				case 'vector':
					return inspected.items.map(evalExp)
			}
			break
		}
		case 'hashMap': {
			const inspected = inspectExp(exp)
			return {
				type: 'hashMap',
				value: _.mapValues(inspected.hashMap, evalExp),
			}
		}
	}
}
