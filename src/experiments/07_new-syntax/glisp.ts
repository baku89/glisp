import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

function shouldQuote(name: string) {
	return !(
		name === '...' || name.match(/^[a-z_+\-*=?|&<>@][0-9a-z_+\-*=?|&<>@]*$/i)
	)
}

type Form = Exp | Value

// Value
type Value =
	| ValuePrim
	| Value[]
	| ValueAll
	| ValueVoid
	| ValueRestVector
	| ValueHashMap
	| ValueFn
	| ValueLabel
	| ValueUnion
	| ValueInfUnion
	| ValueFnType

type ValuePrim = null | boolean | number | string

interface ValueAll {
	type: 'all'
}

interface ValueVoid {
	type: 'void'
}

interface ValueRestVector {
	type: 'restVector'
	value: Value[]
}

interface ValueHashMap {
	type: 'hashMap'
	value: {
		[key: string]: Value
	}
}

type IFn = (...params: Form[]) => Form

interface ValueFn {
	type: 'fn'
	body: IFn
	fnType: ValueFnType
}

interface ValueLabel {
	type: 'label'
	label: string
	body: Exclude<Value, ValueLabel>
}

interface ValueUnion {
	type: 'union'
	items: Value[]
	original?: ExpValue<ValueUnion>
}

interface ValueInfUnion {
	type: 'infUnion'
	predicate: (v: ValuePrim) => boolean
	original?: ExpValue<ValueInfUnion>
	supersets?: ValueInfUnion[]
}

interface ValueFnType {
	type: 'fnType'
	params: Value[] | ValueRestVector
	out: Value
	lazyEval?: boolean[]
	lazyInfer?: boolean[]
}

// Exp
type Exp =
	| ExpValue
	| ExpSymbol
	| ExpPath
	| ExpScope
	| ExpList
	| ExpVector
	| ExpHashMap
	| ExpLabel

interface ExpBase {
	parent?: ExpScope | ExpList | ExpVector | ExpHashMap | ExpLabel
	dep?: Set<ExpSymbol | ExpPath>
}

interface ExpProgram {
	ast: 'program'
	value: Exp
	delimiters: [string, string]
}

interface ExpValue<T extends Value = Value> extends ExpBase {
	ast: 'value'
	value: T
	str?: string
}

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	value: string
	quoted?: boolean
	ref?: Exp
}

interface ExpPath extends ExpBase {
	ast: 'path'
	value: ({value: string; quoted?: boolean} | '..' | '.')[]
	ref?: Exp
}

interface ExpScope extends ExpBase {
	ast: 'scope'
	vars: {
		[name: string]: Exclude<Exp, ExpLabel>
	}
	value: Exclude<Exp, ExpLabel>
}

interface ExpList extends ExpBase {
	ast: 'list'
	value: Exp[]
	delimiters?: string[]
	assigned?: AssignResult
	expanded?: Form
	evaluated?: Value
}

interface ExpVector extends ExpBase {
	ast: 'vector'
	value: Exp[]
	rest: boolean
	delimiters?: string[]
	evaluated?: Value[]
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	value: {
		[key: string]: Exclude<Exp, ExpLabel>
	}
	delimiters?: string[]
	evaluated?: ValueHashMap
}

interface ExpLabel extends ExpBase {
	ast: 'label'
	label: string
	body: Exclude<Exp, ExpLabel>
	delimiters?: string[]
}

function wrapTypeInfUnion(value: ValueInfUnion) {
	const exp: ExpValue<ValueInfUnion> = {
		ast: 'value',
		value,
	}
	value.original = exp
	return exp
}

function wrapTypeUnion(value: ValueUnion) {
	const exp: ExpValue<ValueUnion> = {
		ast: 'value',
		value,
	}
	value.original = exp
	return exp
}

//-------------------------------------------------------
// Types

const TypeNumber = createInfUnion({
	predicate: v => typeof v === 'number',
})

const TypeInt = createInfUnion({
	supersets: [TypeNumber],
	predicate: v => Number.isInteger(v),
})

const TypePosNumber = createInfUnion({
	supersets: [TypeNumber],
	predicate: v => typeof v === 'number' && v >= 0,
})

const TypeNat = createInfUnion({
	supersets: [TypeInt, TypePosNumber],
	predicate: v => typeof v === 'number' && v >= 0 && Number.isInteger(v),
})

const TypeString = createInfUnion({
	predicate: v => typeof v === 'string',
})

const parser = peg.generate(ParserDefinition)

export function readStr(str: string): Exp {
	const program = parser.parse(str) as ExpProgram | null

	if (program) {
		console.log(program.value)
		return program.value
	} else {
		return wrapExp(TypeVoid)
	}
}

function hasAncestor(target: Exp, ancestor: Exp): boolean {
	if (target === ancestor) {
		return true
	}
	if (!target.parent) {
		return false
	}
	return hasAncestor(target.parent, ancestor)
}

export function disconnectExp(exp: Exp): null {
	return disconnect(exp)

	function disconnect(e: Exp): null {
		if (e.dep) {
			for (const d of e.dep) {
				if (!hasAncestor(d, exp)) {
					e.dep?.delete(d)
					delete d.ref
				}
			}
		}

		switch (e.ast) {
			case 'value':
				return null
			case 'symbol':
			case 'path':
				if (e.ref && !hasAncestor(e.ref, exp)) {
					// Clear reference
					e.ref.dep?.delete(e)
					delete e.ref
				}
				return null
			case 'scope':
				_.values(e.vars).forEach(disconnect)
				disconnect(e.value)
				return null
			case 'list':
			case 'vector':
				e.value.forEach(disconnect)
				return null
			case 'hashMap':
				_.values(e.value).forEach(disconnect)
				return null
			case 'label':
				disconnect(e.body)
				return null
		}
	}
}

const TypeAll: ValueAll = {
	type: 'all',
}

const TypeVoid: ValueVoid = {type: 'void'}

const TypeBoolean: ValueUnion = {
	type: 'union',
	items: [true, false],
}

function createInfUnion(
	exp: Omit<ValueInfUnion, 'type' | 'original'>
): ValueInfUnion {
	return {
		type: 'infUnion',
		...exp,
	}
}
function createFnType(
	params: Value[] | ValueRestVector,
	out: Value,
	{lazyEval = undefined as undefined | boolean[]} = {}
): ValueFnType {
	return {
		type: 'fnType',
		params,
		out,
		lazyEval,
	}
}

function containsValue(outer: Value, inner: Value): boolean {
	inner = removeLabel(inner)

	if (outer === inner) {
		return true
	}

	if (isPrim(outer)) {
		return isEqualValue(outer, inner)
	}

	if (Array.isArray(outer)) {
		return (
			Array.isArray(inner) &&
			outer.length >= inner.length &&
			_$.zipShorter(outer, inner).every(_.spread(containsValue))
		)
	}

	if (isVoid(inner)) {
		return true
	}

	switch (outer.type) {
		case 'void':
		case 'fn':
			return isEqualValue(outer, inner)
		case 'restVector':
			if (isRestVector(inner)) {
				return (
					outer.value.length === inner.value.length &&
					_$.zipShorter(outer.value, inner.value).every(_.spread(containsValue))
				)
			}
			if (Array.isArray(inner)) {
				return (
					outer.value.length - 1 <= inner.length &&
					_$.zipShorter(outer.value, inner).every(_.spread(containsValue))
				)
			}
			return false
		case 'hashMap':
			return (
				isHashMap(inner) &&
				_.entries(inner).every(([key, iv]) =>
					containsValue(outer.value[key], iv)
				)
			)
		case 'label':
			return containsValue(outer.body, inner)
		case 'all':
			return true
		case 'infUnion':
			if (isPrim(inner)) {
				return outer.predicate(inner)
			}
			if (isUnion(inner)) {
				return inner.items.every(ii => containsValue(outer, ii))
			}
			if (isInfUion(inner)) {
				if (outer.original === inner.original) {
					return true
				}
				return (
					!!inner.supersets &&
					inner.supersets.some(s => containsValue(outer, s))
				)
			}
			return false
		case 'union': {
			const innerItems = isUnion(inner) ? inner.items : [inner]
			if (outer.items.length < innerItems.length) {
				return false
			}
			return !!innerItems.some(ii =>
				outer.items.some(_.partial(containsValue, _, ii))
			)
		}
		case 'fnType':
			if (isFnType(inner)) {
				return (
					containsValue(outer.params, inner.params) &&
					containsValue(outer.out, inner.out)
				)
			}
			if (isFn(inner)) {
				return (
					containsValue(outer.params, inner.fnType.params) &&
					containsValue(outer.out, inner.fnType.out)
				)
			}
			return containsValue(outer.out, inner)
	}
}

function uniteType(items: Value[]): Value {
	if (items.length === 0) {
		return TypeAll
	}

	const unionType = items.reduce((a, b) => {
		if (containsValue(a, b)) {
			return a
		}
		if (containsValue(b, a)) {
			return b
		}

		const aItems = isUnion(a) ? a.items : [a]
		const bItems = isUnion(b) ? b.items : [b]

		return {
			type: 'union',
			items: [...aItems, ...bItems],
		}
	}, TypeVoid)

	if (isUnion(unionType)) {
		return {...unionType}
	}

	return unionType
}

function wrapExp<T extends Value>(value: T): ExpValue<T> {
	return {
		ast: 'value',
		value,
	}
}

const GlobalScope = createExpScope({
	Boolean: wrapTypeUnion(TypeBoolean),
	Number: wrapTypeInfUnion(TypeNumber),
	PosNumber: wrapTypeInfUnion(TypePosNumber),
	Int: wrapTypeInfUnion(TypeInt),
	Nat: wrapTypeInfUnion(TypeNat),
	String: wrapTypeInfUnion(TypeString),
	'@=>': createFn(
		(params: Value[], out: Value) => createFnType(params, out),
		[TypeAll, TypeAll],
		TypeAll
	),
	'@|': createFn(
		(items: Value[]) => uniteType(items),
		createRestVector([TypeAll]),
		TypeAll
	),
	'@count': createFn((v: Value) => typeCount(v), [TypeAll], TypeNumber),
	'<-': createFn(
		(type: Value, value: Exp) => {
			const {params, scope} = assignExp(type, value)
			return createExpHashMap({params, scope: createExpHashMap(scope)})
		},
		[TypeAll, TypeAll],
		TypeAll,
		{
			lazyEval: [false, true],
		}
	),
	length: createFn(
		(v: Value[] | ValueRestVector) => (Array.isArray(v) ? v.length : Infinity),
		[createRestVector([TypeAll])],
		TypeNat
	),
	let: createFn(
		(_: ValueHashMap, body: Exp) => body,
		[createFnType([TypeString], TypeAll), TypeAll],
		TypeAll
	),
	PI: wrapExp(Math.PI),
	'+': createFn(
		(xs: number[]) => xs.reduce((sum, v) => sum + v, 0),
		createRestVector([TypeNumber]),
		TypeNumber
	),
	'*': createFn(
		(xs: number[]) => xs.reduce((prod, v) => prod * v, 1),
		createRestVector([TypeNumber]),
		TypeNumber
	),
	pow: createFn(
		Math.pow,
		[withLabel('base', TypeNumber), withLabel('exponent', TypeNumber)],
		TypeNumber
	),
	take: createFn(
		(n: number, coll: Value[] | ValueRestVector) => {
			if (Array.isArray(coll)) {
				return coll.slice(0, n)
			}
			const newColl = coll.value.slice(0, n)
			newColl.push(
				..._.times(n - newColl.length, () => coll.value[coll.value.length - 1])
			)
			return newColl
		},
		[TypeNat, createRestVector([TypeAll])],
		TypeNumber
	),
	'&&': createFn(
		(a: boolean, b: boolean) => a && b,
		[TypeBoolean, TypeBoolean],
		TypeBoolean
	),
	square: createFn((v: number) => v * v, [TypeNumber], TypePosNumber),
	sqrt: createFn(Math.sqrt, [TypePosNumber], TypePosNumber),
	not: createFn((v: boolean) => !v, [TypeBoolean], TypeBoolean),
	'==': createFn(isEqualValue, [TypeAll, TypeAll], TypeBoolean),
	'@>=': createFn(containsValue, [TypeAll, TypeAll], TypeBoolean),
	'@type': createFn(getType, [TypeAll], TypeAll),
	count: createFn(
		(a: Value[]) => a.length,
		[createRestVector([TypeAll])],
		TypeNumber
	),
	if: createFn(
		(cond: boolean, then: Exp, _else: Exp) => (cond ? then : _else),
		[TypeBoolean, TypeAll, TypeAll],
		TypeAll,
		{
			lazyEval: [false, true, true],
		}
	),
})

function getType(v: Value): Exclude<Value, ValuePrim> {
	if (isPrim(v)) {
		if (v === null) {
			return TypeAll
		}
		switch (typeof v) {
			case 'boolean':
				return TypeBoolean
			case 'number':
				return TypeNumber
			case 'string':
				return TypeString
		}
	}

	if (Array.isArray(v)) {
		return v.map(getType)
	}

	switch (v.type) {
		case 'all':
			return TypeAll
		case 'void':
			return TypeVoid
		case 'union':
			return uniteType(v.items.map(getType)) as Exclude<Value, ValuePrim>
		case 'label':
			return getType(v.body)
		case 'restVector':
			return createRestVector(v.value.map(getType))
		case 'fn':
			return v.fnType
		case 'infUnion':
		case 'fnType':
			return v
		case 'hashMap':
			return createHashMap(_.mapValues(v.value, getType))
	}
}

function isValue(form: Form): form is Value {
	return isPrim(form) || Array.isArray(form) || 'type' in form
}

function isPrim(value: Value | Exp): value is ValuePrim {
	return (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'number' ||
		typeof value === 'string'
	)
}

// Type predicates

function isAll(value: Value): value is ValueAll {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'all'
}

function isVoid(value: Value): value is ValueVoid {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'void'
}

function isRestVector(value: Value): value is ValueRestVector {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'restVector'
}

function isHashMap(value: Value): value is ValueHashMap {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'restVector'
}

function isFn(value: Value): value is ValueFn {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'fn'
}

function isUnion(value: Value): value is ValueUnion {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'union'
}

function isInfUion(value: Value): value is ValueInfUnion {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'infUnion'
}

function isFnType(value: Value): value is ValueFnType {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'fnType'
}

function isLabel(value: Value): value is ValueLabel {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'label'
}

function removeLabel(value: Value): Exclude<Value, ValueLabel> {
	return isLabel(value) ? removeLabel(value.body) : value
}

function removeExpLabel(exp: Exp): Exclude<Exp, ExpLabel> {
	return exp.ast === 'label' ? removeExpLabel(exp.body) : exp
}

function inferType(form: Form): Value {
	if (isValue(form)) {
		return form
	}

	switch (form.ast) {
		case 'value':
			return form.value
		case 'symbol':
		case 'path':
			return inferType(resolveRef(form))
		case 'scope':
			return inferType(form.value)
		case 'list': {
			const first = form.value[0]
			if (isListOf('=>', form)) {
				return inferType(evalExp(first))
			}
			return inferType(first)
		}
		case 'vector':
			return form.value.map(inferType)
		case 'hashMap':
			return createHashMap(_.mapValues(form.value, inferType))
		case 'label':
			return inferType(form.body)
	}
}

function resolveParams(exp: ExpList): AssignResult<ExpVector> {
	const [first, ...rest] = exp.value

	const fn = evalExp(first)

	if (!isFn(fn)) {
		throw new Error('First element is not a function')
	}

	const fnType = fn.fnType

	const paramsOriginal = createExpVector(rest, {setParent: false})
	const assigned = assignExp(fnType.params, paramsOriginal)

	if (assigned.params.ast !== 'vector') {
		throw new Error('why??????????')
	}

	exp.assigned = assigned

	return assigned as AssignResult<ExpVector>
}

function clearEvaluatedRecursively(exp: Exp) {
	switch (exp.ast) {
		case 'list':
		case 'vector':
		case 'hashMap':
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

function isEqualValue(a: Value, b: Value): boolean {
	b = removeLabel(b)

	if (isPrim(a)) {
		if (
			typeof a === 'number' &&
			typeof b === 'number' &&
			isNaN(a) &&
			isNaN(b)
		) {
			return true
		}
		return a === b
	}

	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false
		}
		return (
			a.length === b.length && _$.zipShorter(a, b).every(_.spread(isEqualValue))
		)
	}

	switch (a.type) {
		case 'all':
			return isAll(b)
		case 'void':
			return isVoid(b)
		case 'restVector':
			return (
				isRestVector(b) &&
				a.value.length === b.value.length &&
				_$.zipShorter(a.value, b.value).every(_.spread(isEqualValue))
			)
		case 'hashMap':
			return (
				isHashMap(b) &&
				_.xor(_.keys(a.value), _.keys(b.value)).length === 0 &&
				_.toPairs(a.value).every(([key, av]) =>
					isEqualValue(av, (b as ValueHashMap).value[key])
				)
			)
		case 'fn':
			return isFn(b) && a.body === b.body
		case 'label':
			return isEqualValue(a.body, b)
		case 'union': {
			return (
				isUnion(b) &&
				a.items.length === b.items.length &&
				_.differenceWith(a.items, b.items, isEqualValue).length === 0
			)
		}
		case 'infUnion':
			return a === b
		case 'fnType':
			return (
				isFnType(b) &&
				isEqualValue(a.out, b.out) &&
				isEqualValue(a.params, b.params)
			)
	}
}

function resolveRef(
	exp: ExpSymbol | ExpPath
): Exclude<Exp, ExpSymbol | ExpPath> {
	return resolve(exp, [])

	function resolve(
		exp: ExpSymbol | ExpPath,
		trace: (ExpSymbol | ExpPath)[]
	): Exclude<Exp, ExpSymbol | ExpPath> {
		// Check circular reference
		if (trace.includes(exp)) {
			const lastTrace = trace[trace.length - 1]
			throw new Error(`Circular reference ${printForm(lastTrace)}`)
		}

		let ref: Exp | undefined

		if (exp.ref) {
			ref = exp.ref
		} else {
			if (exp.ast === 'symbol') {
				let parent: Exp | undefined = exp

				while ((parent = parent.parent)) {
					if (parent.ast === 'scope' && (ref = parent.vars[exp.value])) {
						break
					}
				}
			} else {
				// Path
				if (!exp.parent) {
					throw new Error(`Cannot resolve the symbol ${printForm(exp)}`)
				}
				ref = exp.parent
				const pathList = [...exp.value]
				const firstEl = pathList[0]

				if (typeof firstEl !== 'string') {
					const firstSym = createExpSymbol(firstEl.value)
					firstSym.parent = exp.parent
					ref = resolveRef(firstSym)
					pathList.shift()
				}

				for (const el of pathList) {
					switch (el) {
						case '.':
							continue
						case '..':
							if (!ref.parent) {
								throw new Error(`Cannot resolve the symbol ${printForm(exp)}`)
							}
							ref = ref.parent
							break
						default: {
							const name = el.value
							switch (ref.ast) {
								case 'scope':
									if (!ref.vars[name]) {
										throw new Error(
											`Cannot resolve the symbol ${printForm(exp)}`
										)
									}
									ref = ref.vars[name]
									break
								case 'list': {
									const {scope} = resolveParams(ref)
									if (!scope[name]) {
										throw new Error(
											`Cannot resolve the symbol ${printForm(exp)}`
										)
									}
									ref = scope[name]
									break
								}
								case 'hashMap':
									if (!ref.value[name]) {
										throw new Error(
											`Cannot resolve the symbol ${printForm(exp)}`
										)
									}
									ref = ref.value[name]
									break
							}
						}
					}
				}
			}

			if (!ref) {
				throw new Error(`Symbol ${printForm(exp)} is not defined`)
			}

			exp.ref = ref
			ref.dep = (ref.dep || new Set()).add(exp)
		}

		if (ref.ast === 'symbol' || ref.ast === 'path') {
			return resolve(ref, [...trace, exp])
		}

		return ref
	}
}

export class Interpreter {
	private scope: ExpScope
	private vars: ExpScope['vars']

	constructor() {
		this.vars = {}

		this.vars['def'] = createFn(
			(value: Exp) => {
				if (value.ast !== 'label') {
					throw new Error('no label')
				}
				this.vars[value.label] = value.body
				value.parent = this.scope
				return value
			},
			[TypeAll],
			TypeAll,
			{lazyEval: [true]}
		)

		this.scope = createExpScope(this.vars)
		this.scope.parent = GlobalScope
	}

	evalExp(exp: Exp): Value {
		exp.parent = this.scope
		return evalExp(exp)
	}
}

function typeCount(value: Value): number {
	if (isPrim(value) || Array.isArray(value)) {
		return 1
	}

	if (Array.isArray(value)) {
		return value.reduce((count, d) => count * typeCount(d), 1)
	}

	switch (value.type) {
		case 'label':
			return typeCount(value.body)
		case 'void':
			return 0
		case 'fn':
			return 1
		case 'all':
		case 'infUnion':
		case 'restVector':
			return Infinity
		case 'hashMap':
			return _.values(value.value).reduce(
				(count: number, d) => count * typeCount(d),
				1
			)
		case 'union':
			return value.items.reduce((count: number, v) => count + typeCount(v), 0)
		case 'fnType':
			return typeCount(value.out)
	}
}

export function evalExp(exp: Exp): Value {
	// Use cache
	if ('evaluated' in exp && exp.evaluated) {
		return exp.evaluated
	}

	const _eval = (e: Exp) => {
		const evaluated = evalExp(e)
		if (e.ast === 'list' || e.ast === 'vector' || e.ast === 'hashMap') {
			e.evaluated = evaluated
		}
		return evaluated
	}

	switch (exp.ast) {
		case 'label':
			return {
				type: 'label',
				label: exp.label,
				body: _eval(exp.body) as ValueLabel['body'],
			}
		case 'value':
			return exp.value
		case 'symbol':
		case 'path': {
			const ref = resolveRef(exp)
			return _eval(ref)
		}
		case 'scope':
			return _eval(exp.value)
		case 'list': {
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
					const fnType = createFnType(paramTypes, outType, {
						rest: paramsDef.rest,
					})

					return (exp.evaluated = createFn(fn, fnType))
				} */

			const fn = _eval(exp.value[0])

			if (!isFn(fn)) {
				throw new Error('First element is not a function')
				// Function application
			}

			const fnType = fn.fnType
			const fnBody = fn.body

			const {params} = resolveParams(exp)

			// Eval parameters at first
			const evaluatedParams = params.value.map((p, i) =>
				fnType.lazyEval && fnType.lazyEval[i] ? p : _eval(p)
			)

			const expanded = (exp.expanded = fnBody(...evaluatedParams))
			return isValue(expanded) ? expanded : _eval(expanded)
		}
		case 'vector': {
			const vec = exp.value.map(_eval)
			return exp.rest ? createRestVector(vec) : vec
		}
		case 'hashMap':
			return createHashMap(_.mapValues(exp.value, _eval))
	}
}

interface AssignResult<
	T extends Exclude<Exp, ExpLabel> = Exclude<Exp, ExpLabel>
> {
	params: T
	scope: ExpHashMap['value']
}

function assignExp(target: Value, source: Exp): AssignResult {
	if (isLabel(target)) {
		const {params, scope} = assignExp(target.body, source)
		return {
			params,
			scope: {
				...scope,
				[target.label]: params,
			},
		}
	}

	const sourceType = inferType(source)

	if (isPrim(target)) {
		if (!isEqualValue(target, sourceType)) {
			throw new Error(
				`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
			)
		}
		return {params: removeExpLabel(source), scope: {}}
	}

	if (Array.isArray(target)) {
		if (source.ast !== 'vector' || target.length > source.value.length) {
			throw new Error(
				`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
			)
		}

		const result: AssignResult<ExpVector> = {
			params: createExpVector([]),
			scope: {},
		}

		for (let i = 0; i < target.length; i++) {
			const {params, scope} = assignExp(target[i], source.value[i])
			result.params.value.push(params)
			result.scope = {...result.scope, ...scope}
		}

		return result
	}

	switch (target.type) {
		case 'all':
		case 'void':
		case 'union':
		case 'infUnion':
			if (!containsValue(target, sourceType)) {
				throw new Error(
					`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
				)
			}
			return {params: removeExpLabel(source), scope: {}}
		case 'restVector': {
			if (
				source.ast !== 'vector' ||
				source.rest ||
				!containsValue(target, sourceType)
			) {
				throw new Error(
					`Cannot assign '${printForm(source)}' to '${printForm(target)}'`
				)
			}
			const restPos = target.value.length - 1

			const result: AssignResult<ExpVector> = {
				params: createExpVector([]),
				scope: {},
			}

			// Capture fixed part
			for (let i = 0; i < restPos; i++) {
				const {params, scope} = assignExp(target.value[i], source.value[i])
				result.params.value.push(params)
				result.scope = {...result.scope, ...scope}
			}

			// Capture rest part
			const restCount = source.value.length - restPos
			let restTarget = target.value[target.value.length - 1]
			let label: string | undefined = undefined

			if (isLabel(restTarget)) {
				label = restTarget.label
				restTarget = removeLabel(restTarget)
			}

			const restTargetVector = Array(restCount).fill(restTarget)
			const restSourceVector = createExpVector(source.value.slice(restPos), {
				setParent: false,
			})

			const {params} = assignExp(restTargetVector, restSourceVector)
			result.params.value.push(params)

			if (label) {
				result.scope[label] = params
			}

			return result
		}
		default:
			throw new Error('Cannot assign for this type for now!!!')
	}
}

// Create functions
function createExpSymbol(value: string): ExpSymbol {
	return {
		ast: 'symbol',
		value,
	}
}

function createFn(
	body: (...params: any[]) => Form,
	params: ValueFnType['params'],
	out: ValueFnType['out'],
	{lazyEval = undefined as undefined | boolean[]} = {}
): ExpValue<ValueFn> {
	return {
		ast: 'value',
		value: {
			type: 'fn',
			body: body as IFn,
			fnType: createFnType(params, out, {lazyEval}),
		},
	}
}

function createExpScope(
	vars: ExpScope['vars'],
	value?: Exclude<Exp, ExpLabel>
): ExpScope {
	const exp: ExpScope = {
		ast: 'scope',
		vars,
		value: value || wrapExp(null),
	}

	if (value) {
		value.parent = exp
	}
	_.values(vars).forEach(v => (v.parent = exp))

	return exp
}

function createExpList(value: Exp[], {setParent = true} = {}): ExpList {
	const exp: ExpList = {
		ast: 'list',
		value,
	}

	if (setParent) {
		value.forEach(v => (v.parent = exp))
	}

	return exp
}

function createExpVector(value: Exp[], {setParent = true, rest = false} = {}) {
	const exp: ExpVector = {
		ast: 'vector',
		value,
		rest,
	}

	if (setParent) {
		value.forEach(v => (v.parent = exp))
	}

	return exp
}

function createExpHashMap(value: ExpHashMap['value'], {setParent = true} = {}) {
	const exp: ExpHashMap = {
		ast: 'hashMap',
		value,
	}

	if (setParent) {
		_.values(value).forEach(v => (v.parent = exp))
	}

	return exp
}

function createRestVector(value: Value[]): ValueRestVector {
	const exp: ValueRestVector = {
		type: 'restVector',
		value,
	}

	return exp
}

function createHashMap(value: ValueHashMap['value']): ValueHashMap {
	return {
		type: 'hashMap',
		value,
	}
}

function withLabel(label: string, body: ValueLabel['body']): ValueLabel {
	return {
		type: 'label',
		label,
		body,
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
	if (exp.parent?.ast === 'scope') {
		return _.findKey(exp.parent.vars, e => e === exp) || null
	}
	return null
}

export function printForm(form: Form): string {
	return isValue(form) ? printValue(form) : printExp(form)

	function printExp(exp: Exp): string {
		switch (exp.ast) {
			case 'value':
				return exp.str || printValue(exp.value)
			case 'symbol': {
				const value = exp.value
				const quoted =
					typeof exp.quoted === 'boolean' ? exp.quoted : shouldQuote(value)
				return quoted ? '`' + value + '`' : value
			}
			case 'path':
				return exp.value
					.map(el => {
						if (typeof el === 'string') {
							return el
						}
						const value = el.value
						const quoted =
							typeof el.quoted === 'boolean' ? el.quoted : shouldQuote(value)
						return quoted ? '`' + value + '`' : value
					})
					.join('/')
			case 'scope': {
				const vars = printExp(createExpHashMap(exp.vars))
				const value = printExp(exp.value)
				return `(let ${vars} ${value})`
			}
			case 'list':
				return printSeq('(', ')', exp.value, exp.delimiters)
			case 'vector': {
				const value = [...exp.value]
				const delimiters = exp.delimiters || [
					'',
					..._.times(value.length - 1, () => ' '),
					'',
				]
				if (exp.rest) {
					value.splice(-1, 0, createExpSymbol('...'))
					delimiters.push('')
				}
				return printSeq('[', ']', value, delimiters)
			}
			case 'label': {
				const [d0, d1] = exp.delimiters || ['', '']
				const label = shouldQuote(exp.label) ? exp.label : '"' + exp.label + '"'
				const body = printExp(exp.body)
				return label + d0 + ':' + d1 + body
			}
			default:
				throw new Error('Invalid specialList and cannot print it')
		}
	}

	function printValue(value: Value): string {
		// Print prim
		switch (value) {
			case null:
				return 'null'
			case false:
				return 'false'
			case true:
				return 'true'
		}

		switch (typeof value) {
			case 'number':
				return value.toString()
			case 'string':
				return '"' + value + '"'
		}

		if (Array.isArray(value)) {
			return printSeq('[', ']', value)
		}

		switch (value.type) {
			case 'all':
				return 'All'
			case 'void':
				return 'Void'
			case 'restVector': {
				const val: Form[] = [...value.value]
				const delimiters = ['', ...Array(val.length - 1).fill(' '), '', '']
				val.splice(-1, 0, createExpSymbol('...'))
				return printSeq('[', ']', val, delimiters)
			}
			case 'hashMap': {
				const pairs = _.entries(value.value)
				const coll: ExpLabel[] = pairs.map(([label, body]) => ({
					ast: 'label',
					label,
					body: wrapExp(body),
					delimiters: ['', ' '],
				}))
				const delimiters =
					pairs.length === 0
						? ['']
						: ['', ...Array(pairs.length - 1).fill(' '), '']
				return printSeq('{', '}', coll, delimiters)
			}
			case 'fn': {
				const params = value.fnType.params
				const out = value.fnType.out
				return `(=> ${printValue(params)} ${printValue(out)})`
			}
			case 'label': {
				const label = shouldQuote(value.label)
					? value.label
					: '"' + value.label + '"'
				const body = printValue(value.body)
				return label + ':' + body
			}
			case 'union': {
				if (value.original) {
					const name = getName(value.original)
					if (name) {
						return name
					}
				}
				const items = value.items.map(printForm).join(' ')
				return `(#| ${items})`
			}
			case 'infUnion':
				if (value.original) {
					const name = getName(value.original)
					if (name) {
						return name
					}
				}
				throw new Error('Cannot print this InfUnion')
			case 'fnType':
				return `(#=> ${printForm(value.params)} ${printForm(value.out)})`
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
