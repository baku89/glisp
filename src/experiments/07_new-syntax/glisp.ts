import deepClone from 'deep-clone'
import _ from 'lodash'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^#?[a-z_+\-*/=?|<>][0-9a-z_+\-*/=?|<>]*$/i

type ExpForm =
	| ExpConst
	| ExpInfUnionValue
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
	literal: 'infUnionValue'
	unionOf: 'number'
	value: number
	str?: string
}

interface ExpString extends ExpBase {
	literal: 'infUnionValue'
	unionOf: 'string'
	value: string
}

type ExpInfUnionValue = ExpNumber | ExpString

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
interface ExpTypeBase extends ExpBase {
	literal: 'type'
	create?: ExpFn
	meta?: ExpHashMap
}

interface ExpTypeAll extends ExpTypeBase {
	kind: 'all'
}

interface ExpTypeValue extends ExpTypeBase {
	kind: 'infUnionValue'
	identifier: ExpBoolean['unionOf'] | ExpInfUnionValue['unionOf']
}

interface ExpTypeType extends ExpTypeBase {
	kind: 'type'
}

interface ExpTypeFnFixed extends ExpTypeBase {
	kind: 'fn'
	params: ExpTypeN[]
	out: ExpTypeN
	variadic?: false
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

interface ExpTypeFnVariadic extends ExpTypeBase {
	kind: 'fn'
	params: [...ExpTypeN[], ExpTypeVector]
	out: ExpTypeN
	variadic: true
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

type ExpTypeFn = ExpTypeFnFixed | ExpTypeFnVariadic

interface ExpTypeVector extends ExpTypeBase {
	kind: 'vector'
	items: ExpTypeN
}

interface ExpTypeTuple extends ExpTypeBase {
	kind: 'tuple'
	items: ExpTypeN[]
}

interface ExpTypeHashMap extends ExpTypeBase {
	kind: 'hashMap'
	items: ExpTypeN
}

interface ExpTypeUnion extends ExpTypeBase {
	kind: 'union'
	items: ExpTypeN[]
}

type ExpType =
	| ExpTypeAll
	| ExpTypeValue
	| ExpTypeType
	| ExpTypeFn
	| ExpTypeVector
	| ExpTypeTuple
	| ExpTypeHashMap
	| ExpTypeUnion

type ExpTypeN = ExpConst | ExpInfUnionValue | ExpType

type IExpFnValue = (...params: ExpForm[]) => ExpForm

// type IExpFnValue =
// 	| ((...params: ExpForm[]) => ExpForm)
// 	| (<P0 extends ExpForm, O extends ExpForm = ExpForm>(p0: P0) => O)
// 	| (<P0 extends ExpForm, P1 extends ExpForm, O extends ExpForm>(
// 			p0: P0,
// 			p1: P1
// 	  ) => O)
// 	| (<
// 			P0 extends ExpForm,
// 			P1 extends ExpForm,
// 			P2 extends ExpForm,
// 			O extends ExpForm
// 	  >(
// 			p0: P0,
// 			p1: P1,
// 			p2: P2
// 	  ) => O)

interface ExpFn extends ExpBase {
	literal: 'fn'
	value: IExpFnValue
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

const ConstTrue = createBoolean(true)
const ConstFalse = createBoolean(false)
const TypeBoolean = uniteType([ConstFalse, ConstTrue])

const TypeFalsy = uniteType([
	ConstFalse,
	createNull(),
	createNumber(0),
	createString(''),
])

const TypeConst = uniteType([createNull(), TypeBoolean])

const TypeNumber: ExpTypeValue = {
	literal: 'type',
	kind: 'infUnionValue',
	identifier: 'number',
	create: createFn(
		(v: ExpNumber = createNumber(0)) => v,
		createTypeFn([], {
			literal: 'type',
			kind: 'infUnionValue',
			identifier: 'number',
		})
	),
}

const TypeString: ExpTypeValue = {
	literal: 'type',
	kind: 'infUnionValue',
	identifier: 'string',
	create: createFn(
		(v: ExpString = createString('')) => v,
		createTypeFn([], {
			literal: 'type',
			kind: 'infUnionValue',
			identifier: 'string',
		})
	),
}

const TypeValue = uniteType([TypeNumber, TypeString])

const TypeType: ExpTypeType = {
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

const TypeTypeOrValue = uniteType([TypeConst, TypeValue, TypeType])

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
	createTypeFn([TypeType], TypeType)
)

function createTypeHashMap(items: ExpTypeN): ExpTypeHashMap {
	return {
		literal: 'type',
		kind: 'hashMap',
		items,
	}
}

const TypeFn = createFn(
	(params: ExpVector<ExpType>, out: ExpType) => createTypeFn(params.value, out),
	createTypeFn([createTypeVector(TypeType), TypeType], TypeType)
)

function createTypeFn(
	params: ExpTypeN[],
	out: ExpTypeN,
	{
		variadic = false,
		lazyEval = undefined as undefined | boolean[],
		lazyInfer = undefined as undefined | boolean[],
	} = {}
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
			lazyEval,
			lazyInfer,
		}
	}

	return {
		literal: 'type',
		kind: 'fn',
		params,
		out,
		variadic,
		lazyEval,
		lazyInfer,
	}
}

function equalType(a: ExpTypeN, b: ExpTypeN): boolean {
	if (a === b) {
		return true
	}

	switch (a.literal) {
		case 'const':
		case 'infUnionValue':
			return equalExp(a, b)
		case 'type':
			if (b.literal !== 'type') {
				return false
			}
			switch (a.kind) {
				case 'all':
					return b.kind === 'all'
				case 'infUnionValue':
					return b.kind === 'infUnionValue' && a.identifier === b.identifier
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
						!!a.variadic === !!b.variadic &&
						equalType(a.out, b.out) &&
						_.zipWith(a.params, b.params, equalType).every(_.identity)
					)
				// default:
				// 	throw new Error('Cannot determine equality of this two types')
			}
	}
}

function isSubsetType(outer: ExpTypeN, inner: ExpTypeN): boolean {
	if (outer === inner) {
		return true
	}

	if (outer.literal === 'const' || outer.literal === 'infUnionValue') {
		return equalExp(outer, inner)
	}

	switch (outer.kind) {
		case 'all':
			return true
		case 'infUnionValue':
			if (inner.literal === 'infUnionValue') {
				return outer.identifier === inner.unionOf
			}
			if (inner.literal === 'type' && inner.kind === 'union') {
				return inner.items.every(ii => isSubsetType(outer, ii))
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
				outer.items.find(oi => isSubsetType(oi, ii))
			)
		}
		case 'vector':
		case 'hashMap':
			return (
				inner.literal === 'type' &&
				inner.kind === outer.kind &&
				isSubsetType(outer.items, inner.items)
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
				isSubsetType(outer.out, outer.out) &&
				_.zipWith(
					outer.params.slice(0, inner.params.length),
					inner.params,
					isSubsetType
				).every(_.identity)
			)
	}
}

function uniteType(items: ExpTypeN[]): ExpTypeN {
	if (items.length === 0) {
		return TypeAll
	}

	const unionType = items.reduce((a, b) => {
		if (isSubsetType(a, b)) {
			return a
		}
		if (isSubsetType(b, a)) {
			return b
		}

		const aItems = a.literal === 'type' && a.kind === 'union' ? a.items : [a]
		const bItems = b.literal === 'type' && b.kind === 'union' ? b.items : [b]

		return {
			literal: 'type',
			kind: 'union',
			items: [...aItems, ...bItems],
		}
	})

	if (unionType.literal === 'type' && unionType.kind === 'union') {
		return {...unionType}
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
	Type: TypeType,
	TypeOrValue: TypeTypeOrValue,
	Falsy: TypeFalsy,
	':=>': TypeFn,
	':Vector': createFn(
		createTypeVector,
		createTypeFn([TypeTypeOrValue], TypeTypeOrValue)
	),
	':Tuple': createFn(
		(items: ExpVector<ExpTypeN>) => createTypeTuple(items.value),
		createTypeFn([createTypeVector(TypeTypeOrValue)], TypeTypeOrValue, {
			variadic: true,
		})
	),
	':HashMap': TypeHashMap,
	':|': createFn(
		(items: ExpVector<ExpTypeN>) => uniteType(items.value),
		createTypeFn([createTypeVector(TypeTypeOrValue)], TypeTypeOrValue, {
			variadic: true,
		})
	),
	let: createFn(
		(_: ExpHashMap, body: ExpForm) => body,
		createTypeFn([createTypeHashMap(TypeAll), TypeAll], TypeAll)
	),
}

const GlobalScope = createList(
	createSymbol('let'),
	createHashMap({
		PI: createNumber(Math.PI),
		'+': createFn(
			(value: ExpVector<ExpNumber>) =>
				createNumber(value.value.reduce((sum, {value}) => sum + value, 0)),
			createTypeFn([createTypeVector(TypeNumber)], TypeNumber, {variadic: true})
		),
		square: createFn(
			(v: ExpNumber) => createNumber(v.value * v.value),
			createTypeFn([TypeNumber], TypeNumber)
		),
		not: createFn(
			(v: ExpBoolean) => createBoolean(!v.value),
			createTypeFn([TypeBoolean], TypeBoolean)
		),
		':infer': createFn(
			(v: ExpForm) => inferType(v),
			createTypeFn([TypeAll], TypeTypeOrValue)
		),
		'::?': createFn(
			(target: any, candidate: any) =>
				castType(target, candidate) || createNull(),
			createTypeFn([TypeTypeOrValue, TypeTypeOrValue], TypeTypeOrValue)
		),
		'==': createFn(
			(a: ExpForm, b: ExpForm) => createBoolean(equalExp(a, b)),
			createTypeFn([TypeAll, TypeAll], TypeBoolean)
		),
		':>=': createFn(
			(a: ExpType, b: ExpType) => createBoolean(isSubsetType(a, b)),
			createTypeFn([TypeTypeOrValue, TypeTypeOrValue], TypeBoolean)
		),
		if: createFn(
			(cond: ExpForm, then: ExpForm, _else: ExpForm) => {
				if (
					cond.literal !== 'const' &&
					cond.literal !== 'infUnionValue' &&
					cond.literal !== 'type'
				) {
					return then
				}
				return isSubsetType(TypeFalsy, cond) ? _else : then
			},
			createTypeFn([TypeAll, TypeAll, TypeAll], TypeAll, {
				lazyEval: [false, true, true],
			})
		),
		literal: createFn(
			(v: ExpForm) => createString(v.literal),
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
		case 'infUnionValue':
			switch (exp.unionOf) {
				case 'number':
					return TypeNumber
				case 'string':
					return TypeString
				default:
					throw new Error('Invalid unionOf type')
			}
		case 'type':
			return TypeType
		case 'list': {
			let fnType = inferType(exp.value[0])
			if (fnType.literal !== 'type') {
				throw new Error('First element must be a function')
			}
			if (fnType.create) {
				fnType = inferType(fnType.create)
			}
			if (fnType.literal === 'type' && fnType.kind === 'fn') {
				return fnType.out
			}
			throw new Error('First element of list is not callable (resolve)')
		}
		case 'vector': {
			const itemsTypes = exp.value.map(inferType)
			const items = uniteType(itemsTypes)
			return createTypeVector(items)
		}
		case 'hashMap': {
			const itemsTypes = Object.values(exp.value).map(inferType)
			const items = uniteType(itemsTypes)
			return createTypeHashMap(items)
		}
		default:
			return TypeAll
	}
}

function inferType(exp: ExpForm): ExpTypeN {
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
	switch (a.literal) {
		case 'const':
		case 'symbol':
			return a.literal === b.literal && a.value === b.value
		case 'infUnionValue':
			return (
				b.literal === 'infUnionValue' &&
				a.unionOf === b.unionOf &&
				a.value === b.value
			)
		case 'type':
			return b.literal === 'type' && equalType(a, b)
	}

	return false
}

function castType(base: ExpTypeN, target: ExpTypeN): ExpTypeN | null {
	if (equalType(base, target)) {
		return target
	}

	if (isSubsetType(target, base)) {
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

export class Interpreter {
	private scope: ExpList
	private vars: ExpHashMap

	constructor() {
		const defType = createTypeFn([TypeString, TypeAll], TypeAll, {
			lazyEval: [true, true],
			lazyInfer: [true, false],
		})

		this.vars = createHashMap({})
		this.vars.value['def'] = createFn((sym: ExpSymbol, value: ExpForm) => {
			this.vars.value[sym.value] = value
			value.parent = this.vars
			return value
		}, defType)

		this.scope = createList(createSymbol('let'), this.vars)
		this.scope.parent = GlobalScope
	}

	evalExp(exp: ExpForm): ExpForm {
		return evalExp(exp, this.scope)
	}
}

export function evalExp(
	exp: ExpForm,
	parent: ExpBase['parent'] = GlobalScope
): ExpForm {
	exp.parent = parent
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
			case 'infUnionValue':
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
						case '=>': {
							// Create a function
							const [paramsDef, bodyDef] = rest

							// Validate parameter part
							if (paramsDef.literal !== 'vector') {
								const str = printExp(paramsDef)
								throw new Error(`Function parameters '${str}' must be a vector`)
							}

							const nonSymbol = paramsDef.value.find(
								p => p.literal !== 'symbol'
							)
							if (nonSymbol) {
								throw new Error(
									`Parameter '${printExp(nonSymbol)}' must be a symbol`
								)
							}

							const paramSymbols = paramsDef.value as ExpSymbol[]

							// Find duplicated symbols
							const uniqSymbols = _.uniqWith(paramSymbols, equalExp)

							if (uniqSymbols.length !== paramSymbols.length) {
								const duplicatedSymbols = uniqSymbols.flatMap(sym =>
									paramSymbols.filter(p => equalExp(sym, p)).length > 1
										? [sym]
										: []
								)
								const str = duplicatedSymbols
									.map(printExp)
									.map(s => `'${s}'`)
									.join(', ')
								throw new Error(
									`Duplicated symbols ${str} has found in parameter`
								)
							}

							// Create scope
							const paramsHashMap = createHashMap(
								Object.fromEntries(paramSymbols.map(sym => [sym.value, sym]))
							)

							const fnScope = createList(
								createSymbol('let'),
								paramsHashMap,
								cloneExp(bodyDef)
							)

							fnScope.parent = exp.parent

							// Define function
							const fn = (...params: ExpForm[]) => {
								// Set params
								paramSymbols.forEach(
									(sym, i) => (paramsHashMap.value[sym.value] = params[i])
								)

								// Evaluate
								const out = evalWithTrace(fnScope, trace)

								// Clean params
								paramSymbols.forEach(sym =>
									clearEvaluated(paramsHashMap.value[sym.value])
								)

								return out
							}

							// Infer function type
							const outType = inferType(bodyDef)

							const fnType = createTypeFn(
								Array(paramSymbols.length).fill(TypeAll),
								outType
							)

							return (exp.evaluated = createFn(fn, fnType))
						}
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
				const fnType = inferType(fn)

				if (fnType.literal !== 'type' || fnType.kind !== 'fn') {
					throw new Error(`Not a fn type but ${printExp(fnType)}`)
				}

				const paramsDefType = fnType.params
				const paramsType = rest.map((r, i) =>
					fnType.lazyInfer && fnType.lazyInfer[i]
						? paramsDefType[i]
						: inferType(r)
				)

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

				// Cast check
				paramsDefType.forEach((paramDefType, i) => {
					if (!castType(paramsType[i], paramDefType)) {
						const paramTypeStr = printExp(paramsType[i])
						const paramDefTypeStr = printExp(paramDefType)
						throw new Error(
							`Type '${paramTypeStr}' is not assignable to type '${paramDefTypeStr}'`
						)
					}
				})

				const evaluatedRest = rest
					.slice(0, paramsDefType.length)
					.map((p, i) =>
						fnType.lazyEval && fnType.lazyEval[i] ? p : evalWithTrace(p, trace)
					)

				const expanded = fn.value(...evaluatedRest)

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
		literal: 'infUnionValue',
		unionOf: 'number',
		value,
	}
}

function createString(value: string): ExpString {
	return {
		literal: 'infUnionValue',
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
			return {literal: 'infUnionValue', unionOf: 'string', value}
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
			case 'infUnionValue':
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
				return printType(exp)
			default:
				throw new Error('Invalid type of Exp')
		}
	}

	function printType(exp: ExpType): string {
		switch (exp.kind) {
			case 'all':
				return 'All'
			case 'infUnionValue':
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
				return `(:=> [${params}] ${out})`
			}
			case 'vector':
				return `(:Vector ${printWithoutType(exp.items)})`
			case 'tuple': {
				const items = exp.items.map(printWithoutType).join(' ')
				return `(:Tuple ${items})`
			}
			case 'hashMap': {
				return `(:HashMap ${printWithoutType(exp.items)})`
			}
			case 'union': {
				if (equalType(exp, TypeBoolean)) {
					return 'Boolean'
				}

				const itemTrue = exp.items.find(it => equalType(it, ConstTrue))
				const itemFalse = exp.items.find(it => equalType(it, ConstFalse))

				if (itemTrue && itemFalse) {
					return printType({
						...exp,
						items: [
							..._.difference(exp.items, [itemTrue, itemFalse]),
							TypeBoolean,
						],
					})
				}

				const items = exp.items.map(printWithoutType).join(' ')
				return `(:| ${items})`
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
