import deepClone from 'deep-clone'
import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const SymbolIdentiferRegex = /^#?[a-z_+\-*/=?|<>][0-9a-z_+\-*/=?|<>]*$/i

type ExpForm = ExpVar | ExpData

type ExpVar = ExpSymbol | ExpList | ExpSpecialList

type ExpData =
	| ExpVoid
	| ExpBoolean
	| ExpConst
	| ExpVector
	| ExpHashMap
	| ExpFn
	| ExpType

interface ExpBase {
	parent?: ExpList | ExpSpecialList | ExpVector | ExpHashMap | ExpFn
	dep?: Set<ExpSymbol>
}

interface ExpProgram {
	ast: 'program'
	value: ExpForm
	delimiters: [string, string]
}

interface ExpVoid extends ExpBase {
	ast: 'void'
}

interface ExpConstBase<T> extends ExpBase {
	ast: 'const'
	value: T
	supersets?: ExpTypeInfUnion
	str?: string
}

type ExpBoolean = ExpConstBase<boolean>

type ExpNumber = ExpConstBase<number>

type ExpString = ExpConstBase<string>

type ExpConst = ExpBoolean | ExpNumber | ExpString

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	value: string
	str?: string
	ref?: ExpForm
	evaluated?: ExpData
}

interface ExpList extends ExpBase {
	ast: 'list'
	value: ExpForm[]
	delimiters?: string[]
	expanded?: ExpForm
	evaluated?: ExpData
}

interface ExpSpecialListVector extends ExpBase {
	ast: 'specialList'
	kind: 'vector'
	value: ExpForm[]
	variadic: boolean
	delimiters?: string[]
	evaluated?: ExpVector
}

interface ExpSpecialListHashMap extends ExpBase {
	ast: 'specialList'
	kind: 'hashMap'
	value: {
		[key: string]: ExpForm
	}
	delimiters?: (string | [string, string])[]
	evaluated?: ExpHashMap
}

type ExpSpecialList = ExpSpecialListVector | ExpSpecialListHashMap

interface ExpVector<T extends ExpData = ExpData> extends ExpBase {
	ast: 'vector'
	value: T[]
	variadic: boolean
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	value: {
		[key: string]: ExpData
	}
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
	supersets?: ExpTypeInfUnion[]
	predicate: (v: ExpConst) => boolean
}

interface ExpTypeFn extends ExpTypeBase {
	kind: 'fn'
	params: ExpVector
	out: ExpData
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

interface ExpTypeUnion extends ExpTypeBase {
	kind: 'union'
	items: ExpData[]
}

type ExpType = ExpTypeAll | ExpTypeInfUnion | ExpTypeFn | ExpTypeUnion

type IExpFnValue = (...params: ExpForm[]) => ExpForm

interface ExpFn extends ExpBase {
	ast: 'fn'
	value: IExpFnValue
	type: ExpTypeFn
}

const TypeNumber: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	predicate: ({value}) => typeof value === 'number',
}

const TypeInt: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	supersets: [TypeNumber],
	predicate: ({value}) => Number.isInteger(value),
}

const TypePosNumber: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	supersets: [TypeNumber],
	predicate: ({value}) => value >= 0,
}

const TypeNat: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	supersets: [TypeInt, TypePosNumber],
	predicate: ({value}) => value >= 0 && Number.isInteger(value),
}

const TypeString: ExpTypeInfUnion = {
	ast: 'type',
	kind: 'infUnion',
	predicate: ({value}) => typeof value === 'string',
}

;(window as any)['Glisp__builtin__InfUnionTypes'] = {
	Number: TypeNumber,
	String: TypeString,
}

const parser = peg.generate(ParserDefinition)

export function readStr(str: string): ExpForm {
	const program = parser.parse(str) as ExpProgram | null

	if (program) {
		return program.value
	} else {
		return createVoid()
	}
}

function evalStr(str: string): ExpForm {
	return evalExp(readStr(str))
}

function hasAncestor(target: ExpForm, ancestor: ExpForm): boolean {
	return seek(target)

	function seek(target: ExpForm): boolean {
		if (target === ancestor) {
			return true
		}
		if (!target.parent) {
			return false
		}
		return seek(target.parent)
	}
}

export function disconnectExp(exp: ExpForm): null {
	switch (exp.ast) {
		case 'void':
		case 'const':
			return null
		case 'symbol':
			if (exp.ref) {
				// Clear reference
				exp.ref.dep?.delete(exp)
			}
			return null
		case 'fn':
		case 'type':
			throw new Error('I dunno how to handle this...')
	}

	return disconnect(exp)

	function disconnect(e: ExpForm): null {
		switch (e.ast) {
			case 'void':
			case 'const':
			case 'fn':
				return null
			case 'symbol':
				if (e.ref && !hasAncestor(e.ref, exp)) {
					// Clear reference
					e.ref.dep?.delete(e)
					delete e.ref
				}
				return null
			case 'list':
			case 'vector':
				e.value.forEach(disconnect)
				return null
			case 'specialList':
				if (e.kind === 'vector') {
					e.value.forEach(disconnect)
				} else if (e.kind === 'hashMap') {
					_.values(e.value).forEach(disconnect)
				}
				return null
			case 'hashMap':
				_.values(e.value).forEach(disconnect)
				return null
			case 'type':
				throw new Error('これから考える')
		}
	}
}

const TypeAll: ExpTypeAll = {
	ast: 'type',
	kind: 'all',
	create: createFn(
		(v: ExpForm = createVoid()) => v,
		createTypeFn(createVector([]), {ast: 'type', kind: 'all'})
	),
}
const ConstTrue = createBoolean(true)
const ConstFalse = createBoolean(false)
const TypeBoolean = uniteType([ConstFalse, ConstTrue])

function createTypeFn(
	params: ExpVector,
	out: ExpData,
	{
		lazyEval = undefined as undefined | boolean[],
		lazyInfer = undefined as undefined | boolean[],
	} = {}
): ExpTypeFn {
	return {
		ast: 'type',
		kind: 'fn',
		params,
		out,
		lazyEval,
		lazyInfer,
	}
}

function containsExp(outer: ExpData, inner: ExpData): boolean {
	if (outer === inner) {
		return true
	}

	if (inner.ast === 'void') {
		return true
	}

	if (outer.ast === 'vector') {
		if (inner.ast !== 'vector') {
			return false
		}

		if (outer.variadic === false) {
			// Fixed length
			return (
				inner.variadic === false &&
				outer.value.length >= inner.value.length &&
				_$.zipShorter(outer.value, inner.value).every(_$.uncurry(containsExp))
			)
		} else {
			// Variadic length
			if (inner.variadic) {
				return (
					outer.value.length === inner.value.length &&
					_$.zipShorter(outer.value, inner.value).every(_$.uncurry(containsExp))
				)
			} else {
				return (
					outer.value.length - 1 <= inner.value.length &&
					_$.zipShorter(outer.value, inner.value).every(_$.uncurry(containsExp))
				)
			}
		}
	}

	if (outer.ast !== 'type') {
		return equalExp(outer, inner)
	}

	switch (outer.kind) {
		case 'all':
			return true
		case 'infUnion':
			if (inner.ast === 'const') {
				return outer.predicate(inner)
			}
			if (inner.ast === 'type') {
				if (inner.kind === 'union') {
					return inner.items.every(ii => containsExp(outer, ii))
				}
				if (inner.kind === 'infUnion') {
					return (
						!!inner.supersets &&
						inner.supersets.some(s => containsExp(outer, s))
					)
				}
			}
			return false
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

function uniteType(items: ExpData[]): ExpData {
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

const ReservedSymbols: {[name: string]: ExpData} = {
	true: createBoolean(true),
	false: createBoolean(false),
	inf: createNumber(Infinity),
	'-inf': createNumber(-Infinity),
	nan: createNumber(NaN),
	All: TypeAll,
	Boolean: TypeBoolean,
	Number: TypeNumber,
	PosNumber: TypePosNumber,
	Int: TypeNumber,
	Nat: TypeNat,
	String: TypeString,
	'#=>': createFn((params: ExpVector, out: ExpData) => {
		return createTypeFn(params, out)
	}, createTypeFn(createVector([TypeAll, TypeAll]), TypeAll)),
	'#|': createFn(
		(items: ExpVector) => uniteType(items.value),
		createTypeFn(createVector([TypeAll], {variadic: true}), TypeAll)
	),
	'#count': createFn(
		(v: ExpData) => createNumber(typeCount(v)),
		createTypeFn(createVector([TypeAll]), TypeNumber)
	),
	let: createFn(
		(_: ExpHashMap, body: ExpForm) => body,
		createTypeFn(
			createVector([
				createTypeFn(createVector([TypeString]), TypeAll),
				TypeAll,
			]),
			TypeAll
		)
	),
}

const GlobalScope = createList([
	createSymbol('let'),
	createHashMap({
		PI: createNumber(Math.PI),
		'+': createFn(
			(value: ExpVector<ExpNumber>) =>
				createNumber(value.value.reduce((sum, {value}) => sum + value, 0)),
			createTypeFn(createVector([TypeNumber], {variadic: true}), TypeNumber)
		),
		'*': createFn(
			(value: ExpVector<ExpNumber>) =>
				createNumber(value.value.reduce((prod, {value}) => prod * value, 1)),
			createTypeFn(createVector([TypeNumber], {variadic: true}), TypeNumber)
		),
		and: createFn(
			(a: ExpBoolean, b: ExpBoolean) => createBoolean(a.value && b.value),
			createTypeFn(createVector([TypeBoolean, TypeBoolean]), TypeBoolean)
		),
		square: createFn(
			(v: ExpNumber) => createNumber(v.value * v.value),
			createTypeFn(createVector([TypeNumber]), TypePosNumber)
		),
		sqrt: createFn(
			(v: ExpNumber) => createNumber(Math.sqrt(v.value)),
			createTypeFn(createVector([TypePosNumber]), TypeNumber)
		),
		not: createFn(
			(v: ExpBoolean) => createBoolean(!v.value),
			createTypeFn(createVector([TypeBoolean]), TypeBoolean)
		),
		'==': createFn(
			(a: ExpForm, b: ExpForm) => createBoolean(equalExp(a, b)),
			createTypeFn(createVector([TypeAll, TypeAll]), TypeBoolean)
		),
		'#>=': createFn(
			(a: ExpType, b: ExpType) => createBoolean(containsExp(a, b)),
			createTypeFn(createVector([TypeAll, TypeAll]), TypeBoolean)
		),
		count: createFn(
			(a: ExpVector) => createNumber(a.value.length),
			createTypeFn(createVector([TypeAll]), TypeNumber)
		),
		if: createFn(
			(cond: ExpBoolean, then: ExpForm, _else: ExpForm) => {
				if (
					cond.ast !== 'const' &&
					cond.ast !== 'infUnionValue' &&
					cond.ast !== 'type'
				) {
					return then
				}
				return cond.value ? _else : then
			},
			createTypeFn(createVector([TypeBoolean, TypeAll, TypeAll]), TypeAll, {
				lazyEval: [false, true, true],
			})
		),
		ast: createFn(
			(v: ExpForm) => createString(v.ast),
			createTypeFn(createVector([TypeAll]), TypeString)
		),
	}),
])

function inferType(exp: ExpForm): ExpData {
	switch (exp.ast) {
		case 'void':
		case 'const':
		case 'type':
		case 'vector':
		case 'hashMap':
			return exp
		case 'symbol':
			return inferType(resolveSymbol(exp))
		case 'list': {
			const first = exp.value[0]

			if (first.ast === 'symbol' && first.value === '=>') {
				return inferType(evalExp(first))
			}
			return inferType(first)
		}
		case 'specialList':
			if (exp.kind === 'vector') {
				return createVector(exp.value.map(inferType), {setParent: false})
			} else {
				return createHashMap(_.mapValues(exp.value, inferType))
			}
		case 'fn':
			return exp.type.out
	}
	throw new Error(`Cannot infer this type for now!! ${printExp(exp)}`)
}

function cloneExp<T extends ExpForm>(exp: T) {
	return deepClone(exp)
}

function clearEvaluatedRecursively(exp: ExpForm) {
	switch (exp.ast) {
		case 'symbol':
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

function equalExp(a: ExpForm, b: ExpForm): boolean {
	if (a === b) {
		return true
	}

	switch (a.ast) {
		case 'void':
			return b.ast === 'void'
		case 'symbol':
			return a.ast === b.ast && a.value === b.value
		case 'const':
			if (b.ast !== 'const') {
				return false
			}
			switch (typeof a.value) {
				case 'boolean':
				case 'number':
				case 'string':
					return a.value === b.value
			}
			break
		case 'list':
			return (
				a.ast === b.ast &&
				a.value.length === b.value.length &&
				_$.zipShorter(a.value, b.value).every(_$.uncurry(equalExp))
			)
		case 'vector':
			return (
				a.ast === b.ast &&
				a.value.length === b.value.length &&
				a.variadic === b.variadic &&
				_$.zipShorter(a.value, b.value).every(_$.uncurry(equalExp))
			)
		case 'hashMap':
			return (
				a.ast === b.ast &&
				_.xor(_.keys(a.value), _.keys(b.value)).length === 0 &&
				_.toPairs(a.value).every(([key, av]) => equalExp(av, b.value[key]))
			)
		case 'specialList':
			if (b.ast !== 'specialList') {
				return false
			}
			if (a.kind === 'vector') {
				return (
					b.kind === 'vector' &&
					a.variadic === b.variadic &&
					a.value.length === b.value.length &&
					_$.zipShorter(a.value, b.value).every(_$.uncurry(equalExp))
				)
			} else if (a.kind === 'hashMap') {
				return (
					b.kind === 'hashMap' &&
					_.xor(_.keys(a.value), _.keys(b.value)).length === 0 &&
					_.toPairs(a.value).every(([key, av]) => equalExp(av, b.value[key]))
				)
			}
			throw new Error('Why!!!!!!!!Kosdif')
		case 'fn':
			return b.ast === 'fn' && a.value === b.value
		case 'type':
			return b.ast === 'type' && equalType(a, b)
	}

	function equalType(a: ExpType, b: ExpType): boolean {
		if (b.ast !== 'type') {
			return false
		}
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
				return _.differenceWith(a.items, b.items, equalExp).length === 0
			}
			case 'fn':
				return (
					b.kind === 'fn' &&
					equalExp(a.out, b.out) &&
					equalExp(a.params, b.params)
				)
		}
	}
}

function resolveSymbol(sym: ExpSymbol): ExpForm {
	if (sym.ref) {
		return sym.ref
	}

	let ref: ExpForm | undefined
	if (sym.value in ReservedSymbols) {
		ref = ReservedSymbols[sym.value]
	} else {
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

		// this.vars.value['def'] = createFn(
		// 	(sym: ExpSymbol, value: ExpForm) => {
		// 		this.vars.value[sym.value] = value
		// 		value.parent = this.vars
		// 		return value
		// 	},
		// 	// NOTE: This should be TypeSymbol
		// 	createTypeFn([TypeAll, TypeAll], TypeAll, {
		// 		lazyEval: [true, true],
		// 		lazyInfer: [true, false],
		// 	})
		// )

		this.scope = createList([createSymbol('let'), this.vars])
		this.scope.parent = GlobalScope
	}

	evalExp(exp: ExpForm): ExpForm {
		exp.parent = this.scope
		return evalExp(exp)
	}
}

function typeCount(exp: ExpForm): number {
	switch (exp.ast) {
		case 'void':
			return 0
		case 'const':
		case 'symbol':
		case 'fn':
			return 1
		case 'vector':
			if (exp.variadic) {
				return Infinity
			} else {
				return exp.value.reduce((count, v) => count * typeCount(v), 1)
			}
		case 'hashMap':
			return _.values(exp.value).reduce((count, v) => count * typeCount(v), 1)
		case 'list':
		case 'specialList':
			return typeCount(inferType(exp))
		case 'type':
			switch (exp.kind) {
				case 'all':
				case 'infUnion':
					return Infinity
				case 'union':
					return exp.items.reduce((count, v) => count + typeCount(v), 0)
				case 'fn':
					return typeCount(exp.out)
			}
	}
}

export function evalExp(exp: ExpForm): ExpData {
	return evalWithTrace(exp, [])

	function evalWithTrace(exp: ExpForm, trace: ExpForm[]): ExpData {
		// Check circular reference
		if (trace.includes(exp)) {
			const lastTrace = trace[trace.length - 1]
			throw new Error(`Circular reference ${printExp(lastTrace)}`)
		}
		trace = [...trace, exp]

		// Use cache
		if ('evaluated' in exp && exp.evaluated) {
			return exp.evaluated
		}

		const _eval = _.partial(evalWithTrace, _, trace)

		switch (exp.ast) {
			case 'void':
			case 'const':
			case 'fn':
			case 'type':
			case 'vector':
			case 'hashMap':
				return exp
			case 'symbol': {
				const ref = resolveSymbol(exp)
				return (exp.evaluated = _eval(ref))
			}
			case 'list': {
				const [first, ...rest] = exp.value

				// Check Special form
				// if (first.ast === 'symbol') {
				// 	switch (first.value) {
				// 		case '=>': {
				// 			// Create a function
				// 			const [paramsDef, bodyDef] = rest

				// 			// Validate parameter part
				// 			if (paramsDef.ast !== 'type' || paramsDef.kind !== 'vector') {
				// 				const str = printExp(paramsDef)
				// 				throw new Error(
				// 					`Function parameters '${str}' must be a vector type`
				// 				)
				// 			}

				// 			// Check if every element is symbol
				// 			const nonSymbol = paramsDef.items.find(p => p.ast !== 'symbol')
				// 			if (nonSymbol) {
				// 				throw new Error(
				// 					`Parameter '${printExp(nonSymbol)}' must be a symbol`
				// 				)
				// 			}

				// 			const paramSymbols = paramsDef.items as ExpSymbol[]

				// 			// Find duplicated symbols
				// 			const uniqSymbols = _.uniqWith(paramSymbols, equalExp)

				// 			if (uniqSymbols.length !== paramSymbols.length) {
				// 				const duplicatedSymbols = uniqSymbols.flatMap(sym =>
				// 					paramSymbols.filter(_.partial(equalExp, sym)).length > 1
				// 						? [sym]
				// 						: []
				// 				)
				// 				const str = duplicatedSymbols
				// 					.map(printExp)
				// 					.map(s => `'${s}'`)
				// 					.join(', ')
				// 				throw new Error(
				// 					`Duplicated symbols ${str} has found in parameter`
				// 				)
				// 			}

				// 			// Create scope
				// 			const paramsHashMap = createHashMap(
				// 				Object.fromEntries(paramSymbols.map(sym => [sym.value, sym]))
				// 			)

				// 			const fnScope = createList([
				// 				createSymbol('let'),
				// 				paramsHashMap,
				// 				cloneExp(bodyDef),
				// 			])

				// 			fnScope.parent = exp.parent

				// 			// Define function
				// 			const fn = (...params: ExpForm[]) => {
				// 				// Set params
				// 				paramSymbols.forEach(
				// 					(sym, i) => (paramsHashMap.value[sym.value] = params[i])
				// 				)

				// 				// Evaluate
				// 				const out = _eval(fnScope)

				// 				// Clean params
				// 				paramSymbols.forEach(sym =>
				// 					clearEvaluatedRecursively(paramsHashMap.value[sym.value])
				// 				)

				// 				return out
				// 			}

				// 			// Infer function type
				// 			const paramTypes = Array(paramSymbols.length).fill(TypeAll)
				// 			const outType = inferType(bodyDef)
				// 			const fnType = createTypeFn(paramTypes, outType, {
				// 				variadic: paramsDef.variadic,
				// 			})

				// 			return (exp.evaluated = createFn(fn, fnType))
				// 		}
				// 	}
				// }

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

				const expanded = (exp.expanded = fnValue(...evaluatedParams))
				return (exp.evaluated = _eval(expanded))
			}
			case 'specialList':
				if (exp.kind === 'vector') {
					const value = exp.value.map(_eval)
					return createVector(value, {variadic: exp.variadic})
				} else if (exp.kind === 'hashMap') {
					const out: ExpHashMap = {
						ast: 'hashMap',
						value: {},
					}
					Object.entries(exp.value).forEach(
						([sym, v]) => (out.value[sym] = _eval(v))
					)

					return (exp.evaluated = out)
				}
				throw new Error('Invalid kind of specialForm')
		}
	}
}

function assignExp(target: ExpForm, source: ExpForm): ExpForm {
	const sourceType = inferType(source)

	switch (target.ast) {
		case 'void':
		case 'const':
			if (!equalExp(target, sourceType)) {
				throw new Error(
					`Cannot assign '${printExp(source)}' to '${printExp(target)}'`
				)
			}
			return source
		case 'vector':
			if (source.ast === 'specialList' && source.kind === 'vector') {
				if (!containsExp(target, sourceType)) {
					throw new Error(
						`Cannot assign '${printExp(source)}' to '${printExp(target)}'`
					)
				}
			} else if (source.ast !== 'vector') {
				throw new Error(
					`Cannot assign '${printExp(source)}' to '${printExp(target)}'`
				)
			}
			if (target.variadic) {
				const restPos = target.value.length - 1
				const fixedPart = _.take(source.value, restPos)
				const restPart = createSpecialListVector(source.value.slice(restPos), {
					setParent: false,
				})
				return createSpecialListVector([...fixedPart, restPart], {
					setParent: false,
				})
			} else {
				return createSpecialListVector(
					_.take(source.value, target.value.length),
					{setParent: false}
				)
			}
			break
		case 'type':
			if (!containsExp(target, sourceType)) {
				throw new Error(
					`Cannot assign '${printExp(source)}' to '${printExp(target)}'`
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
function createVoid(): ExpVoid {
	return {ast: 'void'}
}

function createBoolean(value: boolean): ExpBoolean {
	return {
		ast: 'const',
		value,
	}
}

function createNumber(value: number): ExpNumber {
	return {
		ast: 'const',
		supersets: TypeNumber,
		value,
	}
}

function createString(value: string): ExpString {
	return {
		ast: 'const',
		supersets: TypeString,
		value,
	}
}

function createSymbol(value: string): ExpSymbol {
	return {
		ast: 'symbol',
		value,
	}
}

function createFn(value: (...params: any[]) => ExpBase, type?: ExpForm): ExpFn {
	if (!type || type.ast !== 'type' || type.kind !== 'fn') {
		type = createTypeFn(
			createVector(_.times(value.length, () => TypeAll)),
			TypeAll
		)
	}

	return {
		ast: 'fn',
		value: typeof value === 'string' ? eval(value) : value,
		type,
	}
}

function createList(value: ExpForm[], {setParent = false} = {}): ExpList {
	const exp: ExpList = {
		ast: 'list',
		value,
	}

	if (setParent) {
		value.forEach(v => (v.parent = exp))
	}

	return exp
}

function createVector(
	value: ExpData[],
	{setParent = true, variadic = false} = {}
): ExpVector {
	const exp: ExpVector = {
		ast: 'vector',
		value,
		variadic,
	}

	if (setParent) {
		value.forEach(v => (v.parent = exp))
	}

	return exp
}

function createSpecialListVector(
	value: ExpForm[],
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
		case 'void':
			return 'void'
		case 'const':
			switch (typeof exp.value) {
				case 'boolean':
					return exp.value ? 'true' : 'false'
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
					return `Type::${printType(exp.value)}`
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
		case 'specialList':
			if (exp.kind === 'vector') {
				{
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
			}
			throw new Error('Invalid specialList and cannot print it')
		case 'vector': {
			const value: ExpForm[] = [...exp.value]
			const delimiters = ['', ..._.times(value.length - 1, () => ' '), '']
			if (exp.variadic) {
				value.splice(-1, 0, createSymbol('...'))
				delimiters.push('')
			}
			return printSeq('[', ']', value, delimiters)
		}
		case 'hashMap': {
			const {value} = exp
			const keys = Object.keys(value)

			const keyForms = _.keys(exp.value).map(toHashKey)

			const coll = keys.flatMap((k, i) => [keyForms[i], value[k]])
			const delimiters = [
				'',
				...Array(keys.length - 1)
					.fill([': ', ' '])
					.flat(),
				': ',
				'',
			]

			return printSeq('{', '}', coll, delimiters)
		}
		case 'fn':
			return `(=> ${printExp(exp.type.params)} ${printExp(exp.type.out)})`
		case 'type':
			return printType(exp)
	}

	function toHashKey(value: string): ExpSymbol | ExpString {
		if (SymbolIdentiferRegex.test(value)) {
			return {ast: 'symbol', value, str: value}
		} else {
			return {ast: 'const', supersets: TypeString, value}
		}
	}

	function printType(exp: ExpType): string {
		switch (exp.kind) {
			case 'all':
				return 'All'
			case 'infUnion':
				switch (exp) {
					case TypeNumber:
						return 'Number'
					case TypePosNumber:
						return 'PosNumber'
					case TypeInt:
						return 'Int'
					case TypeNat:
						return 'Nat'
					case TypeString:
						return 'String'
					default:
						throw new Error('Cannot print this InfUnion')
				}
			case 'fn':
				return `(#=> ${printExp(exp.params)} ${printExp(exp.out)})`
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
				return `(#| ${items})`
			}
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
