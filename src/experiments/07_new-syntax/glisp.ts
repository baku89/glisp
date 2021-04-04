import deepClone from 'deep-clone'
import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

const SymbolIdentiferRegex = /^(:?[a-z_+\-*/=?|<>][0-9a-z_+\-*/=?|<>]*)|(...)$/i

type ExpForm =
	| ExpNull
	| ExpConst
	| ExpInfUnionValue
	| ExpSymbol
	| ExpList
	| ExpVector
	| ExpVariadicVector
	| ExpHashMap
	| ExpFn
	| ExpType

interface ExpBase {
	parent?: ExpList | ExpVector | ExpVariadicVector | ExpHashMap | ExpFn
	dep?: Set<ExpSymbol | ExpList>
}

interface ExpProgram {
	ast: 'program'
	value: ExpForm
	delimiters: [string, string]
}

interface ExpNull extends ExpBase {
	ast: 'null'
}

interface ExpBoolean extends ExpBase {
	ast: 'const'
	value: boolean
	subsetOf: 'boolean'
}

type ExpConst = ExpNull | ExpBoolean

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
	evaluated?: ExpVector<T>
}

interface ExpVariadicVector extends ExpBase {
	ast: 'variadicVector'
	value: [ExpForm, ...ExpForm[]]
	delimiters?: string[]
	evaluated?: ExpVariadicVector
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

interface ExpTypeFn extends ExpTypeBase {
	kind: 'fn'
	params: ExpVector | ExpVariadicVector
	out: ExpForm
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
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
	| ExpTypeUnion

type IExpFnValue = (...params: ExpForm[]) => ExpForm

interface ExpFn extends ExpBase {
	ast: 'fn'
	value: IExpFnValue
	type: ExpTypeFn
}

export function readStr(str: string): ExpForm {
	const program = parser.parse(str) as ExpProgram | null

	if (program) {
		console.log(program)
		return program.value
	} else {
		return createNull()
	}
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

const TypeFalsy = uniteType([
	ConstFalse,
	createNull(),
	createNumber(0),
	createString(''),
])

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
}

const TypeType: ExpTypeType = {
	ast: 'type',
	kind: 'type',
}

function createTypeFn(
	params: ExpForm[],
	out: ExpForm,
	{
		variadic = false,
		lazyEval = undefined as undefined | boolean[],
		lazyInfer = undefined as undefined | boolean[],
	} = {}
): ExpTypeFn {
	return {
		ast: 'type',
		kind: 'fn',
		params: (variadic ? createVariadicVector : createVector)(params),
		out,
		lazyEval,
		lazyInfer,
	}
}

function containsExp(outer: ExpForm, inner: ExpForm): boolean {
	if (outer === inner) {
		return true
	}

	if (inner.ast === 'null') {
		return true
	}

	if (outer.ast === 'vector') {
		return (
			inner.ast === 'vector' &&
			outer.value.length >= inner.value.length &&
			_$.zipShorter(outer.value, inner.value).every(_$.uncurry(containsExp))
		)
	}
	if (outer.ast === 'variadicVector') {
		if (inner.ast !== 'variadicVector' && inner.ast !== 'vector') {
			return false
		}
		if (outer.value.length - 1 > inner.value.length) {
			return false
		}
		return inner.value.every((iv, i) => {
			const idx = Math.min(i, outer.value.length - 1)
			const ov = outer.value[idx]
			return containsExp(ov, iv)
		})
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
		case 'fn': {
			if (inner.ast === 'type') {
				if (inner.kind === 'fn') {
					return (
						containsExp(outer.params, inner.params) &&
						containsExp(outer.out, inner.out)
					)
				}
				return containsExp(outer.out, inner)
			}
			if (inner.ast === 'fn') {
				return (
					containsExp(outer.params, inner.type.params) &&
					containsExp(outer.out, inner.type.out)
				)
			}
			return containsExp(outer.out, inner)
		}
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
	Falsy: TypeFalsy,
	':=>': createFn(
		(params: ExpVector | ExpVariadicVector, out: ExpForm) =>
			createTypeFn(params.value, out, {
				variadic: params.ast === 'variadicVector',
			}),
		createTypeFn([createVariadicVector([TypeType])], TypeType)
	),
	':|': createFn(
		(items: ExpVector<ExpForm>) => uniteType(items.value),
		createTypeFn([TypeAll], TypeAll, {variadic: true})
	),
	let: createFn(
		(_: ExpHashMap, body: ExpForm) => body,
		createTypeFn([createTypeFn([TypeString], TypeAll), TypeAll], TypeAll)
	),
}

const GlobalScope = createList(
	createSymbol('let'),
	createHashMap({
		PI: createNumber(Math.PI),
		'+': createFn(
			(value: ExpVector<ExpNumber>) =>
				createNumber(value.value.reduce((sum, {value}) => sum + value, 0)),
			createTypeFn([TypeNumber], TypeNumber, {variadic: true})
		),
		square: createFn(
			(v: ExpNumber) => createNumber(v.value * v.value),
			createTypeFn([TypeNumber], TypeNumber)
		),
		not: createFn(
			(v: ExpBoolean) => createBoolean(!v.value),
			createTypeFn([TypeBoolean], TypeBoolean)
		),
		'==': createFn(
			(a: ExpForm, b: ExpForm) => createBoolean(equalExp(a, b)),
			createTypeFn([TypeAll, TypeAll], TypeBoolean)
		),
		':>=': createFn(
			(a: ExpType, b: ExpType) => createBoolean(containsExp(a, b)),
			createTypeFn([TypeAll, TypeAll], TypeBoolean)
		),
		count: createFn(
			(a: ExpVector) => createNumber(a.value.length),
			createTypeFn([TypeAll], TypeNumber)
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

function inferType(exp: ExpForm): ExpForm {
	if (exp.ast === 'list') {
		const first = evalExp(exp.value[0])
		if (first.ast === 'fn') {
			return first.type.out
		}
	}
	return exp
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
		case 'null':
			return b.ast === 'null'
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
		case 'variadicVector':
			return (
				a.ast === b.ast &&
				a.value.length === b.value.length &&
				_$.zipShorter(a.value, b.value).every(_$.uncurry(equalExp))
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

	throw new Error(
		`Cannot determine equality: ${printExp(a)} and ${printExp(b)}`
	)

	function equalType(a: ExpType, b: ExpType): boolean {
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
				return _.differenceWith(a.items, b.items, equalExp).length === 0
			}
			case 'fn':
				return (
					b.kind === 'fn' &&
					equalExp(a.out, b.out) &&
					equalExp(a.params, b.params)
				)
		}

		throw new Error('Cannot determine equality of this two types')
	}
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
		this.vars = createHashMap({})

		this.vars.value['def'] = createFn(
			(sym: ExpSymbol, value: ExpForm) => {
				this.vars.value[sym.value] = value
				value.parent = this.vars
				return value
			},
			// NOTE: This should be TypeSymbol
			createTypeFn([TypeAll, TypeAll], TypeAll, {
				lazyEval: [true, true],
				lazyInfer: [true, false],
			})
		)

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
							if (
								paramsDef.ast !== 'vector' &&
								paramsDef.ast !== 'variadicVector'
							) {
								const str = printExp(paramsDef)
								throw new Error(
									`Function parameters '${str}' must be a vector/variadicVector`
								)
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
							const variadic = paramsDef.ast === 'variadicVector'
							const outType = inferType(bodyDef)
							const fnType = createTypeFn(paramTypes, outType, {variadic})

							return (exp.evaluated = createFn(fn, fnType))
						}
					}
				}

				const fn = _eval(first)

				let fnType: ExpTypeFn
				let fnValue: IExpFnValue

				if (fn.ast === 'fn') {
					// Function application
					fnType = fn.type
					fnValue = fn.value
				} else {
					throw new Error('First element is not a function')
				}

				// Type Checking
				const variadic = fnType.params.ast === 'variadicVector'
				const paramTypes = [...fnType.params.value]
				let params = rest

				let minParamLen = paramTypes.length
				let paramLen = params.length

				if (variadic) {
					// Length check
					minParamLen -= 1

					if (paramLen < minParamLen) {
						throw new Error(
							`Expected ${minParamLen} arguments at least, but got ${paramLen}`
						)
					}
				} else {
					// Not a variadic parameter

					// Length check
					if (paramLen < minParamLen) {
						throw new Error(
							`Expected ${minParamLen} arguments, but got ${paramLen}`
						)
					}

					paramLen = minParamLen
				}

				// Eval parameters at first
				params = params
					.slice(0, paramLen)
					.map((p, i) => (fnType.lazyEval && fnType.lazyEval[i] ? p : _eval(p)))

				// Cast check
				for (let i = 0; i < paramLen; i++) {
					const paramType = paramTypes[Math.min(i, paramTypes.length - 1)]
					const param = params[i]

					if (!containsExp(paramType, param)) {
						const paramStr = printExp(param)
						const paramTypeStr = printExp(paramType)
						throw new Error(
							`'${paramStr}' is not assignable to type '${paramTypeStr}'`
						)
					}
				}

				if (variadic) {
					// Merge rest parameters into a vector
					// NOTE: Prevent to set parent by directly discribing vector object
					const lastParam: ExpVector = {
						ast: 'vector',
						value: params.slice(minParamLen),
					}

					// Replace the variadic part with the vector
					params.splice(minParamLen, lastParam.value.length, lastParam)
				}

				const expanded = (exp.expanded = fnValue(...params))
				return (exp.evaluated = _eval(expanded))
			}
			case 'vector': {
				return (exp.evaluated = createVector(exp.value.map(_eval)))
			}
			case 'variadicVector': {
				return (exp.evaluated = createVariadicVector(exp.value.map(_eval)))
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
	return {ast: 'null'}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		ast: 'const',
		value,
		subsetOf: 'boolean',
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

function createFn(value: (...params: any[]) => any, type?: ExpTypeFn): ExpFn {
	if (!type) {
		type = createTypeFn(
			_.times(value.length, () => TypeAll),
			TypeAll
		)
	}

	return {
		ast: 'fn',
		value: typeof value === 'string' ? eval(value) : value,
		type,
	}
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

function createVariadicVector(value: ExpForm[]): ExpVariadicVector {
	if (value.length === 0) {
		throw new Error('Cannot create variadicVector with no element')
	}
	const exp: ExpVariadicVector = {
		ast: 'variadicVector',
		value: value as ExpVariadicVector['value'],
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

export function printExp(exp: ExpForm): string {
	switch (exp.ast) {
		case 'null':
			return 'null'
		case 'const':
			switch (exp.subsetOf) {
				case 'boolean':
					return exp.value ? 'true' : 'false'
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
		case 'variadicVector': {
			const value = [...exp.value]
			value.splice(-1, 0, createSymbol('...'))
			return printSeq('[', ']', value, exp.delimiters)
		}
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
			return printExp(exp.type)
		case 'type':
			return printType(exp)
		default:
			throw new Error('Invalid type of Exp')
	}

	function toHashKey(value: string): ExpSymbol | ExpString {
		if (SymbolIdentiferRegex.test(value)) {
			return {ast: 'symbol', value, str: value}
		} else {
			return {ast: 'infUnionValue', subsetOf: 'string', value}
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
			case 'fn':
				return `(:=> ${printExp(exp.params)} ${printExp(exp.out)})`
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

				const items = exp.items.map(printExp).join(' ')
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
