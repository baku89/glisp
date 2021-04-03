import deepClone from 'deep-clone'
import _ from 'lodash'
import peg from 'pegjs'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^(:?[a-z_+\-*/=?|<>][0-9a-z_+\-*/=?|<>]*)|(...)$/i

type ExpForm =
	| ExpConst
	| ExpInfUnionValue
	| ExpSymbol
	| ExpList
	| ExpVector
	| ExpHashMap
	| ExpFn
	| ExpType

interface ExpBase {
	parent?: ExpList | ExpVector | ExpHashMap | ExpFn
	type?: {
		value: ExpType | ExpSymbol
		delimiters?: string[]
	}
	dep?: Set<ExpSymbol | ExpList>
}

interface ExpProgram {
	ast: 'program'
	value: ExpForm
	delimiters: [string, string]
}

interface ExpNull extends ExpBase {
	ast: 'const'
	value: null
}

interface ExpBoolean extends ExpBase {
	ast: 'const'
	value: boolean
	subsetOf: 'boolean'
}

interface ExpReservedKeyword<
	T extends '|' | '&' | '...' | '=' = '|' | '&' | '...' | '='
> extends ExpBase {
	ast: 'const'
	value: T
	subsetOf: 'reservedKeyword'
}

type ExpConst = ExpNull | ExpBoolean | ExpReservedKeyword

interface ExpNumber extends ExpBase {
	ast: 'infUnionValue'
	subsetOf: 'number'
	value: number
	str?: string
}

interface ExpString extends ExpBase {
	ast: 'infUnionValue'
	subsetOf: 'string'
	value: string
}

type ExpInfUnionValue = ExpNumber | ExpString

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	value: string
	str?: string
	ref?: ExpForm
	evaluated?: ExpForm
}

interface ExpList extends ExpBase {
	ast: 'list'
	value: ExpForm[]
	delimiters?: string[]
	expanded?: ExpForm
	evaluated?: ExpForm
}

interface ExpVector<T extends ExpForm = ExpForm> extends ExpBase {
	ast: 'vector'
	value: T[]
	delimiters?: string[]
	evaluated?: ExpVector
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
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
	ast: 'type'
	create?: ExpFn
	meta?: ExpHashMap
}

interface ExpTypeAll extends ExpTypeBase {
	kind: 'all'
}

interface ExpTypeInfUnion extends ExpTypeBase {
	kind: 'infUnion'
	id: ExpBoolean['subsetOf'] | ExpInfUnionValue['subsetOf']
}

interface ExpTypeType extends ExpTypeBase {
	kind: 'type'
}

interface ExpTypeFnFixed extends ExpTypeBase {
	kind: 'fn'
	params: ExpForm[]
	out: ExpForm
	variadic?: false
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

interface ExpTypeFnVariadic extends ExpTypeBase {
	kind: 'fn'
	params: [...ExpForm[], ExpTypeVector]
	out: ExpForm
	variadic: true
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

type ExpTypeFn = ExpTypeFnFixed | ExpTypeFnVariadic

interface ExpTypeVector extends ExpTypeBase {
	kind: 'vector'
	items: ExpForm
}

interface ExpTypeHashMap extends ExpTypeBase {
	kind: 'hashMap'
	items: ExpForm
}

interface ExpTypeUnion extends ExpTypeBase {
	kind: 'union'
	items: ExpForm[]
}

type ExpType =
	| ExpTypeAll
	| ExpTypeInfUnion
	| ExpTypeType
	| ExpTypeFn
	| ExpTypeVector
	| ExpTypeHashMap
	| ExpTypeUnion

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
	ast: 'fn'
	value: IExpFnValue
}

export function readStr(str: string): ExpForm {
	const exp = parser.parse(str) as ExpProgram
	return exp.value
}

const TypeAll: ExpTypeAll = {
	ast: 'type',
	kind: 'all',
	create: createFn(
		(v: ExpForm = createNull()) => v,
		createTypeFn([], {ast: 'type', kind: 'all'})
	),
}

const ConstTrue = createBoolean(true)
const ConstFalse = createBoolean(false)
const TypeBoolean = uniteType([ConstFalse, ConstTrue])

const ConstReservedKeywordRest = createReservedKeyword('...')

const TypeFalsy = uniteType([
	ConstFalse,
	createNull(),
	createNumber(0),
	createString(''),
])

const TypeConst = uniteType([createNull(), TypeBoolean])

const TypeNumber: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	id: 'number',
	create: createFn(
		(v: ExpNumber = createNumber(0)) => v,
		createTypeFn([], {
			ast: 'type',
			kind: 'infUnion',
			id: 'number',
		})
	),
}

const TypeString: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	id: 'string',
	create: createFn(
		(v: ExpString = createString('')) => v,
		createTypeFn([], {
			ast: 'type',
			kind: 'infUnion',
			id: 'string',
		})
	),
}

const TypeValue = uniteType([TypeNumber, TypeString])

const TypeType: ExpTypeType = {
	ast: 'type',
	kind: 'type',
	create: createFn(
		() => TypeAll,
		createTypeFn([], {
			ast: 'type',
			kind: 'type',
		})
	),
}

const TypeTypeOrValue = uniteType([TypeConst, TypeValue, TypeType])

function createTypeVector(items: ExpForm): ExpTypeVector {
	return {
		ast: 'type',
		kind: 'vector',
		items,
	}
}

const TypeHashMap = createFn(
	createTypeHashMap,
	createTypeFn([TypeType], TypeType)
)

function createTypeHashMap(items: ExpForm): ExpTypeHashMap {
	return {
		ast: 'type',
		kind: 'hashMap',
		items,
	}
}

const TypeFn = createFn(
	(params: ExpVector<ExpType | ExpReservedKeyword<'...'>>, out: ExpType) => {
		const paramTypes = params.value

		// Rest argument
		let variadic = false
		const restSymbolIndices = _.chain(paramTypes)
			.map((p, i) => (equalExp(ConstReservedKeywordRest, p) ? i : null))
			.filter(_.isNumber)
			.value()

		if (restSymbolIndices.length > 1) {
			throw new Error("Rest symbol '...' appears more than twice")
		} else if (restSymbolIndices.length === 1) {
			const restIndex = restSymbolIndices[0]

			if (restIndex !== paramTypes.length - 2) {
				throw new Error("Invalid position of rest symbol '...'")
			}

			const lastType = paramTypes.slice(-1)[0]

			paramTypes.splice(-2, 2, createTypeVector(lastType))
			variadic = true
		}

		return createTypeFn(params.value, out, {variadic})
	},
	createTypeFn(
		[
			createTypeVector(uniteType([TypeType, ConstReservedKeywordRest])),
			TypeType,
		],
		TypeType
	)
)

function createTypeFn(
	params: ExpForm[],
	out: ExpForm,
	{
		variadic = false,
		lazyEval = undefined as undefined | boolean[],
		lazyInfer = undefined as undefined | boolean[],
	} = {}
): ExpTypeFn {
	if (variadic) {
		const fixedParams = params.slice(0, -1)
		const lastParam = params[params.length - 1]
		if (lastParam.ast !== 'type' || lastParam.kind !== 'vector') {
			throw new Error('Last parameter is not a vector type')
		}

		return {
			ast: 'type',
			kind: 'fn',
			params: [...fixedParams, lastParam],
			out,
			variadic,
			lazyEval,
			lazyInfer,
		}
	}

	return {
		ast: 'type',
		kind: 'fn',
		params,
		out,
		variadic,
		lazyEval,
		lazyInfer,
	}
}

function containsExp(outer: ExpForm, inner: ExpForm): boolean {
	if (outer === inner) {
		return true
	}

	if (outer.ast === 'vector') {
		return (
			inner.ast === 'vector' &&
			outer.value.length >= inner.value.length &&
			_.zipWith(
				outer.value.slice(0, inner.value.length),
				inner.value,
				containsExp
			).every(_.identity)
		)
	}

	if (outer.ast === 'hashMap') {
		if (inner.ast !== 'hashMap') return false
		return (
			inner.ast === 'hashMap' &&
			_.difference(_.keys(inner.value), _.keys(outer.value)).length === 0 &&
			_.toPairs(inner.value).every(([key, iv]) =>
				containsExp(outer.value[key], iv)
			)
		)
	}

	if (outer.ast !== 'type') {
		return equalExp(outer, inner)
	}

	switch (outer.kind) {
		case 'all':
			return true
		case 'infUnion':
			if (inner.ast === 'infUnionValue') {
				return outer.id === inner.subsetOf
			}
			if (inner.ast === 'type' && inner.kind === 'union') {
				return inner.items.every(ii => containsExp(outer, ii))
			}
			return false
		case 'type':
			return inner.ast === 'type'
		case 'union': {
			const innerItems =
				inner.ast === 'type' && inner.kind === 'union' ? inner.items : [inner]
			if (outer.items.length < innerItems.length) {
				return false
			}
			return innerItems.every(ii =>
				outer.items.find(_.partial(containsExp, _, ii))
			)
		}
		case 'vector':
		case 'hashMap':
			return (
				inner.ast === 'type' &&
				inner.kind === outer.kind &&
				containsExp(outer.items, inner.items)
			)
		case 'fn':
			return (
				inner.ast === 'type' &&
				inner.kind === 'fn' &&
				outer.params.length >= inner.params.length &&
				containsExp(outer.out, outer.out) &&
				_.zipWith(
					outer.params.slice(0, inner.params.length),
					inner.params,
					containsExp
				).every(_.identity)
			)
	}
}

function uniteType(items: ExpForm[]): ExpForm {
	if (items.length === 0) {
		return TypeAll
	}

	const unionType = items.reduce((a, b) => {
		if (containsExp(a, b)) {
			return a
		}
		if (containsExp(b, a)) {
			return b
		}

		const aItems = a.ast === 'type' && a.kind === 'union' ? a.items : [a]
		const bItems = b.ast === 'type' && b.kind === 'union' ? b.items : [b]

		return {
			ast: 'type',
			kind: 'union',
			items: [...aItems, ...bItems],
		}
	})

	if (unionType.ast === 'type' && unionType.kind === 'union') {
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
	'...': createSymbol('...'),
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
	':HashMap': TypeHashMap,
	':|': createFn(
		(items: ExpVector<ExpForm>) => uniteType(items.value),
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
			(a: ExpType, b: ExpType) => createBoolean(containsExp(a, b)),
			createTypeFn([TypeTypeOrValue, TypeTypeOrValue], TypeBoolean)
		),
		count: createFn(
			(a: ExpVector) => createNumber(a.value.length),
			createTypeFn([createTypeVector(TypeAll)], TypeNumber)
		),
		if: createFn(
			(cond: ExpForm, then: ExpForm, _else: ExpForm) => {
				if (
					cond.ast !== 'const' &&
					cond.ast !== 'infUnionValue' &&
					cond.ast !== 'type'
				) {
					return then
				}
				return containsExp(TypeFalsy, cond) ? _else : then
			},
			createTypeFn([TypeAll, TypeAll, TypeAll], TypeAll, {
				lazyEval: [false, true, true],
			})
		),
		ast: createFn(
			(v: ExpForm) => createString(v.ast),
			createTypeFn([TypeAll], TypeString)
		),
	})
)

function getIntrinsticType(exp: ExpForm): ExpForm {
	switch (exp.ast) {
		case 'const':
			if (exp.value === null) {
				return exp
			}
			switch (exp.subsetOf) {
				case 'boolean':
					return TypeBoolean
				case 'reservedKeyword':
					return exp
			}
			throw new Error('Invalid type of const')
		case 'infUnionValue':
			switch (exp.subsetOf) {
				case 'number':
					return TypeNumber
				case 'string':
					return TypeString
				default:
					console.log(exp)
					throw new Error(`Invalid subsetOf type`)
			}
		case 'type':
			return TypeType
		case 'list': {
			let fnType = inferType(exp.value[0])
			if (fnType.ast !== 'type') {
				throw new Error('First element must be a function')
			}
			if (fnType.create) {
				fnType = inferType(fnType.create)
			}
			if (fnType.ast === 'type' && fnType.kind === 'fn') {
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

function inferType(exp: ExpForm): ExpForm {
	let expType: ExpForm = TypeAll

	// Resolve the symbol first
	if (exp.ast === 'symbol') {
		exp = resolveSymbol(exp)
	}

	// Check if the expression itself has type
	if (exp.type) {
		const type: ExpForm = evalExp(exp.type.value)

		if (type.ast !== 'type') {
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
	switch (exp.ast) {
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

function equalExp(a: ExpForm, b: ExpForm): boolean {
	if (a === b) {
		return true
	}

	switch (a.ast) {
		case 'const':
		case 'symbol':
			return a.ast === b.ast && a.value === b.value
		case 'infUnionValue':
			return (
				b.ast === 'infUnionValue' &&
				a.subsetOf === b.subsetOf &&
				a.value === b.value
			)
		case 'type':
			return b.ast === 'type' && equalType(a, b)
		case 'list':
		case 'vector':
			return (
				a.ast === b.ast &&
				a.value.length === b.value.length &&
				_.zipWith(a.value, b.value, equalExp).every(_.identity)
			)
		case 'hashMap':
			return (
				a.ast === b.ast &&
				_.xor(_.keys(a.value), _.keys(b.value)).length === 0 &&
				_.toPairs(a.value).every(([key, av]) => equalExp(av, b.value[key]))
			)
		case 'fn':
			if (b.ast !== 'fn') {
				return false
			}
			if (a.value === b.value) {
				return true
			}
			return false
	}

	return false

	function equalType(a: ExpForm, b: ExpForm): boolean {
		switch (a.ast) {
			case 'const':
			case 'infUnionValue':
				return equalExp(a, b)
			case 'type':
				if (b.ast !== 'type') {
					return false
				}
				switch (a.kind) {
					case 'all':
						return b.kind === 'all'
					case 'infUnion':
						return b.kind === 'infUnion' && a.id === b.id
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
						return b.kind === a.kind && equalExp(a.items, b.items)
					case 'fn':
						return (
							b.kind === 'fn' &&
							a.params.length === b.params.length &&
							!!a.variadic === !!b.variadic &&
							equalExp(a.out, b.out) &&
							_.zipWith(a.params, b.params, equalType).every(_.identity)
						)
				}
		}

		throw new Error('Cannot determine equality of this two types')
	}
}

function castType(base: ExpForm, target: ExpForm): ExpForm | null {
	if (equalExp(base, target)) {
		return target
	}

	if (containsExp(target, base)) {
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

			if (vars.ast !== 'hashMap') {
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

		const _eval = _.partial(evalWithTrace, _, trace)

		switch (exp.ast) {
			case 'const':
			case 'infUnionValue':
			case 'type':
			case 'fn':
				return exp
			case 'symbol': {
				const ref = resolveSymbol(exp)
				return (exp.evaluated = _eval(ref))
			}
			case 'list': {
				const [first, ...rest] = exp.value

				// Check Special form
				if (first.ast === 'symbol') {
					switch (first.value) {
						case '=>': {
							// Create a function
							const [paramsDef, bodyDef] = rest

							// Validate parameter part
							if (paramsDef.ast !== 'vector') {
								const str = printExp(paramsDef)
								throw new Error(`Function parameters '${str}' must be a vector`)
							}

							// Check if every element is symbol
							const nonSymbol = paramsDef.value.find(p => p.ast !== 'symbol')
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
									paramSymbols.filter(_.partial(equalExp, sym)).length > 1
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

							// Rest argument
							let variadic = false
							const restSymbolIndices = _.chain(paramSymbols)
								.map((p, i) => (p.value === '...' ? i : null))
								.filter(_.isNumber)
								.value()

							if (restSymbolIndices.length > 1) {
								throw new Error("Rest symbol '...' appears more than twice")
							} else if (restSymbolIndices.length === 1) {
								const restIndex = restSymbolIndices[0]

								if (restIndex !== paramSymbols.length - 2) {
									throw new Error("Invalid position of rest symbol '...'")
								}

								paramSymbols.splice(restIndex, 1)
								variadic = true
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
								const out = _eval(fnScope)

								// Clean params
								paramSymbols.forEach(sym =>
									clearEvaluated(paramsHashMap.value[sym.value])
								)

								return out
							}

							// Infer function type
							const paramTypes = Array(paramSymbols.length).fill(TypeAll)
							if (variadic) {
								paramTypes[paramTypes.length - 1] = createTypeVector(TypeAll)
							}
							const outType = inferType(bodyDef)
							const fnType = createTypeFn(paramTypes, outType, {variadic})

							return (exp.evaluated = createFn(fn, fnType))
						}
					}
				}

				let fn = _eval(first)

				if (fn.ast === 'fn') {
					// Function application
				} else if (fn.ast === 'type') {
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

				if (fnType.ast !== 'type' || fnType.kind !== 'fn') {
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
						ast: 'vector',
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
					.map((p, i) => (fnType.lazyEval && fnType.lazyEval[i] ? p : _eval(p)))

				const expanded = fn.value(...evaluatedRest)

				exp.expanded = expanded

				return (exp.evaluated = _eval(expanded))
			}
			case 'vector': {
				return (exp.evaluated = createVector(exp.value.map(_eval)))
			}
			case 'hashMap': {
				const out: ExpHashMap = {
					ast: 'hashMap',
					value: {},
				}
				Object.entries(exp.value).forEach(
					([sym, v]) => (out.value[sym] = _eval(v))
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
	return {ast: 'const', value: null}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		ast: 'const',
		value,
		subsetOf: 'boolean',
	}
}

function createReservedKeyword(
	value: ExpReservedKeyword['value']
): ExpReservedKeyword {
	return {
		ast: 'const',
		value,
		subsetOf: 'reservedKeyword',
	}
}

function createNumber(value: number): ExpNumber {
	return {
		ast: 'infUnionValue',
		subsetOf: 'number',
		value,
	}
}

function createString(value: string): ExpString {
	return {
		ast: 'infUnionValue',
		subsetOf: 'string',
		value,
	}
}

function createSymbol(value: string): ExpSymbol {
	return {
		ast: 'symbol',
		value,
	}
}

function createFn(
	value: string | ((...params: any[]) => any),
	type?: ExpTypeFn
): ExpFn {
	const fn: ExpFn = {
		ast: 'fn',
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
		ast: 'list',
		value,
	}
	value.forEach(v => (v.parent = exp))

	return exp
}

function createVector(value: ExpForm[]): ExpVector {
	const exp: ExpVector = {
		ast: 'vector',
		value,
	}
	value.forEach(v => (v.parent = exp))

	return exp
}

function createHashMap(value: ExpHashMap['value']): ExpHashMap {
	const exp: ExpHashMap = {
		ast: 'hashMap',
		value,
	}
	Object.values(value).forEach(v => (v.parent = exp))

	return exp
}

function isListOf(sym: string, exp: ExpForm): exp is ExpList {
	if (exp.ast === 'list') {
		const [first] = exp.value
		return first && first.ast === 'symbol' && first.value === sym
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
			return {ast: 'symbol', value, str: value}
		} else {
			return {ast: 'infUnionValue', subsetOf: 'string', value}
		}
	}

	function printWithoutType(exp: ExpForm): string {
		switch (exp.ast) {
			case 'const':
				if (exp.value === null) {
					return 'null'
				}
				switch (exp.subsetOf) {
					case 'boolean':
						return exp.value ? 'true' : 'false'
					case 'reservedKeyword':
						return exp.value
				}
				throw new Error('cannot print this type of const')
			case 'infUnionValue':
				switch (exp.subsetOf) {
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
						throw new Error('Cannot print this type of "subsetOf"')
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
					coll = keys.flatMap((k, i) =>
						Array.isArray(delimiters[i + 1])
							? [keyForms[i], value[k]]
							: [value[k]]
					)
					flattenDelimiters = delimiters.flat()
				} else {
					coll = keys.flatMap((k, i) => [keyForms[i], value[k]])
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
			case 'infUnion':
				switch (exp.id) {
					case 'number':
						return 'Number'
					case 'string':
						return 'String'
					default:
						throw new Error('Cannot print this InfUnion')
				}
			case 'fn': {
				const paramTypes: ExpForm[] = [...exp.params]
				if (exp.variadic) {
					const lastType = exp.params.slice(-1)[0] as ExpTypeVector
					paramTypes.splice(-1, 1, createSymbol('...'), lastType.items)
				}
				const params = paramTypes.map(printWithoutType).join(' ')
				const out = printWithoutType(exp.out)
				return `(:=> [${params}] ${out})`
			}
			case 'vector':
				return `(:Vector ${printWithoutType(exp.items)})`
			case 'hashMap': {
				return `(:HashMap ${printWithoutType(exp.items)})`
			}
			case 'union': {
				if (equalExp(exp, TypeBoolean)) {
					return 'Boolean'
				}

				const itemTrue = exp.items.find(_.partial(equalExp, ConstTrue))
				const itemFalse = exp.items.find(_.partial(equalExp, ConstFalse))

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
