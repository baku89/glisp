import {capital} from 'case'
import deepClone from 'deep-clone'
import _ from 'lodash'
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
	create?: ExpFn
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

interface ExpTypeConstant extends ExpTypeBase {
	kind: 'constant'
	value: ExpBoolean | ExpNumber | ExpString
}

interface ExpTypeFnFixed extends ExpTypeBase {
	kind: 'fn'
	params: ExpType[]
	out: ExpType
	variadic?: false
}

interface ExpTypeFnVariadic extends ExpTypeBase {
	kind: 'fn'
	params: [...ExpType[], ExpTypeVector]
	out: ExpType
	variadic: true
}

type ExpTypeFn = ExpTypeFnFixed | ExpTypeFnVariadic

interface ExpTypeVector extends ExpTypeBase {
	kind: 'vector'
	items: ExpType
}

interface ExpTypeUnion extends ExpTypeBase {
	kind: 'union'
	items: ExpType[]
}

type ExpType =
	| ExpTypeAtom
	| ExpTypeConstant
	| ExpTypeFn
	| ExpTypeVector
	| ExpTypeUnion

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
	kind: 'any',
	create: createFn(
		(v: ExpForm = createNull()) => v,
		createTypeFn([], {literal: 'type', kind: 'any'})
	),
}

const TypeNull: ExpType = {
	literal: 'type',
	kind: 'null',
	create: createFn(
		() => createNull(),
		createTypeFn([], {literal: 'type', kind: 'null'})
	),
}

const TypeBoolean: ExpType = {
	literal: 'type',
	kind: 'boolean',
	create: createFn(
		(v: ExpBoolean = createBoolean(false)) => v,
		createTypeFn([], {literal: 'type', kind: 'null'})
	),
}

const TypeNumber: ExpType = {
	literal: 'type',
	kind: 'number',
	create: createFn(
		(v: ExpNumber = createNumber(0)) => v,
		createTypeFn([], {literal: 'type', kind: 'number'})
	),
}

const TypeString: ExpType = {
	literal: 'type',
	kind: 'string',
	create: createFn(
		(v: ExpString = createString('')) => v,
		createTypeFn([], {literal: 'type', kind: 'string'})
	),
}

const TypeHashMap: ExpType = {
	literal: 'type',
	kind: 'hashMap',
	create: createFn(
		(v: ExpHashMap = createHashMap({})) => v,
		createTypeFn([], {literal: 'type', kind: 'hashMap'})
	),
}

const TypeType: ExpType = {
	literal: 'type',
	kind: 'type',
	create: createFn(
		() => TypeAny,
		createTypeFn([], {literal: 'type', kind: 'type'})
	),
}

const TypeVector = createFn(
	createTypeVector,
	createTypeFn([TypeType], TypeType)
)

function createTypeVector(items: ExpType): ExpTypeVector {
	return {
		literal: 'type',
		kind: 'vector',
		items,
	}
}

const TypeFn = createFn(
	(params: ExpVector<ExpType>, out: ExpType) => createTypeFn(params.value, out),
	createTypeFn([createTypeVector(TypeType), TypeType], TypeType)
)

function createTypeFn(
	params: ExpType[],
	out: ExpType,
	variadic = false
): ExpTypeFn {
	if (variadic) {
		const fixedParams = params.slice(0, -1)
		const lastParam = params[params.length - 1]
		if (lastParam.kind !== 'vector') {
			throw new Error('Last parameter of ')
		}
		return {
			literal: 'type',
			kind: 'fn',
			params: [...fixedParams, lastParam],
			out,
			variadic,
		}
	}

	return {
		literal: 'type',
		kind: 'fn',
		params,
		out,
		variadic,
	}
}

const TypeUnion = createFn(function (items: ExpVector<ExpType>) {
	return createTypeUnion(items.value)
}, createTypeFn([createTypeVector(TypeType)], TypeType, true))

function createTypeUnion(items: ExpType[]): ExpType {
	// Flatten a nested union
	// e.g. (Number | String) | Boolean => Number | String | Boolean

	let itemsWithId: [string, ExpType][] = items
		.flatMap(flatten)
		.map(it => [getTypeIdentifier(it), it])

	itemsWithId = _.uniqBy(itemsWithId, pair => pair[0])
	items = _.sortBy(itemsWithId, pair => pair[0]).map(pair => pair[1])

	console.log(items)

	if (items.length === 0) {
		return TypeAny
	}
	if (items.length === 1) {
		return items[0]
	}

	return {
		literal: 'type',
		kind: 'union',
		items,
	}

	function flatten(item: ExpType): ExpType[] {
		if (item.kind === 'union') {
			return item.items.flatMap(flatten)
		} else {
			return [item]
		}
	}
}

const ReservedSymbols: {[name: string]: ExpForm} = {
	Any: TypeAny,
	Null: TypeNull,
	Boolean: TypeBoolean,
	Number: TypeNumber,
	String: TypeString,
	Type: TypeType,
	Vector: TypeVector,
	Union: TypeUnion,
	'->': TypeFn,
	let: createFn(
		(_, body: ExpForm) => body,
		createTypeFn([TypeHashMap, TypeAny], TypeAny)
	),
}

const GlobalScope = createList(
	createSymbol('let'),
	createHashMap({
		PI: createNumber(Math.PI),
		'+': createFn(
			value =>
				createNumber(
					(value as ExpVector<ExpNumber>).value.reduce(
						(sum, {value}) => sum + value,
						0
					)
				),
			createTypeFn([createTypeVector(TypeNumber)], TypeNumber, true)
		),
		square: createFn(
			(v: any) => createNumber(v.value * v.value),
			createTypeFn([TypeNumber], TypeNumber)
		),
		not: createFn(
			(v: any) => createBoolean(!v.value),
			createTypeFn([TypeBoolean], TypeBoolean)
		),
		type: createFn(
			(v: any) => resolveType(v),
			createTypeFn([TypeAny], TypeType)
		),
		'match-type': createFn(function (target: any, candidate: any) {
			return matchType(target, candidate) || createNull()
		}, createTypeFn([TypeType, TypeType], TypeType)),
		'equal-type': createFn(function (a: any, b: any) {
			return createBoolean(equalType(a, b))
		}, createTypeFn([TypeType, TypeType], TypeBoolean)),
		literal: createFn(
			(v: any) => createString(v.literal),
			createTypeFn([TypeAny], TypeString)
		),
	})
)

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
		case 'type':
			return TypeType
		case 'list': {
			let fnType = resolveType(exp.value[0])
			if (fnType.create) {
				fnType = resolveType(fnType.create)
			}
			if (fnType.kind === 'fn') {
				return fnType.out
			}
			throw new Error('First element of list is not callable (resolve)')
		}
		case 'vector': {
			const itemsTypes = exp.value.map(resolveType)
			const items = createTypeUnion(itemsTypes)
			return createTypeVector(items)
		}
		default:
			return TypeAny
	}
}

function resolveType(exp: ExpForm): ExpType {
	let expType: ExpType = TypeAny

	// Resolve the symbol first
	if (exp.literal === 'symbol') {
		exp = resolveSymbol(exp)
	}

	// Check if the expression itself has type
	if (exp.type) {
		const type: ExpForm = evalExp(exp.type.value)

		if (type.literal !== 'type') {
			throw new Error('Type annotation must be type')
		}
		expType = type
	}

	if (expType.kind === 'any') {
		expType = getIntrinsticType(exp)
	}

	return expType
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

// TODO: way too hacky
const getTypeIdentifier = printExp as (type: ExpType) => string

function equalType(a: ExpType, b: ExpType) {
	return getTypeIdentifier(a) === getTypeIdentifier(b)
}

function matchType(target: ExpType, candidate: ExpType): ExpType | null {
	// Exact match
	if (candidate === target) {
		return candidate
	}

	// Any match
	if (candidate.kind === 'any') {
		return target
	}
	if (target.kind === 'any') {
		return candidate
	}

	// Function match
	if (candidate.kind === 'fn') {
		if (target.kind !== 'fn') {
			return null
		}

		if (target.params.length < candidate.params.length) {
			return null
		}

		// Out type match
		const out = matchType(target.out, candidate.out)

		if (out === null) {
			return null
		}

		// All parameters match
		const params = candidate.params.map((c, i) =>
			matchType(target.params[i], c)
		)

		if (params.some(t => t === null)) {
			return null
		}

		return createTypeFn(params as ExpType[], out)
	}

	// Vector match
	if (candidate.kind === 'vector') {
		if (target.kind !== 'vector') {
			return null
		}

		const items = matchType(target.items, candidate.items)

		if (items === null) {
			return null
		}

		return createTypeVector(items)
	}

	// Union match
	if (candidate.kind === 'union') {
		const targetItems = target.kind === 'union' ? target.items : [target]
		const items = _.intersectionBy(
			targetItems,
			candidate.items,
			getTypeIdentifier
		)

		if (items.length < targetItems.length) {
			return null
		}

		return createTypeUnion(items)
	}

	// Atomic match
	if (candidate.kind === target.kind) {
		return target
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
export function evalExp(exp: ExpForm): ExpForm {
	exp.parent = GlobalScope
	return evalWithTrace(exp, [])

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

							const fnType = createTypeFn(
								Array(paramsLength).fill(TypeAny),
								TypeAny
							)

							return (exp.evaluated = createFn(fn, fnType))
						}
						case 'quote':
							if (!rest[0]) {
								throw new Error('quote needs 1 parameters')
							}
							return rest[0]
					}
				}

				let fn = evalWithTrace(first, trace)

				if (fn.literal === 'fn') {
					// Function application
				} else if (fn.literal === 'type') {
					// Type constructor
					if (!fn.create) {
						throw new Error('This type is not callable')
					}
					fn = fn.create
				} else {
					throw new Error(`${printExp(first)} is not callable`)
				}

				// Type Checking
				const fnType = resolveType(fn)

				if (fnType.kind !== 'fn') {
					throw new Error(`Not a fn type but ${fnType.kind}`)
				}

				const paramsDefType = fnType.params
				const paramsType = rest.map(resolveType)

				let minParamLen = paramsDefType.length
				const paramLen = paramsType.length

				if (fnType.variadic) {
					// Length check
					minParamLen -= 1

					if (paramLen < minParamLen) {
						throw new Error(
							`Expected ${minParamLen} arguments at least, but got ${paramLen}`
						)
					}
					// Merge rest parameters into a vector
					const lastParam: ExpVector = {
						literal: 'vector',
						value: rest.slice(minParamLen),
					}
					const lastType = createTypeVector(
						createTypeUnion(paramsType.slice(minParamLen))
					)

					// Replace the variadic part with the vector
					const variadicLen = lastParam.value.length

					rest.splice(minParamLen, variadicLen, lastParam)
					paramsType.splice(minParamLen, variadicLen, lastType)
				} else {
					// Not a variadic parameter

					// Length check
					if (paramLen < minParamLen) {
						throw new Error(
							`Expected ${minParamLen} arguments, but got ${paramLen}`
						)
					}
				}

				paramsDefType.forEach((paramDefType, i) => {
					if (!matchType(paramsType[i], paramDefType)) {
						const paramTypeStr = printExp(paramsType[i])
						const paramDefTypeStr = printExp(paramDefType)
						throw new Error(
							`Type '${paramTypeStr}' is not assignable to type '${paramDefTypeStr}'`
						)
					}
				})

				const expanded = fn.value(...rest.map(p => evalWithTrace(p, trace)))

				exp.expanded = expanded

				return (exp.evaluated = evalWithTrace(expanded, trace))
			}
			case 'vector': {
				return (exp.evaluated = createVector(
					exp.value.map(v => evalWithTrace(v, trace))
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
	value: string | ((...params: any[]) => any),
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

function createVector(value: ExpForm[]): ExpVector {
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
					case 'vector':
						return `(Vector ${printWithoutType(exp.items)})`
					case 'union': {
						const items = exp.items.map(printWithoutType).join(' ')
						return `(Union ${items})`
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
