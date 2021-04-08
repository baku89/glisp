import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

function canOmitQuote(name: string) {
	return (
		name === '...' || name.match(/^#?[a-z_+\-*/=?|&<>][0-9a-z_+\-*/=?|&<>]*$/i)
	)
}

type Form = Exp | Data

// Type of ASTs that can be contained within a program tree
type Exp = ExpData | ExpSymbol | ExpList | ExpSpecialList

// For evaluated value only
type Data = DataPrim | Data[] | DataSpeial

type DataSpeial =
	| DataVoid
	| DataVariadicVector
	| DataHashMap
	| DataFn
	| DataType

interface ExpBase {
	parent?: ExpList | ExpSpecialList
	dep?: Set<ExpSymbol>
	label?: {
		str: string
		delimiters?: string[]
	}
}

interface ExpProgram {
	ast: 'program'
	value: Exp
	delimiters: [string, string]
}

interface ExpData<T extends Data = Data> extends ExpBase {
	ast: 'data'
	value: T
	str?: string
}

interface DataVoid {
	dataType: 'void'
}

type DataPrim = null | boolean | number | string

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	value: string
	str?: string
	ref?: Exp
}

interface ExpList extends ExpBase {
	ast: 'list'
	value: Exp[]
	delimiters?: string[]
	expanded?: Form
	evaluated?: Data
}

interface ExpSpecialListVector extends ExpBase {
	ast: 'specialList'
	kind: 'vector'
	value: Exp[]
	variadic: boolean
	delimiters?: string[]
	evaluated?: Data[]
}

interface ExpSpecialListHashMap extends ExpBase {
	ast: 'specialList'
	kind: 'hashMap'
	value: {
		[key: string]: Exp
	}
	delimiters?: string[]
	evaluated?: DataHashMap
}

type ExpSpecialList = ExpSpecialListVector | ExpSpecialListHashMap

interface DataVariadicVector {
	dataType: 'variadicVector'
	value: Data[]
}

interface DataHashMap {
	dataType: 'hashMap'
	value: {
		[key: string]: Data
	}
}

// Types
interface DataTypeAll {
	dataType: 'type'
	kind: 'all'
}

interface DataTypeInfUnion {
	dataType: 'type'
	kind: 'infUnion'
	predicate: (v: DataPrim) => boolean
	original?: ExpData<DataTypeInfUnion>
	supersets?: DataTypeInfUnion[]
}

interface DataTypeUnion {
	dataType: 'type'
	kind: 'union'
	items: Data[]
	original?: ExpData<DataTypeUnion>
}

interface DataTypeFn {
	dataType: 'type'
	kind: 'fn'
	params: Data[] | DataVariadicVector
	out: Data
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

type DataType = DataTypeAll | DataTypeUnion | DataTypeInfUnion | DataTypeFn

type IDataFnValue = (...params: Form[]) => Form

interface DataFn {
	dataType: 'fn'
	body: IDataFnValue
	type: DataTypeFn
}

function wrapTypeInfUnion(value: DataTypeInfUnion) {
	const exp: ExpData<DataTypeInfUnion> = {
		ast: 'data',
		value,
	}
	value.original = exp
	return exp
}

function wrapTypeUnion(value: DataTypeUnion) {
	const exp: ExpData<DataTypeUnion> = {
		ast: 'data',
		value,
	}
	value.original = exp
	return exp
}

//-------------------------------------------------------
// Types

const TypeNumber = createTypeInfUnion({
	predicate: v => typeof v === 'number',
})

const TypeInt = createTypeInfUnion({
	supersets: [TypeNumber],
	predicate: v => Number.isInteger(v),
})

const TypePosNumber = createTypeInfUnion({
	supersets: [TypeNumber],
	predicate: v => typeof v === 'number' && v >= 0,
})

const TypeNat = createTypeInfUnion({
	supersets: [TypeInt, TypePosNumber],
	predicate: v => typeof v === 'number' && v >= 0 && Number.isInteger(v),
})

const TypeString = createTypeInfUnion({
	predicate: v => typeof v === 'string',
})

const parser = peg.generate(ParserDefinition)

export function readStr(str: string): Exp {
	const program = parser.parse(str) as ExpProgram | null

	if (program) {
		return program.value
	} else {
		return wrapExp(createVoid())
	}
}

function hasAncestor(target: Exp, ancestor: Exp): boolean {
	return seek(target)

	function seek(target: Exp): boolean {
		if (target === ancestor) {
			return true
		}
		if (!target.parent) {
			return false
		}
		return seek(target.parent)
	}
}

export function disconnectExp(exp: Exp): null {
	switch (exp.ast) {
		case 'data':
			return null
		case 'symbol':
			if (exp.ref) {
				// Clear reference
				exp.ref.dep?.delete(exp)
			}
			return null
	}

	return disconnect(exp)

	function disconnect(e: Exp): null {
		switch (e.ast) {
			case 'data':
				return null
			case 'symbol':
				if (e.ref && !hasAncestor(e.ref, exp)) {
					// Clear reference
					e.ref.dep?.delete(e)
					delete e.ref
				}
				return null
			case 'list':
				e.value.forEach(disconnect)
				return null
			case 'specialList':
				if (e.kind === 'vector') {
					e.value.forEach(disconnect)
				} else if (e.kind === 'hashMap') {
					_.values(e.value).forEach(disconnect)
				}
				return null
		}
	}
}

const TypeAll: DataTypeAll = {
	dataType: 'type',
	kind: 'all',
}

const TypeBoolean: DataTypeUnion = {
	dataType: 'type',
	kind: 'union',
	items: [true, false],
}

function createTypeInfUnion(
	exp: Omit<DataTypeInfUnion, 'dataType' | 'kind' | 'original'>
): DataTypeInfUnion {
	return {
		dataType: 'type',
		kind: 'infUnion',
		...exp,
	}
}
function createTypeFn(
	params: Data[] | DataVariadicVector,
	out: Data,
	{
		lazyEval = undefined as undefined | boolean[],
		lazyInfer = undefined as undefined | boolean[],
	} = {}
): DataTypeFn {
	return {
		dataType: 'type',
		kind: 'fn',
		params,
		out,
		lazyEval,
		lazyInfer,
	}
}

function containsData(outer: Data, inner: Data): boolean {
	if (outer === inner) {
		return true
	}

	if (isDataPrim(outer)) {
		return equalData(outer, inner)
	}

	if (Array.isArray(outer)) {
		return (
			Array.isArray(inner) &&
			outer.length >= inner.length &&
			_$.zipShorter(outer, inner).every(_.spread(containsData))
		)
	}

	if (isDataSpecial(inner) && inner.dataType === 'void') {
		return true
	}

	switch (outer.dataType) {
		case 'void':
		case 'fn':
			return equalData(outer, inner)
		case 'variadicVector':
			if (isDataSpecial(inner) && inner.dataType === 'variadicVector') {
				return (
					outer.value.length === inner.value.length &&
					_$.zipShorter(outer.value, inner.value).every(_.spread(containsData))
				)
			} else if (Array.isArray(inner)) {
				return (
					outer.value.length - 1 <= inner.length &&
					_$.zipShorter(outer.value, inner).every(_.spread(containsData))
				)
			}
			return false
		case 'hashMap':
			return (
				isDataSpecial(inner) &&
				inner.dataType === 'hashMap' &&
				_.entries(inner).every(([key, iv]) =>
					containsData(outer.value[key], iv)
				)
			)
		case 'type':
			switch (outer.kind) {
				case 'all':
					return true
				case 'infUnion':
					if (isDataPrim(inner)) {
						return outer.predicate(inner)
					}

					if ('dataType' in inner && inner.dataType === 'type') {
						if (inner.kind === 'union') {
							return inner.items.every(ii => containsData(outer, ii))
						}
						if (inner.kind === 'infUnion') {
							if (outer.original === inner.original) {
								return true
							}
							return (
								!!inner.supersets &&
								inner.supersets.some(s => containsData(outer, s))
							)
						}
					}
					return false
				case 'union': {
					const innerItems =
						isDataSpecial(inner) &&
						inner.dataType === 'type' &&
						inner.kind === 'union'
							? inner.items
							: [inner]
					if (outer.items.length < innerItems.length) {
						return false
					}
					return !!innerItems.some(ii =>
						outer.items.some(_.partial(containsData, _, ii))
					)
				}
				case 'fn':
					if (!isDataSpecial(inner)) {
						return false
					}
					if (inner.dataType === 'type') {
						if (inner.kind === 'fn') {
							return (
								containsData(outer.params, inner.params) &&
								containsData(outer.out, inner.out)
							)
						}
						return containsData(outer.out, inner)
					}
					if (inner.dataType === 'fn') {
						return (
							containsData(outer.params, inner.type.params) &&
							containsData(outer.out, inner.type.out)
						)
					}
					return containsData(outer.out, inner)
			}
	}
}

function uniteType(items: Data[]): Data {
	if (items.length === 0) {
		return TypeAll
	}

	const unionType = items.reduce((a, b) => {
		if (containsData(a, b)) {
			return a
		}
		if (containsData(b, a)) {
			return b
		}

		const aItems = isDataType(a) && a.kind === 'union' ? a.items : [a]
		const bItems = isDataType(b) && b.kind === 'union' ? b.items : [b]

		return {
			dataType: 'type',
			kind: 'union',
			items: [...aItems, ...bItems],
		}
	}, createVoid())

	if (isDataType(unionType) && unionType.kind === 'union') {
		return {...unionType}
	}

	return unionType
}

function wrapExp<T extends Data>(value: T): ExpData<T> {
	return {
		ast: 'data',
		value,
	}
}

const GlobalScope = createList([
	createSymbol('let'),
	createSpecialListHashMap({
		Boolean: wrapTypeUnion(TypeBoolean),
		Number: wrapTypeInfUnion(TypeNumber),
		PosNumber: wrapTypeInfUnion(TypePosNumber),
		Int: wrapTypeInfUnion(TypeInt),
		Nat: wrapTypeInfUnion(TypeNat),
		String: wrapTypeInfUnion(TypeString),
		'#=>': createFn(
			(params: Data[], out: Data) => createTypeFn(params, out),
			createTypeFn([TypeAll, TypeAll], TypeAll)
		),
		'#|': createFn(
			(items: Data[]) => uniteType(items),
			createTypeFn(createVariadicVector([TypeAll]), TypeAll)
		),
		'#count': createFn(
			(v: Data) => typeCount(v),
			createTypeFn([TypeAll], TypeNumber)
		),
		'#<==': createFn(
			(type: Data, value: Exp) => assignExp(type, value),
			createTypeFn([TypeAll, TypeAll], TypeAll, {
				lazyEval: [false, true],
			})
		),
		length: createFn(
			(v: Data[] | DataVariadicVector) =>
				Array.isArray(v) ? v.length : Infinity,
			createTypeFn([createVariadicVector([TypeAll])], TypeNat)
		),
		let: createFn(
			(_: DataHashMap, body: Exp) => body,
			createTypeFn([createTypeFn([TypeString], TypeAll), TypeAll], TypeAll)
		),
		PI: wrapExp(Math.PI),
		'+': createFn((xs: number[]) => {
			console.log(xs)
			return xs.reduce((sum, v) => sum + v, 0)
		}, createTypeFn(createVariadicVector([TypeNumber]), TypeNumber)),
		'*': createFn(
			(xs: number[]) => xs.reduce((prod, v) => prod * v, 1),
			createTypeFn(createVariadicVector([TypeNumber]), TypeNumber)
		),
		take: createFn((n: number, coll: Data[] | DataVariadicVector) => {
			if (Array.isArray(coll)) {
				return coll.slice(0, n)
			} else {
				const newColl = coll.value.slice(0, n)
				newColl.push(
					..._.times(
						n - newColl.length,
						() => coll.value[coll.value.length - 1]
					)
				)
				return newColl
			}
		}, createTypeFn([TypeNat, createVariadicVector([TypeAll])], TypeNumber)),
		'&&': createFn(
			(a: boolean, b: boolean) => a && b,
			createTypeFn([TypeBoolean, TypeBoolean], TypeBoolean)
		),
		square: createFn(
			(v: number) => v * v,
			createTypeFn([TypeNumber], TypePosNumber)
		),
		sqrt: createFn(
			(v: number) => Math.sqrt(v),
			createTypeFn([TypePosNumber], TypePosNumber)
		),
		not: createFn((v: boolean) => !v, createTypeFn([TypeBoolean], TypeBoolean)),
		'==': createFn(
			(a: Data, b: Data) => equalData(a, b),
			createTypeFn([TypeAll, TypeAll], TypeBoolean)
		),
		'#>=': createFn(
			(a: Data, b: Data) => containsData(a, b),
			createTypeFn([TypeAll, TypeAll], TypeBoolean)
		),
		count: createFn(
			(a: Data[]) => a.length,
			createTypeFn([TypeAll], TypeNumber)
		),
		if: createFn(
			(cond: boolean, then: Exp, _else: Exp) => {
				return cond ? then : _else
			},
			createTypeFn([TypeBoolean, TypeAll, TypeAll], TypeAll, {
				lazyEval: [false, true, true],
			})
		),
	}),
])

// Predicates for data

function isData(form: Form): form is Data {
	return isDataPrim(form) || Array.isArray(form) || 'dataType' in form
}

function isDataPrim(data: Data | Exp): data is DataPrim {
	return (
		data === null ||
		typeof data === 'boolean' ||
		typeof data === 'number' ||
		typeof data === 'string'
	)
}

function isDataSpecial(data: Data): data is DataSpeial {
	return !isDataPrim(data) && !Array.isArray(data)
}

function isDataType(data: Data): data is DataType {
	return !isDataPrim(data) && !Array.isArray(data) && data.dataType === 'type'
}

function isDataFn(form: Form): form is DataFn {
	return !isDataPrim(form) && 'dataType' in form && form.dataType === 'fn'
}

function inferType(form: Form): Data {
	if (isData(form)) {
		return form
	}

	switch (form.ast) {
		case 'data':
			return form.value
		case 'symbol':
			return inferType(resolveSymbol(form))
		case 'list': {
			const first = form.value[0]
			if (first.ast === 'symbol' && first.value === '=>') {
				return inferType(evalExp(first))
			}
			return inferType(first)
		}
		case 'specialList':
			if (form.kind === 'vector') {
				return form.value.map(inferType)
			} else {
				return createHashMap(_.mapValues(form.value, inferType))
			}
	}
}

function clearEvaluatedRecursively(exp: Exp) {
	switch (exp.ast) {
		case 'list':
		case 'specialList':
			if (!exp.evaluated) {
				return
			}
			delete exp.evaluated
	}

	if (exp.dep) {
		exp.dep.forEach(clearEvaluatedRecursively)
	}
	if (exp.parent) {
		clearEvaluatedRecursively(exp.parent)
	}
}

function equalData(a: Data, b: Data): boolean {
	if (isDataPrim(a)) {
		return a === b
	}

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false
		}
		return (
			a.length === b.length && _$.zipShorter(a, b).every(_.spread(equalData))
		)
	}

	if (isDataPrim(b) || Array.isArray(b)) {
		return false
	}

	switch (a.dataType) {
		case 'void':
			return b.dataType === 'void'
		case 'variadicVector':
			return (
				b.dataType === 'variadicVector' &&
				a.value.length === b.value.length &&
				_$.zipShorter(a.value, b.value).every(_.spread(equalData))
			)
		case 'hashMap':
			return (
				b.dataType === 'hashMap' &&
				_.xor(_.keys(a.value), _.keys(b.value)).length === 0 &&
				_.toPairs(a.value).every(([key, av]) => equalData(av, b.value[key]))
			)
		case 'fn':
			return b.dataType === 'fn' && a.body === b.body
		case 'type':
			return b.dataType === 'type' && equalType(a, b)
	}

	function equalType(a: DataType, b: DataType): boolean {
		switch (a.kind) {
			case 'all':
				return b.kind === 'all'
			case 'infUnion':
				return a === b
			case 'union': {
				if (b.kind !== 'union') return false
				if (a.items.length !== b.items.length) {
					return false
				}
				return _.differenceWith(a.items, b.items, equalData).length === 0
			}
			case 'fn':
				return (
					b.kind === 'fn' &&
					equalData(a.out, b.out) &&
					equalData(a.params, b.params)
				)
		}
	}
}

function resolveSymbol(sym: ExpSymbol): Exp {
	if (sym.ref) {
		return sym.ref
	}

	let ref: Exp | undefined
	let parent: Exp | undefined = sym

	while ((parent = parent.parent)) {
		if (isListOf('let', parent)) {
			const vars = parent.value[1]

			if (vars.ast !== 'specialList' || vars.kind !== 'hashMap') {
				throw new Error('2nd parameter of let should be HashMap')
			}

			if ((ref = vars.value[sym.value])) {
				break
			}
		}
	}

	if (!ref) {
		throw new Error(`Symbol ${printForm(sym)} is not defined`)
	}

	sym.ref = ref
	ref.dep = (ref.dep || new Set()).add(sym)

	return ref
}

export class Interpreter {
	private scope: ExpList
	private vars: ExpSpecialListHashMap

	constructor() {
		this.vars = createSpecialListHashMap({})

		this.vars.value['def'] = createFn((value: ExpData) => {
			if (!value.label) {
				throw new Error('no label')
			}
			this.vars.value[value.label.str] = value
			delete value.label
			value.parent = this.vars
			return value
		}, createTypeFn([TypeAll], TypeAll))

		this.scope = createList([createSymbol('let'), this.vars])
		this.scope.parent = GlobalScope
	}

	evalExp(exp: Exp): Data {
		exp.parent = this.scope
		return evalExp(exp)
	}
}

function typeCount(data: Data): number {
	if (isDataPrim(data) || Array.isArray(data)) {
		return 1
	}

	if (Array.isArray(data)) {
		return data.reduce((count, d) => count * typeCount(d), 1)
	}

	switch (data.dataType) {
		case 'void':
			return 0
		case 'fn':
			return 1
		case 'variadicVector':
			return Infinity
		case 'hashMap':
			return _.values(data.value).reduce(
				(count: number, d) => count * typeCount(d),
				1
			)
		case 'type':
			switch (data.kind) {
				case 'all':
				case 'infUnion':
					return Infinity
				case 'union':
					return data.items.reduce(
						(count: number, v) => count + typeCount(v),
						0
					)
				case 'fn':
					return typeCount(data.out)
			}
	}
}

export function evalExp(exp: Exp): Data {
	return evalWithTrace(exp, [])

	function evalWithTrace(exp: Exp, trace: Exp[]): Data {
		// Check circular reference
		if (trace.includes(exp)) {
			const lastTrace = trace[trace.length - 1]
			throw new Error(`Circular reference ${printForm(lastTrace)}`)
		}
		trace = [...trace, exp]

		// Use cache
		if ('evaluated' in exp && exp.evaluated) {
			return exp.evaluated
		}

		const _eval = (e: Exp) => {
			const evaluated = evalWithTrace(e, trace)
			if (e.ast === 'list' || e.ast === 'specialList') {
				e.evaluated = evaluated
			}
			return evaluated
		}

		switch (exp.ast) {
			case 'data':
				return exp.value
			case 'symbol': {
				const ref = resolveSymbol(exp)
				return _eval(ref)
			}
			case 'list': {
				const [first, ...rest] = exp.value

				// Create Function
				/*
				if (first.ast === 'symbol' && first.value === '=>') {
					// Create a function
					const [paramsDef, bodyDef] = rest

					// Validate parameter part
					if (paramsDef.ast !== 'specialList' && paramsDef.kind !== 'vector') {
						const str = printForm(paramsDef)
						throw new Error(
							`Function parameters '${str}' must be a vector type`
						)
					}

					const paramSymbols = paramsDef.items as ExpSymbol[]

					// Create scope
					const paramsHashMap = createHashMap(
						Object.fromEntries(paramSymbols.map(sym => [sym.value, sym]))
					)

					const fnScope = createList([
						createSymbol('let'),
						paramsHashMap,
						cloneExp(bodyDef),
					])

					fnScope.parent = exp.parent

					// Define function
					const fn = (...params: Exp[]) => {
						// Set params
						paramSymbols.forEach(
							(sym, i) => (paramsHashMap.value[sym.value] = params[i])
						)

						// Evaluate
						const out = _eval(fnScope)

						// Clean params
						paramSymbols.forEach(sym =>
							clearEvaluatedRecursively(paramsHashMap.value[sym.value])
						)

						return out
					}

					// Infer function type
					const paramTypes = Array(paramSymbols.length).fill(TypeAll)
					const outType = inferType(bodyDef)
					const fnType = createTypeFn(paramTypes, outType, {
						variadic: paramsDef.variadic,
					})

					return (exp.evaluated = createFn(fn, fnType))
				} */

				const fn = _eval(first)

				let fnType: DataTypeFn
				let fnBody: IDataFnValue

				if (isDataFn(fn)) {
					// Function application
					fnType = fn.type
					fnBody = fn.body
				} else {
					throw new Error('First element is not a function')
				}

				const params = createSpecialListVector(rest, {setParent: false})
				const assignedParams = assignExp(fnType.params, params)

				if (
					assignedParams.ast !== 'specialList' ||
					assignedParams.kind !== 'vector'
				) {
					throw new Error('why??????????')
				}

				// Eval parameters at first
				const evaluatedParams = assignedParams.value.map((p, i) =>
					fnType.lazyEval && fnType.lazyEval[i] ? p : _eval(p)
				)

				const expanded = (exp.expanded = fnBody(...evaluatedParams))
				return isData(expanded) ? expanded : _eval(expanded)
			}
			case 'specialList':
				if (exp.kind === 'vector') {
					const vec = exp.value.map(_eval)
					return exp.variadic ? createVariadicVector(vec) : vec
				} else if (exp.kind === 'hashMap') {
					return createHashMap(_.mapValues(exp.value, _eval))
				}
				throw new Error('Invalid kind of specialForm')
		}
	}
}

function assignExp(target: Data, source: Exp): Exp {
	const sourceType = inferType(source)

	if (isDataPrim(target)) {
		if (!equalData(target, sourceType)) {
			throw new Error(
				`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
			)
		}
		return source
	}

	if (Array.isArray(target)) {
		if (
			source.ast !== 'specialList' ||
			source.kind !== 'vector' ||
			!containsData(target, sourceType)
		) {
			throw new Error(
				`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
			)
		}
		return createSpecialListVector(_.take(source.value, target.length), {
			setParent: false,
		})
	}

	switch (target.dataType) {
		case 'void':
			return wrapExp(createVoid())
		case 'variadicVector': {
			if (
				source.ast !== 'specialList' ||
				source.kind !== 'vector' ||
				source.variadic ||
				!containsData(target, sourceType)
			) {
				throw new Error(
					`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
				)
			}
			const restPos = target.value.length - 1
			const fixedPart = _.take(source.value, restPos)
			const restPart = createSpecialListVector(source.value.slice(restPos), {
				setParent: false,
			})
			return createSpecialListVector([...fixedPart, restPart], {
				setParent: false,
			})
		}
		case 'type':
			if (!containsData(target, sourceType)) {
				throw new Error(
					`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
				)
			}
			switch (target.kind) {
				case 'all':
				case 'union':
				case 'infUnion':
					return source
				default:
					throw new Error(
						'Sorry! Did not implement the assignExp function for this type so far!!'
					)
			}

		default:
			throw new Error('Cannot assign!!!')
	}
}

// Create functions
function createVoid(): DataVoid {
	return {dataType: 'void'}
}

function createSymbol(value: string): ExpSymbol {
	return {
		ast: 'symbol',
		value,
	}
}

function createFn(
	value: (...params: any[]) => Form,
	type: DataTypeFn
): ExpData<DataFn> {
	return {
		ast: 'data',
		value: {
			dataType: 'fn',
			body: value as IDataFnValue,
			type,
		},
	}
}

function createList(value: Exp[], {setParent = true} = {}): ExpList {
	const exp: ExpList = {
		ast: 'list',
		value,
	}

	if (setParent) {
		value.forEach(v => (v.parent = exp))
	}

	return exp
}

function createSpecialListVector(
	value: Exp[],
	{setParent = true, variadic = false} = {}
) {
	const exp: ExpSpecialListVector = {
		ast: 'specialList',
		kind: 'vector',
		value,
		variadic,
	}

	if (setParent) {
		value.forEach(v => (v.parent = exp))
	}

	return exp
}

function createSpecialListHashMap(
	value: ExpSpecialListHashMap['value'],
	{setParent = true} = {}
) {
	const exp: ExpSpecialListHashMap = {
		ast: 'specialList',
		kind: 'hashMap',
		value,
	}

	if (setParent) {
		_.values(value).forEach(v => (v.parent = exp))
	}

	return exp
}

function createVariadicVector(value: Data[]): DataVariadicVector {
	const exp: DataVariadicVector = {
		dataType: 'variadicVector',
		value,
	}

	return exp
}

function createHashMap(value: DataHashMap['value']): DataHashMap {
	return {
		dataType: 'hashMap',
		value,
	}
}

function isListOf(sym: string, exp: Exp): exp is ExpList {
	if (exp.ast === 'list') {
		const [first] = exp.value
		return first && first.ast === 'symbol' && first.value === sym
	}
	return false
}

function getName(exp: Exp): string | null {
	if (
		exp.parent?.ast === 'specialList' &&
		exp.parent?.kind === 'hashMap' &&
		exp.parent.parent &&
		isListOf('let', exp.parent.parent)
	) {
		return _.findKey(exp.parent.value, e => e === exp) || null
	}
	return null
}

export function printForm(form: Form): string {
	return isData(form) ? printData(form) : printExp(form)

	function printExp(exp: Exp): string {
		switch (exp.ast) {
			case 'data':
				return exp.str || printData(exp.value)
			case 'symbol':
				if (exp.str) {
					return exp.str
				} else {
					const value = exp.value
					return canOmitQuote(value) ? value : `@"${value}"`
				}
			case 'list':
				return printSeq('(', ')', exp.value, exp.delimiters)
			case 'specialList':
				if (exp.kind === 'vector') {
					const value = [...exp.value]
					const delimiters = exp.delimiters || [
						'',
						..._.times(value.length - 1, () => ' '),
						'',
					]
					if (exp.variadic) {
						value.splice(-1, 0, createSymbol('...'))
						delimiters.push('')
					}
					return printSeq('[', ']', value, delimiters)
				}
				throw new Error('Invalid specialList and cannot print it')
		}
	}

	function printData(data: Data): string {
		// Print prim
		switch (data) {
			case null:
				return 'null'
			case false:
				return 'false'
			case true:
				return 'true'
		}

		switch (typeof data) {
			case 'number': {
				const str = data.toString()
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
				return data
		}

		if (Array.isArray(data)) {
			return printSeq('[', ']', data)
		}

		switch (data.dataType) {
			case 'void':
				return 'Void'
			case 'variadicVector': {
				const value: Form[] = [...data.value]
				const delimiters = ['', ...Array(value.length - 1).fill(' '), '', '']
				value.splice(-1, 0, createSymbol('...'))
				return printSeq('[', ']', value, delimiters)
			}
			case 'hashMap': {
				const pairs = _.entries(data.value)
				const coll = pairs.map(([label, v]) => ({
					...wrapExp(v),
					...{label: {str: label, delimiters: ['', ' ']}},
				}))
				const delimiters =
					pairs.length === 0
						? ['']
						: ['', ...Array(pairs.length - 1).fill(' '), '']
				return printSeq('{', '}', coll, delimiters)
			}
			case 'fn':
				return `(=> ${printData(data.type.params)} ${printData(data.type.out)})`
			case 'type':
				return printType(data)
		}
	}

	function printType(data: DataType): string {
		switch (data.kind) {
			case 'all':
				return 'All'
			case 'infUnion':
				if (data.original) {
					const name = getName(data.original)
					if (name) {
						return name
					}
				}
				throw new Error('Cannot print this InfUnion')
			case 'fn':
				return `(#=> ${printForm(data.params)} ${printForm(data.out)})`
			case 'union': {
				if (data.original) {
					const name = getName(data.original)
					if (name) {
						return name
					}
				}
				const items = data.items.map(printForm).join(' ')
				return `(#| ${items})`
			}
		}
	}

	function printSeq(
		start: string,
		end: string,
		coll: Form[],
		delimiters?: string[]
	): string {
		if (delimiters) {
			if (delimiters.length === coll.length + 1) {
				return (
					start +
					coll.map((v, i) => delimiters[i] + printForm(v)).join('') +
					delimiters[delimiters.length - 1] +
					end
				)
			}
			console.warn('Invalid length of delimiters', delimiters)
		}
		return start + coll.map(printForm).join(' ') + end
	}
}
