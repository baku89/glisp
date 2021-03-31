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

interface ExpVector<T extends ExpForm = ExpForm> extends ExpBase {
	literal: 'vector'
	value: T[]
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

interface ExpTypeBase extends ExpBase {
	literal: 'type'
	create?: (...params: any[]) => ExpForm
	meta?: ExpHashMap
}

interface ExpTypeAtom extends ExpTypeBase {
	kind:
		| 'any'
		| 'null'
		| 'boolean'
		| 'number'
		| 'string'
		| 'symbol'
		| 'type'
		| 'hashMap'
}

interface ExpTypeFn extends ExpTypeBase {
	kind: 'fn'
	params: ExpType[]
	out: ExpType
}

interface ExpTypeVector extends ExpTypeBase {
	kind: 'vector'
	items: ExpType
}

type ExpType = ExpTypeAtom | ExpTypeFn | ExpTypeVector

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

const TypeAny: ExpType = {
	literal: 'type',
	create: (v: ExpForm = createNull()) => v,
	kind: 'any',
}

const TypeNull: ExpType = {
	literal: 'type',
	create: () => createNull(),
	kind: 'null',
}

const TypeBoolean: ExpType = {
	literal: 'type',
	create: (v: ExpBoolean = createBoolean(false)) => v,
	kind: 'boolean',
}

const TypeNumber: ExpType = {
	literal: 'type',
	create: (v: ExpNumber = createNumber(0)) => v,
	kind: 'number',
}

const TypeString: ExpType = {
	literal: 'type',
	create: (v: ExpString = createString('')) => v,
	kind: 'string',
}

const TypeHashMap: ExpType = {
	literal: 'type',
	create: (v: ExpHashMap = createHashMap({})) => v,
	kind: 'hashMap',
}

const TypeType: ExpType = {
	literal: 'type',
	kind: 'type',
}

const TypeVector = {
	literal: 'type',
	create(items: ExpType) {
		return {
			literal: 'type',
			kind: 'vector',
			items,
		} as ExpType
	},
	body: {
		type: 'typeclass',
		params: [TypeType],
	},
}

const ExpTypeFn: ExpType = {
	literal: 'type',
	create(params: ExpVector, out: ExpType) {
		return {
			literal: 'type',
			kind: 'fn',
			params: params.value as ExpType[],
			out: out,
		}
	},
	kind: 'fn',
	params: [TypeVector.create(TypeType), TypeType],
	out: TypeType,
}

const ReservedSymbols: {[name: string]: ExpForm} = {
	Any: TypeAny,
	Null: TypeNull,
	Boolean: TypeBoolean,
	Number: TypeNumber,
	String: TypeString,
	Type: TypeType,
	'->': ExpTypeFn,
	let: createFn(
		(_, body: ExpForm) => {
			return body
		},
		{
			literal: 'type',
			kind: 'fn',
			params: [TypeHashMap, TypeAny],
			out: TypeAny,
		}
	),
}

const GlobalScope = createList(
	createSymbol('let'),
	createHashMap({
		PI: createNumber(Math.PI),
		'+': createFn((x: any, y: any) => createNumber(x.value + y.value), {
			literal: 'type',
			kind: 'fn',
			params: [TypeNumber, TypeNumber],
			out: TypeNumber,
		}),
		not: createFn((v: any) => createBoolean(!v.value), {
			literal: 'type',
			kind: 'fn',
			params: [TypeBoolean],
			out: TypeBoolean,
		}),
		'resolve-type': createFn((v: any) => resolveType(v), {
			literal: 'type',
			kind: 'fn',
			params: [TypeAny],
			out: TypeType,
		}),
		literal: createFn((v: any) => createString(v.type), {
			literal: 'type',
			kind: 'fn',
			params: [TypeAny],
			out: TypeString,
		}),
	})
)

function combineType(base: ExpType, target: ExpType): ExpType {
	const superior = base.kind !== 'any' && target.kind === 'any' ? base : target
	return deepClone(superior)
}

function getIntrinsticType(exp: ExpForm): ExpType {
	switch (exp.literal) {
		case 'null':
			return TypeNull
		case 'boolean':
			return TypeBoolean
		case 'number':
			return TypeNumber
		case 'string':
			return TypeString
		default:
			return TypeAny
	}
}

function resolveType(exp: ExpForm): ExpType {
	let expType: ExpType = TypeAny
	let baseType: ExpType = TypeAny

	// Check if the expression itself has type
	if (exp.type) {
		const type: ExpForm = evalExp(exp.type.value)

		if (type.literal !== 'type') {
			throw new Error('Invalid type')
		}
		expType = type
	}

	if (expType.kind === 'any') {
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
				if (fnType.kind !== 'fn') {
					throw new Error('Mismatch fn type')
				}
				baseType = fnType.params[index]
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
		if (candidate.kind === 'any') {
			return type
		}

		if (candidate.kind === type.kind) {
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
								const out = evalWithTrace(fnScope, trace)

								// Clean params
								paramsKeys.forEach(sym =>
									clearEvaluated(paramsHashMap.value[sym])
								)

								return out
							}

							return (exp.evaluated = createFn(fn, {
								literal: 'type',
								kind: 'fn',
								params: Array(paramsLength)
									.fill(null)
									.map(() => cloneExp(TypeAny)),
								out: cloneExp(TypeAny),
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

					if (fnType.kind !== 'fn') {
						throw new Error(`Not a fn type but ${fnType.kind}`)
					}

					const paramsType = rest.map(resolveType)

					const match = fnType.params
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
				const out: ExpHashMap = {
					literal: 'hashMap',
					value: {},
				}
				Object.entries(exp.value).forEach(
					([sym, v]) => (out.value[sym] = evalWithTrace(v, trace))
				)

				return (exp.evaluated = out)
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
				switch (exp.kind) {
					case 'any':
					case 'null':
					case 'boolean':
					case 'number':
					case 'string':
					case 'type':
						return capital(exp.kind)
					case 'fn': {
						const params = exp.params.map(printWithoutType).join(' ')
						const out = printWithoutType(exp.out)
						return `(-> [${params}] ${out})`
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
