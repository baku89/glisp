import deepClone from 'deep-clone'
import _ from 'lodash'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^[a-z_+\-*/=?<>][0-9a-z_+\-*/=?<>]*$/i

type ExpForm =
	| ExpConst
	| ExpValue
	| ExpSymbol
	| ExpList
	| ExpVector
	| ExpHashMap
	| ExpFn
	| ExpTypeComplex
	| ExpRaw

interface ExpBase {
	parent?: ExpList | ExpVector | ExpHashMap | ExpFn
	type?: {
		value: ExpTypeComplex | ExpSymbol
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
	literal: 'const'
	value: null
}

interface ExpBoolean extends ExpBase {
	literal: 'const'
	value: boolean
	unionOf: 'boolean'
}

type ExpConst = ExpNull | ExpBoolean

interface ExpNumber extends ExpBase {
	literal: 'value'
	unionOf: 'number'
	value: number
	str?: string
}

interface ExpString extends ExpBase {
	literal: 'value'
	unionOf: 'string'
	value: string
}

type ExpValue = ExpNumber | ExpString

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

// Types
interface ExpTypeComplexBase extends ExpBase {
	literal: 'type'
	create?: ExpFn
	meta?: ExpHashMap
}

interface ExpTypeAll extends ExpTypeComplexBase {
	kind: 'all'
}

interface ExpTypeValue extends ExpTypeComplexBase {
	kind: 'value'
	identifier: ExpBoolean['unionOf'] | ExpValue['unionOf']
}

interface ExpTypeTypeComplex extends ExpTypeComplexBase {
	kind: 'type'
}

interface ExpComplexTypeFnFixed extends ExpTypeComplexBase {
	kind: 'fn'
	params: ExpTypeN[]
	out: ExpTypeN
	variadic?: false
}

interface ExpComplexTypeFnVariadic extends ExpTypeComplexBase {
	kind: 'fn'
	params: [...ExpTypeN[], ExpTypeVector]
	out: ExpTypeN
	variadic: true
}

type ExpTypeFn = ExpComplexTypeFnFixed | ExpComplexTypeFnVariadic

interface ExpTypeVector extends ExpTypeComplexBase {
	kind: 'vector'
	items: ExpTypeN
}

interface ExpTypeTuple extends ExpTypeComplexBase {
	kind: 'tuple'
	items: ExpTypeN[]
}

interface ExpTypeHashMap extends ExpTypeComplexBase {
	kind: 'hashMap'
	items: ExpTypeN
}

interface ExpTypeUnion extends ExpTypeComplexBase {
	kind: 'union'
	items: ExpTypeN[]
	destructive: boolean
}

type ExpTypeComplex =
	| ExpTypeAll
	| ExpTypeValue
	| ExpTypeTypeComplex
	| ExpTypeFn
	| ExpTypeVector
	| ExpTypeTuple
	| ExpTypeHashMap
	| ExpTypeUnion

type ExpTypeN = ExpConst | ExpValue | ExpTypeComplex

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

const TypeAll: ExpTypeAll = {
	literal: 'type',
	kind: 'all',
	create: createFn(
		(v: ExpForm = createNull()) => v,
		createTypeFn([], {literal: 'type', kind: 'all'})
	),
}

const TypeBoolean = uniteType(
	[createBoolean(false), createBoolean(true)],
	false
)

const TypeConst = uniteType([createNull(), TypeBoolean])

const TypeNumber: ExpTypeValue = {
	literal: 'type',
	kind: 'value',
	identifier: 'number',
	create: createFn(
		(v: ExpNumber = createNumber(0)) => v,
		createTypeFn([], {
			literal: 'type',
			kind: 'value',
			identifier: 'number',
		})
	),
}

const TypeString: ExpTypeValue = {
	literal: 'type',
	kind: 'value',
	identifier: 'string',
	create: createFn(
		(v: ExpString = createString('')) => v,
		createTypeFn([], {
			literal: 'type',
			kind: 'value',
			identifier: 'string',
		})
	),
}

const TypeValue = uniteType([TypeNumber, TypeString])

const TypeTypeComplex: ExpTypeTypeComplex = {
	literal: 'type',
	kind: 'type',
	create: createFn(
		() => TypeAll,
		createTypeFn([], {
			literal: 'type',
			kind: 'type',
		})
	),
}

const TypeTypeN = uniteType([TypeConst, TypeValue, TypeTypeComplex])

function createTypeVector(items: ExpTypeN): ExpTypeVector {
	return {
		literal: 'type',
		kind: 'vector',
		items,
	}
}

function createTypeTuple(items: ExpTypeN[]): ExpTypeN {
	switch (items.length) {
		case 0:
			return TypeAll
		case 1:
			return items[0]
		default:
			return {
				literal: 'type',
				kind: 'tuple',
				items,
			}
	}
}

const TypeHashMap = createFn(
	createTypeHashMap,
	createTypeFn([TypeTypeComplex], TypeTypeComplex)
)

function createTypeHashMap(items: ExpTypeN): ExpTypeHashMap {
	return {
		literal: 'type',
		kind: 'hashMap',
		items,
	}
}

const TypeFn = createFn(
	(params: ExpVector<ExpTypeComplex>, out: ExpTypeComplex) =>
		createTypeFn(params.value, out),
	createTypeFn(
		[createTypeVector(TypeTypeComplex), TypeTypeComplex],
		TypeTypeComplex
	)
)

function createTypeFn(
	params: ExpTypeN[],
	out: ExpTypeN,
	variadic = false
): ExpTypeFn {
	if (variadic) {
		const fixedParams = params.slice(0, -1)
		const lastParam = params[params.length - 1]
		if (lastParam.literal !== 'type' || lastParam.kind !== 'vector') {
			throw new Error('Last parameter is not a vector type')
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

function equalType(a: ExpTypeN, b: ExpTypeN): boolean {
	if (a === b) {
		return true
	}

	switch (a.literal) {
		case 'const':
		case 'value':
			return equalExp(a, b)
		case 'type':
			if (b.literal !== 'type') {
				return false
			}
			switch (a.kind) {
				case 'all':
					return b.kind === 'all'
				case 'value':
					return b.kind === 'value' && a.identifier === b.identifier
				case 'type':
					return b.kind === 'type'
				case 'union': {
					if (b.kind !== 'union') return false
					if (a.items.length !== b.items.length) {
						return false
					}
					return _.differenceWith(a.items, b.items, equalType).length === 0
				}
				case 'vector':
				case 'hashMap':
					return b.kind === a.kind && equalType(a.items, b.items)
				case 'tuple':
					return (
						b.kind === 'tuple' &&
						a.items.length === b.items.length &&
						_.zipWith(a.items, b.items, equalType).every(_.identity)
					)
				case 'fn':
					return (
						b.kind === 'fn' &&
						a.params.length === b.params.length &&
						equalType(a.out, b.out) &&
						_.zipWith(a.params, b.params, equalType).every(_.identity)
					)
				// default:
				// 	throw new Error('Cannot determine equality of this two types')
			}
	}
}

function containsType(outer: ExpTypeN, inner: ExpTypeN): boolean {
	if (outer === inner) {
		return true
	}

	if (outer.literal === 'const' || outer.literal === 'value') {
		return equalExp(outer, inner)
	}

	switch (outer.kind) {
		case 'all':
			return true
		case 'value':
			if (inner.literal === 'value') {
				return outer.identifier === inner.unionOf
			}
			if (inner.literal === 'type' && inner.kind === 'union') {
				return inner.items.every(ii => containsType(outer, ii))
			}
			return false
		case 'type':
			return inner.literal === 'type'
		case 'union': {
			const innerItems =
				inner.literal === 'type' && inner.kind === 'union'
					? inner.items
					: [inner]
			if (outer.items.length < innerItems.length) {
				return false
			}
			return innerItems.every(ii =>
				outer.items.find(oi => containsType(oi, ii))
			)
		}
		case 'vector':
		case 'hashMap':
			return (
				inner.literal === 'type' &&
				inner.kind === outer.kind &&
				containsType(outer.items, inner.items)
			)
		case 'tuple':
			return (
				inner.literal === 'type' &&
				inner.kind === 'tuple' &&
				outer.items.length < inner.items.length &&
				_.zipWith(
					outer.items.slice(0, inner.items.length),
					inner.items,
					equalType
				).every(_.identity)
			)
		case 'fn':
			return (
				inner.literal === 'type' &&
				inner.kind === 'fn' &&
				outer.params.length > inner.params.length &&
				containsType(outer.out, outer.out) &&
				_.zipWith(
					outer.params.slice(0, inner.params.length),
					inner.params,
					containsType
				).every(_.identity)
			)
	}
}

function uniteType(items: ExpTypeN[], destructive = true): ExpTypeN {
	const unionType = items.reduce((a, b) => {
		if (containsType(a, b)) {
			return a
		}
		if (containsType(b, a)) {
			return b
		}

		const aItems =
			a.literal === 'type' && a.kind === 'union' && a.destructive
				? a.items
				: [a]
		const bItems =
			b.literal === 'type' && b.kind === 'union' && b.destructive
				? b.items
				: [b]

		return {
			literal: 'type',
			kind: 'union',
			items: [...aItems, ...bItems],
			destructive: true,
		}
	})

	if (unionType.literal === 'type' && unionType.kind === 'union') {
		return {...unionType, destructive}
	}

	return unionType
}

const ReservedSymbols: {[name: string]: ExpForm} = {
	null: createNull(),
	true: createBoolean(true),
	false: createBoolean(false),
	inf: createNumber(Infinity),
	'-inf': createNumber(-Infinity),
	nan: createNumber(NaN),
	All: TypeAll,
	Boolean: TypeBoolean,
	Number: TypeNumber,
	String: TypeString,
	Type: TypeTypeN,
	TypeComplex: TypeTypeComplex,
	'->': TypeFn,
	Vector: createFn(createTypeVector, createTypeFn([TypeTypeN], TypeTypeN)),
	Tuple: createFn(
		(items: ExpVector<ExpTypeN>) => createTypeTuple(items.value),
		createTypeFn([createTypeVector(TypeTypeN)], TypeTypeN, true)
	),
	HashMap: TypeHashMap,
	Union: createFn(
		(items: ExpVector<ExpTypeN>) => uniteType(items.value),
		createTypeFn([createTypeVector(TypeTypeN)], TypeTypeN, true)
	),
	let: createFn(
		(_, body: ExpForm) => body,
		createTypeFn([createTypeHashMap(TypeAll), TypeAll], TypeAll)
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
			createTypeFn([TypeAll], TypeTypeN)
		),
		'cast-type': createFn(function (target: any, candidate: any) {
			return castType(target, candidate) || createNull()
		}, createTypeFn([TypeTypeN, TypeTypeN], TypeTypeN)),
		'equal-type': createFn(function (a: any, b: any) {
			return createBoolean(equalType(a, b))
		}, createTypeFn([TypeTypeN, TypeTypeN], TypeBoolean)),
		'contains-type': createFn(
			(a: any, b: any) => createBoolean(containsType(a, b)),
			createTypeFn([TypeTypeN, TypeTypeN], TypeBoolean)
		),
		literal: createFn(
			(v: any) => createString(v.literal),
			createTypeFn([TypeAll], TypeString)
		),
	})
)

function getIntrinsticType(exp: ExpForm): ExpTypeN {
	switch (exp.literal) {
		case 'const':
			if (exp.value === null) {
				return exp
			} else if (typeof exp.value === 'boolean') {
				return TypeBoolean
			}
			throw new Error('Invalid type of const')
		case 'value':
			switch (exp.unionOf) {
				case 'number':
					return TypeNumber
				case 'string':
					return TypeString
				default:
					throw new Error('Invalid unionOf type')
			}
		case 'type':
			return TypeTypeComplex
		case 'list': {
			let fnType = resolveType(exp.value[0])
			if (fnType.literal !== 'type') {
				throw new Error('First element must be a function')
			}
			if (fnType.create) {
				fnType = resolveType(fnType.create)
			}
			if (fnType.literal === 'type' && fnType.kind === 'fn') {
				return fnType.out
			}
			throw new Error('First element of list is not callable (resolve)')
		}
		case 'vector': {
			const itemsTypes = exp.value.map(resolveType)
			const items = uniteType(itemsTypes)
			return createTypeVector(items)
		}
		case 'hashMap': {
			const itemsTypes = Object.values(exp.value).map(resolveType)
			const items = uniteType(itemsTypes)
			return createTypeHashMap(items)
		}
		default:
			return TypeAll
	}
}

function resolveType(exp: ExpForm): ExpTypeN {
	let expType: ExpTypeN = TypeAll

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

	if (expType.kind === 'all') {
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

function equalExp(a: ExpForm, b: ExpForm) {
	if (a.literal === 'const') {
		return b.literal === 'const' && a.value === b.value
	}

	if (a.literal === 'value') {
		return (
			b.literal === 'value' && a.unionOf === b.unionOf && a.value === b.value
		)
	}

	return false
}

function castType(base: ExpTypeN, target: ExpTypeN): ExpTypeN | null {
	if (equalType(base, target)) {
		return target
	}

	if (containsType(target, base)) {
		return base
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
			case 'const':
			case 'value':
			case 'type':
			case 'fn':
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
								Array(paramsLength).fill(TypeAll),
								TypeAll
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

				if (fnType.literal !== 'type' || fnType.kind !== 'fn') {
					throw new Error(`Not a fn type but ${printExp(fnType)}`)
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
						uniteType(paramsType.slice(minParamLen))
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
					if (!castType(paramsType[i], paramDefType)) {
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
function createNull(): ExpConst {
	return {literal: 'const', value: null}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		literal: 'const',
		value,
		unionOf: 'boolean',
	}
}

function createNumber(value: number): ExpNumber {
	return {
		literal: 'value',
		unionOf: 'number',
		value,
	}
}

function createString(value: string): ExpString {
	return {
		literal: 'value',
		unionOf: 'string',
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
	type?: ExpTypeFn
): ExpFn {
	const fn: ExpFn = {
		literal: 'fn',
		value: typeof value === 'string' ? eval(value) : value,
	}

	if (type) {
		fn.type = {value: type}
		type.parent = fn
	} else {
		fn.type = {value: createTypeFn(Array(value.length).fill(TypeAll), TypeAll)}
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
			return {literal: 'value', unionOf: 'string', value}
		}
	}

	function printWithoutType(exp: ExpForm): string {
		switch (exp.literal) {
			case 'const':
				if (exp.value === null) {
					return 'null'
				} else if (typeof exp.value === 'boolean') {
					return exp.value ? 'true' : 'false'
				}
				throw new Error('cannot print this type of const')
			case 'value':
				switch (exp.unionOf) {
					case 'number': {
						if (exp.str) {
							return exp.str
						}
						const str = exp.value.toString()
						switch (str) {
							case 'Infinity':
								return 'inf'
							case '-Infinity':
								return '-inf'
							case 'NaN':
								return 'nan'
						}
						return str
					}
					case 'string':
						return `"${exp.value}"`
					default:
						throw new Error('Cannot print this type of "unionOf"')
				}
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
				return printTypeComplex(exp)
			default:
				throw new Error('Invalid type of Exp')
		}
	}

	function printTypeComplex(exp: ExpTypeComplex) {
		switch (exp.kind) {
			case 'all':
				return 'All'
			case 'value':
				switch (exp.identifier) {
					case 'number':
						return 'Number'
					case 'string':
						return 'String'
					default:
						throw new Error('Cannot print this InfUnion')
				}
			case 'fn': {
				const params = exp.params.map(printWithoutType).join(' ')
				const out = printWithoutType(exp.out)
				return `(-> [${params}] ${out})`
			}
			case 'vector':
				return `(Vector ${printWithoutType(exp.items)})`
			case 'tuple': {
				const items = exp.items.map(printWithoutType).join(' ')
				return `(Tuple ${items})`
			}
			case 'hashMap': {
				return `(HashMap ${printWithoutType(exp.items)})`
			}
			case 'union': {
				if (equalType(exp, TypeBoolean)) {
					return 'Boolean'
				}
				const items = exp.items.map(printWithoutType).join(' ')
				return `(Union ${items})`
			}
			case 'type':
				return 'Type'
			default:
				console.log(exp)
				throw new Error('Cannot print this kind of type')
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
