import {capital} from 'case'
import deepClone from 'deep-clone'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^[a-z_+\-*/=?<>][0-9a-z_+\-*/=?<>]*$/i

type ExpForm =
	| ExpNull
	| ExpBoolean
	| ExpNumber
	| ExpString
	| ExpKeyword
	| ExpSymbol
	| ExpList
	| ExpVector
	| ExpHashMap
	| ExpFn
	| ExpType
	| ExpRaw

interface ExpBase {
	parent?: ExpList | ExpVector | ExpHashMap | ExpFn
	type?: {
		value: ExpType | ExpSymbol
		delimiters?: string[]
	}
	dep?: Set<ExpSymbol | ExpList>
}

interface ExpProgram {
	literal: 'program'
	value: ExpForm
	delimiters: [string, string]
}

interface ExpNull extends ExpBase {
	literal: 'null'
}

interface ExpBoolean extends ExpBase {
	literal: 'boolean'
	value: boolean
}

interface ExpNumber extends ExpBase {
	literal: 'number'
	value: number
	str?: string
}

interface ExpString extends ExpBase {
	literal: 'string'
	value: string
}

interface ExpKeyword extends ExpBase {
	literal: 'keyword'
	value: string
}

interface ExpSymbol extends ExpBase {
	literal: 'symbol'
	value: string
	str?: string
	ref?: ExpForm
	evaluated?: ExpForm
}

interface ExpList extends ExpBase {
	literal: 'list'
	value: ExpForm[]
	delimiters?: string[]
	expanded?: ExpForm
	evaluated?: ExpForm
}

interface ExpVector extends ExpBase {
	literal: 'vector'
	value: ExpForm[]
	delimiters?: string[]
	evaluated?: ExpVector
}

interface ExpHashMap extends ExpBase {
	literal: 'hashMap'
	value: {
		[key: string]: ExpForm
	}
	keyQuoted?: {
		[key: string]: boolean
	}
	delimiters?: (string | [string, string])[]
	evaluated?: ExpHashMap
}

interface ExpType extends ExpBase {
	literal: 'type'
	create?: (...params: any[]) => ExpForm
	meta?: ExpHashMap
	body:
		| {
				type: 'any'
				default: () => ExpForm
		  }
		| {
				type: ExpNull['literal']
				default: () => ExpNull
		  }
		| {
				type: ExpBoolean['literal']
				default: () => ExpBoolean
		  }
		| {
				type: ExpNumber['literal']
				default: () => ExpNumber
		  }
		| {
				type: ExpString['literal']
				default: () => ExpString
		  }
		| {
				type: ExpKeyword['literal']
				default: () => ExpKeyword
		  }
		| {
				type: ExpHashMap['literal']
				default: () => ExpHashMap
		  }
		| {
				type: ExpType['literal']
				default: () => ExpType
		  }
		| {
				type: ExpFn['literal']
				params: ExpType[]
				return: ExpType
		  }
}

interface ExpFn extends ExpBase {
	literal: 'fn'
	value: (...params: ExpForm[]) => ExpForm
}

interface ExpRaw extends ExpBase {
	literal: 'raw'
	value: any
}

export function readStr(str: string): ExpForm {
	const exp = parser.parse(str) as ExpProgram
	return exp.value
}

const ExpTypeAny: ExpType = {
	literal: 'type',
	create: (v: ExpForm = createNull()) => v,
	body: {
		type: 'any',
		default: () => createNull(),
	},
}

const ExpTypeNull: ExpType = {
	literal: 'type',
	create: () => createNull(),
	body: {
		type: 'null',
		default: () => createNull(),
	},
}

const ExpTypeBoolean: ExpType = {
	literal: 'type',
	create: (v: ExpBoolean = createBoolean(false)) => v,
	body: {
		type: 'boolean',
		default: () => createBoolean(false),
	},
}

const ExpTypeNumber: ExpType = {
	literal: 'type',
	create: (v: ExpNumber = createNumber(0)) => v,
	body: {
		type: 'number',
		default: () => createNumber(0),
	},
}

const ExpTypeString: ExpType = {
	literal: 'type',
	create: (v: ExpString = createString('')) => v,
	body: {
		type: 'string',
		default: () => createString(''),
	},
}

const ExpTypeKeyword: ExpType = {
	literal: 'type',
	create: (v: ExpKeyword = createKeyword('_')) => v,
	body: {
		type: 'keyword',
		default: () => createKeyword('_'),
	},
}

const ExpTypeHashMap: ExpType = {
	literal: 'type',
	create: (v: ExpHashMap = createHashMap({})) => v,
	body: {
		type: 'hashMap',
		default: () => createHashMap({}),
	},
}

const ExpTypeType: ExpType = {
	literal: 'type',
	body: {
		type: 'type',
		default: () => ExpTypeAny,
	},
}

const ReservedSymbols: {[name: string]: ExpForm} = {
	Any: ExpTypeAny,
	Null: ExpTypeNull,
	Boolean: ExpTypeBoolean,
	Number: ExpTypeNumber,
	String: ExpTypeString,
	Keyword: ExpTypeKeyword,
	Type: ExpTypeType,
	let: createFn(
		(_, body: ExpForm) => {
			return body
		},
		{
			literal: 'type',
			body: {
				type: 'fn',
				params: [ExpTypeHashMap, ExpTypeAny],
				return: ExpTypeAny,
			},
		}
	),
}

const GlobalScope = createList(
	createSymbol('let'),
	createHashMap({
		// Vec2: {
		// 	literal: 'type',
		// 	constructor: (
		// 		x: ExpNumber = createNumber(0),
		// 		y: ExpNumber = createNumber(0)
		// 	) => createRaw(new Float32Array([x.value, y.value])),
		// },
		PI: createNumber(Math.PI),
		'+': createFn((x: any, y: any) => createNumber(x.value + y.value), {
			literal: 'type',
			body: {
				type: 'fn',
				params: [ExpTypeNumber, ExpTypeNumber],
				return: ExpTypeNumber,
			},
		}),
		not: createFn((v: any) => createBoolean(!v.value), {
			literal: 'type',
			body: {
				type: 'fn',
				params: [ExpTypeBoolean],
				return: ExpTypeBoolean,
			},
		}),
		'resolve-type': createFn((v: any) => resolveType(v), {
			literal: 'type',
			body: {
				type: 'fn',
				params: [ExpTypeAny],
				return: ExpTypeType,
			},
		}),
		type: createFn((v: any) => createString(v.type), {
			literal: 'type',
			body: {
				type: 'fn',
				params: [ExpTypeAny],
				return: ExpTypeString,
			},
		}),
	})
)

function combineType(base: ExpType, target: ExpType): ExpType {
	const superior =
		base.body.type !== 'any' && target.body.type === 'any' ? base : target

	const create = superior.create
	const body = superior.body

	return {
		literal: 'type',
		create,
		body,
	}
}

function getIntrinsticType(exp: ExpForm): ExpType {
	switch (exp.literal) {
		case 'null':
			return ExpTypeNull
		case 'boolean':
			return ExpTypeBoolean
		case 'number':
			return ExpTypeNumber
		case 'string':
			return ExpTypeString
		default:
			return ExpTypeAny
	}
}

function resolveType(exp: ExpForm): ExpType {
	let expType: ExpType = ExpTypeAny
	let baseType: ExpType = ExpTypeAny

	// Check if the expression itself has type
	if (exp.type) {
		const type: ExpForm = evalExp(exp.type.value)

		if (type.literal !== 'type') {
			throw new Error('Invalid type')
		}
		expType = type
	}

	if (expType.body.type === 'any') {
		expType = getIntrinsticType(exp)
	}

	if (exp.parent) {
		const {parent} = exp

		if (parent.literal === 'list') {
			const index = parent.value.indexOf(exp) - 1
			if (index >= 0) {
				// Is the part of param
				const fn = evalExp(parent.value[0])
				const fnType = resolveType(fn)
				if (fnType.body.type !== 'fn') {
					throw new Error('Mismatch fn type')
				}
				baseType = fnType.body.params[index]
			}
		}
	}

	return combineType(baseType, expType)
}

function cloneExp<T extends ExpForm>(exp: T) {
	return deepClone(exp)
}

function clearEvaluated(exp: ExpForm) {
	switch (exp.literal) {
		case 'symbol':
		case 'list':
		case 'vector':
		case 'hashMap':
			if (!exp.evaluated) {
				return
			}
			delete exp.evaluated
	}

	if (exp.dep) {
		exp.dep.forEach(clearEvaluated)
	}
}

export function evalExp(exp: ExpForm): ExpForm {
	exp.parent = GlobalScope
	return evalWithTrace(exp, [])

	function matchType(type: ExpType, candidate: ExpType): ExpType | null {
		// Exact match
		if (candidate === type) {
			return candidate
		}

		// Any match
		if (candidate.body.type === 'any') {
			return type
		}

		if (candidate.body.type === type.body.type) {
			return type
		}

		return null
	}

	function resolveSymbol(sym: ExpSymbol): ExpForm {
		if (sym.value in ReservedSymbols) {
			return ReservedSymbols[sym.value]
		}

		if (sym.ref) {
			return sym.ref
		}

		let ref: ExpForm | undefined
		let parent: ExpForm | undefined = sym

		while ((parent = parent.parent)) {
			if (isListOf('let', parent)) {
				const vars = parent.value[1]

				if (vars.literal !== 'hashMap') {
					throw new Error('2nd parameter of let should be HashMap')
				}

				if ((ref = vars.value[sym.value])) {
					break
				}
			}
		}

		if (!ref) {
			throw new Error(`Symbol ${printExp(sym)} is not defined`)
		}

		sym.ref = ref
		ref.dep = (ref.dep || new Set()).add(sym)

		return ref
	}

	function evalWithTrace(exp: ExpForm, trace: ExpForm[]): ExpForm {
		// Check circular reference
		if (trace.includes(exp)) {
			const lastTrace = trace[trace.length - 1]
			throw new Error(`Circular reference ${printExp(lastTrace)}`)
		}
		trace = [...trace, exp]

		switch (exp.literal) {
			case 'null':
			case 'boolean':
			case 'number':
			case 'string':
			case 'keyword':
			case 'fn':
			case 'type':
				return exp
			case 'symbol': {
				const ref = resolveSymbol(exp)
				return (exp.evaluated = evalWithTrace(ref, trace))
			}
			case 'list': {
				const [first, ...rest] = exp.value

				// Check Special form
				if (first.literal === 'symbol') {
					switch (first.value) {
						case 'type': {
							// Create a type
							const [type, ...typeRest] = rest.map(r => evalWithTrace(r, trace))

							if (type.literal !== 'keyword') {
								throw new Error('First parameter of : should be keyword')
							}

							switch (type.value) {
								case 'Any':
									return ExpTypeAny
								case 'Null':
									return ExpTypeNull
								case 'Boolean':
									return ExpTypeBoolean
								case 'Number':
									return ExpTypeNumber
								case 'String':
									return ExpTypeString
								case 'type':
									return ExpTypeType
								case 'Fn': {
									const [params, ret] = typeRest

									if (params.literal !== 'vector') {
										throw new Error('Parameter should be vector')
									}
									if (!params.value.every(p => p.literal === 'type')) {
										throw new Error('Every parameter should be type')
									}
									if (ret.literal !== 'type') {
										throw new Error('Return type should be type')
									}

									return {
										literal: 'type',
										body: {
											type: 'fn',
											params: params.value as ExpType[],
											return: ret,
										},
									}
								}
							}

							throw new Error('Invalid type')
						}
						case 'fn': {
							// Create a function
							const [paramsDefinition, bodyDefinition] = rest
							if (paramsDefinition.literal !== 'hashMap') {
								throw new Error('Function parameter should be hash map')
							}

							const paramsHashMap = cloneExp(paramsDefinition)

							const fnScope = createList(
								createSymbol('let'),
								paramsHashMap,
								cloneExp(bodyDefinition)
							)

							fnScope.parent = exp.parent

							const paramsKeys = Object.keys(paramsDefinition.value)
							const paramsLength = paramsKeys.length

							const fn = (...params: ExpForm[]) => {
								// Set params
								paramsKeys.forEach(
									(sym, i) => (paramsHashMap.value[sym] = params[i])
								)

								// Evaluate
								const ret = evalWithTrace(fnScope, trace)

								// Clean params
								paramsKeys.forEach(sym =>
									clearEvaluated(paramsHashMap.value[sym])
								)

								return ret
							}

							return (exp.evaluated = createFn(fn, {
								literal: 'type',
								body: {
									type: 'fn',
									params: Array(paramsLength)
										.fill(null)
										.map(() => cloneExp(ExpTypeAny)),
									return: cloneExp(ExpTypeAny),
								},
							}))
						}
						case 'quote':
							if (!rest[0]) {
								throw new Error('quote needs 1 parameters')
							}
							return rest[0]
					}
				}

				const fn = evalWithTrace(first, trace)

				let expanded: ExpForm

				if (fn.literal === 'fn') {
					// Function application
					const fnType = resolveType(fn)

					if (fnType.body.type !== 'fn') {
						throw new Error(`Not a fn type but ${fnType.body.type}`)
					}

					const paramsType = rest.map(resolveType)

					const match = fnType.body.params
						.map((pt, i) => matchType(paramsType[i], pt))
						.every(t => !!t)

					if (!match) {
						throw new Error('Invalid parameter!!!!!!')
					}

					expanded = fn.value(...rest.map(p => evalWithTrace(p, trace)))
				} else if (fn.literal === 'type') {
					// Constructor

					if (!fn.create) {
						throw new Error('This type is not callable')
					}
					expanded = fn.create(...rest.map(p => evalWithTrace(p, trace)))
				} else {
					throw new Error(`${printExp(first)} is not callable`)
				}

				exp.expanded = expanded

				return (exp.evaluated = evalWithTrace(expanded, trace))
			}
			case 'vector': {
				return (exp.evaluated = createVector(
					...exp.value.map(v => evalWithTrace(v, trace))
				))
			}
			case 'hashMap': {
				const ret: ExpHashMap = {
					literal: 'hashMap',
					value: {},
				}
				Object.entries(exp.value).forEach(
					([sym, v]) => (ret.value[sym] = evalWithTrace(v, trace))
				)

				return (exp.evaluated = ret)
			}
			default:
				return createNull()
		}
	}
}

// Create functions
function createNull(): ExpNull {
	return {literal: 'null'}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		literal: 'boolean',
		value,
	}
}

function createNumber(value: number): ExpNumber {
	return {
		literal: 'number',
		value,
	}
}

function createString(value: string): ExpString {
	return {
		literal: 'string',
		value,
	}
}

function createKeyword(value: string): ExpKeyword {
	return {
		literal: 'keyword',
		value,
	}
}

function createSymbol(value: string): ExpSymbol {
	return {
		literal: 'symbol',
		value,
	}
}

function createFn(
	value: string | ((...params: ExpForm[]) => ExpForm),
	type?: ExpType
): ExpFn {
	const fn: ExpFn = {
		literal: 'fn',
		value: typeof value === 'string' ? eval(value) : value,
	}

	if (type) {
		fn.type = {value: type}
		type.parent = fn
	}

	return fn
}

function createList(...value: ExpForm[]): ExpList {
	const exp: ExpList = {
		literal: 'list',
		value,
	}
	value.forEach(v => (v.parent = exp))

	return exp
}

function createVector(...value: ExpForm[]): ExpVector {
	const exp: ExpVector = {
		literal: 'vector',
		value,
	}
	value.forEach(v => (v.parent = exp))

	return exp
}

function createHashMap(value: ExpHashMap['value']): ExpHashMap {
	const exp: ExpHashMap = {
		literal: 'hashMap',
		value,
	}
	Object.values(value).forEach(v => (v.parent = exp))

	return exp
}

function isListOf(sym: string, exp: ExpForm): exp is ExpList {
	if (exp.literal === 'list') {
		const [first] = exp.value
		return first && first.literal === 'symbol' && first.value === sym
	}
	return false
}

export function printExp(form: ExpForm): string {
	if (form.type) {
		const {type} = form
		const [d0, d1] = type.delimiters || ['', ' ']
		return '^' + d0 + printExp(type.value) + d1 + printWithoutType(form)
	} else {
		return printWithoutType(form)
	}

	function toHashKey(value: string): ExpSymbol | ExpString {
		if (SymbolIdentiferRegex.test(value)) {
			return {literal: 'symbol', value, str: value}
		} else {
			return {literal: 'string', value}
		}
	}

	function printWithoutType(exp: ExpForm): string {
		switch (exp.literal) {
			case 'null':
				return 'null'
			case 'boolean':
				return exp.value ? 'true' : 'false'
			case 'number':
				return exp.str || exp.value.toString()
			case 'string':
				return '"' + exp.value + '"'
			case 'keyword':
				return ':' + exp.value
			case 'symbol':
				if (exp.str) {
					return exp.str
				} else {
					const {value} = exp
					return SymbolIdentiferRegex.test(value) ? value : `@"${value}"`
				}
			case 'list': {
				return printSeq('(', ')', exp.value, exp.delimiters)
			}
			case 'vector':
				return printSeq('[', ']', exp.value, exp.delimiters)
			case 'hashMap': {
				const {value, keyQuoted, delimiters} = exp
				const keys = Object.keys(value)

				let keyForms: (ExpSymbol | ExpString)[]

				if (keyQuoted) {
					keyForms = keys.map(k =>
						keyQuoted[k] ? createString(k) : createSymbol(k)
					)
				} else {
					keyForms = keys.map(toHashKey)
				}

				let flattenDelimiters: string[]
				let coll: ExpForm[]
				if (delimiters) {
					coll = keys
						.map((k, i) =>
							Array.isArray(delimiters[i + 1])
								? [keyForms[i], value[k]]
								: [value[k]]
						)
						.flat()
					flattenDelimiters = delimiters.flat()
				} else {
					coll = keys.map((k, i) => [keyForms[i], value[k]]).flat()
					flattenDelimiters = [
						'',
						...Array(keys.length - 1)
							.fill([': ', ' '])
							.flat(),
						': ',
						'',
					]
				}

				return printSeq('{', '}', coll, flattenDelimiters)
			}
			case 'fn':
				return 'fn'
			case 'type':
				switch (exp.body.type) {
					case 'any':
					case 'null':
					case 'boolean':
					case 'number':
					case 'string':
					case 'type':
						return capital(exp.body.type)
					case 'fn': {
						const params = exp.body.params.map(printWithoutType).join(' ')
						const ret = printWithoutType(exp.body.return)
						return `(: #Fn [${params}] ${ret})`
					}
					default:
						console.log(exp)
						throw new Error('Cannot print this kind of type')
				}
			default:
				throw new Error('Invalid type of Exp')
		}
	}

	function printSeq(
		start: string,
		end: string,
		coll: ExpForm[],
		delimiters?: string[]
	): string {
		if (delimiters) {
			if (delimiters.length === coll.length + 1) {
				return (
					start +
					coll.map((v, i) => delimiters[i] + printExp(v)).join('') +
					delimiters[delimiters.length - 1] +
					end
				)
			}
			console.warn('Invalid length of delimiters')
		}
		return start + coll.map(printExp).join(' ') + end
	}
}
