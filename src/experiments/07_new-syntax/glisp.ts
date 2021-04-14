import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

function shouldQuote(name: string) {
	return !name.match(/^\.\.\.|[a-z_+\-*=?|&<>@][0-9a-z_+\-*=?|&<>@]*$/i)
}

type Form = Exp | Value

// Value
export type Value =
	| ValuePrim
	| Value[]
	| ValueAll
	| ValueVoid
	| ValueHashMap
	| ValueFn
	| ValueUnion
	| ValueInfUnion
	| ValueVectorType
	| ValueFnType
	| ValueExp

type ValuePrim = null | boolean | number | string

interface ValueAll {
	type: 'all'
}

interface ValueVoid {
	type: 'void'
}

interface ValueHashMap {
	type: 'hashMap'
	value: {
		[key: string]: Value
	}
}

type IFnJS = (...params: Form[]) => Form
type IFnExp = (params: ExpScope['vars']) => Form

interface ValueFnBase {
	type: 'fn'
	params: {
		label: string
		body: Value
		lazy?: boolean
		macro?: boolean
	}[]
	restParam?: {
		label: string
		body: Value
		lazy?: boolean
		macro?: boolean
	}
	out: Value
}

interface ValueFnJS extends ValueFnBase {
	body: IFnJS
	isExp: false
}

interface ValueFnExp extends ValueFnBase {
	body: IFnExp
	isExp: true
}

type ValueFn = ValueFnJS | ValueFnExp

interface ValueUnion {
	type: 'union'
	items: Exclude<Value, ValueUnion>[]
	original?: ExpValue<ValueUnion>
}

interface ValueInfUnion {
	type: 'infUnion'
	predicate: (v: Value) => boolean
	original?: ExpValue<ValueInfUnion>
	supersets?: ValueInfUnion[]
}

interface ValueVectorType {
	type: 'vectorType'
	items: Value
}

interface ValueFnType {
	type: 'fnType'
	params: Value[]
	restParam?: Value
	out: Value
}

interface ValueExp {
	type: 'exp'
	value: Exp
}

// Exp
export type Exp = ExpValue | ExpRef | ExpNode

type ExpNode =
	| ExpScope
	| ExpFn
	| ExpFnType
	| ExpVectorType
	| ExpList
	| ExpVector
	| ExpHashMap

type ExpRef = ExpSymbol | ExpPath

interface ExpBase {
	parent?: ExpNode
	dep?: Set<ExpRef>
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
		[name: string]: Exp
	}
	value: Exp
}

interface ExpFn extends ExpBase {
	ast: 'fn'
	params: {
		label: string
		body: Exp
	}[]
	restParam?: {
		label: string
		body: Exp
	}
	body: Exp
	evaluated?: ValueFn
}

interface ExpFnType extends ExpBase {
	ast: 'fnType'
	params: Exp[]
	restParam?: Exp
	out: Exp
}

interface ExpVectorType extends ExpBase {
	ast: 'vectorType'
	items: Exp
	evaluated?: ValueVectorType
}

interface ExpList extends ExpBase {
	ast: 'list'
	value: Exp[]
	delimiters?: string[]
	expanded?: Form
	evaluated?: Value
}

interface ExpVector extends ExpBase {
	ast: 'vector'
	value: Exp[]
	delimiters?: string[]
	evaluated?: Value[]
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	value: {
		[key: string]: Exp
	}
	delimiters?: string[]
	evaluated?: ValueHashMap
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
	predicate: Number.isInteger,
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

const TypeExp = createInfUnion({
	predicate: isValueExp,
})

const parser = peg.generate(ParserDefinition)

export function readStr(str: string): Exp {
	const program = parser.parse(str) as ExpProgram | null

	if (program) {
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
			case 'fn':
				e.params.forEach(it => disconnect(it.body))
				if (e.restParam) {
					disconnect(e.restParam.body)
				}
				disconnect(e.body)
				return null
			case 'fnType':
				e.params.forEach(disconnect)
				if (e.restParam) {
					disconnect(e.restParam)
				}
				return null
			case 'vectorType':
				disconnect(e.items)
				return null
			case 'list':
			case 'vector':
				e.value.forEach(disconnect)
				return null
			case 'hashMap':
				_.values(e.value).forEach(disconnect)
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
	params: ValueFnType['params'],
	restParam: ValueFnType['restParam'] | null,
	out: Value
): ValueFnType {
	return {
		type: 'fnType',
		params,
		restParam,
		out,
	}
}

function containsValue(outer: Value, inner: Value): boolean {
	if (outer === inner) {
		return true
	}

	if (isValueVoid(inner)) {
		return true
	}

	if (isValuePrim(outer) || isValueExp(outer)) {
		return isEqualValue(outer, inner)
	}

	if (Array.isArray(outer)) {
		return (
			Array.isArray(inner) &&
			outer.length >= inner.length &&
			_$.zipShorter(outer, inner).every(_.spread(containsValue))
		)
	}

	switch (outer.type) {
		case 'void':
		case 'fn':
			return isEqualValue(outer, inner)
		case 'hashMap':
			return (
				isValueHashMap(inner) &&
				_.entries(inner).every(([key, iv]) =>
					containsValue(outer.value[key], iv)
				)
			)
		case 'all':
			return true
		case 'infUnion':
			if (isValueFn(inner) || isValueFnType(inner)) {
				inner = inner.out
			}
			if (isValuePrim(inner)) {
				return outer.predicate(inner)
			}
			if (isValueUnion(inner)) {
				return inner.items.every(ii => containsValue(outer, ii))
			}
			if (isValueInfUion(inner)) {
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
			if (isValueFn(inner) || isValueFnType(inner)) {
				inner = inner.out
			}
			const innerItems = isValueUnion(inner) ? inner.items : [inner]
			if (outer.items.length < innerItems.length) {
				return false
			}
			return !!innerItems.some(ii =>
				outer.items.some(_.partial(containsValue, _, ii))
			)
		}
		case 'vectorType':
			if (isValueVectorType(inner)) {
				return containsValue(outer.items, inner.items)
			}
			if (Array.isArray(inner)) {
				return inner.every(_.partial(containsValue, outer.items))
			}
			return false
		case 'fnType':
			throw new Error('Will implement this later')
		// if (isFnType(inner)) {
		// 	return (
		// 		containsValue(outer.params, inner.params) &&
		// 		containsValue(outer.out, inner.out)
		// 	)
		// }
		// if (isFn(inner)) {
		// 	return (
		// 		containsValue(outer.params, inner.fnType.params) &&
		// 		containsValue(outer.out, inner.fnType.out)
		// 	)
		// }
		// return containsValue(outer.out, inner)
	}
}

function uniteType(items: Value[]): Value {
	if (items.length === 0) {
		return TypeVoid
	}

	const itemList = items.map(t => (isValueUnion(t) ? [...t.items] : [t]))

	for (let i = 0; i < itemList.length; i++) {
		for (let j = 0; j < itemList.length; j++) {
			if (i === j) continue

			const aList = itemList[i]
			const bList = itemList[j]

			for (let ai = aList.length - 1; ai >= 0; ai--) {
				for (const b of bList) {
					if (containsValue(b, aList[ai])) {
						aList.splice(ai, 1)
					}
				}
			}
		}
	}

	const flattenItems = itemList.flat()

	return flattenItems.length === 1
		? flattenItems[0]
		: {
				type: 'union',
				items: flattenItems,
		  }
}

function intersectType(items: Value[]): Value {
	if (items.length === 0) {
		return TypeVoid
	}

	const result = items.reduce((a, b) => {
		if (containsValue(a, b)) {
			return b
		}
		if (containsValue(b, a)) {
			return a
		}

		const aItems = isValueUnion(a) ? a.items : [a]
		const bItems = isValueUnion(b) ? b.items : [b]

		return {
			type: 'union',
			items: _.intersectionWith(aItems, bItems, isEqualValue),
		}
	}, TypeAll)

	if (isValueUnion(result)) {
		if (result.items.length === 0) {
			return TypeVoid
		}

		return {...result}
	}

	return result
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
	Exp: wrapTypeInfUnion(TypeExp),
	'@|': createExpFnJS(
		(items: Value[]) => uniteType(items),
		[],
		{label: 'value', body: TypeAll},
		TypeAll
	),
	'@&': createExpFnJS(
		(items: Value[]) => intersectType(items),
		[],
		{label: 'value', body: TypeAll},
		TypeAll
	),
	'@count': createExpFnJS(
		(v: Value) => typeCount(v),
		[{label: 'value', body: TypeAll}],
		null,
		TypeNumber
	),
	length: createExpFnJS(
		(v: Value[]) => v.length,
		[{label: 'value', body: createVectorType(TypeAll)}],
		null,
		TypeNat
	),
	PI: wrapExp(Math.PI),
	'+': createExpFnJS(
		(xs: number[]) => xs.reduce((sum, v) => sum + v, 0),
		[],
		{label: 'value', body: TypeNumber},
		TypeNumber
	),
	'*': createExpFnJS(
		(xs: number[]) => xs.reduce((prod, v) => prod * v, 1),
		[],
		{label: 'value', body: TypeNumber},
		TypeNumber
	),
	pow: createExpFnJS(
		Math.pow,
		[
			{label: 'base', body: TypeNumber},
			{label: 'exponent', body: TypeNumber},
		],
		null,
		TypeNumber
	),
	take: createExpFnJS(
		(n: number, coll: Value[]) => coll.slice(0, n),
		[
			{label: 'n', body: TypeNat},
			{label: 'coll', body: createVectorType(TypeAll)},
		],
		null,
		TypeNumber
	),
	'&&': createExpFnJS(
		(a: boolean, b: boolean) => a && b,
		[
			{label: 'x', body: TypeBoolean},
			{label: 'y', body: TypeBoolean},
		],
		null,
		TypeBoolean
	),
	square: createExpFnJS(
		(v: number) => v * v,
		[{label: 'value', body: TypeNumber}],
		null,
		TypePosNumber
	),
	sqrt: createExpFnJS(
		Math.sqrt,
		[{label: 'value', body: TypePosNumber}],
		null,
		TypePosNumber
	),
	not: createExpFnJS(
		(v: boolean) => !v,
		[{label: 'value', body: TypeBoolean}],
		null,
		TypeBoolean
	),
	'==': createExpFnJS(
		isEqualValue,
		[
			{label: 'a', body: TypeAll},
			{label: 'b', body: TypeAll},
		],
		null,
		TypeBoolean
	),
	'@>=': createExpFnJS(
		containsValue,
		[
			{label: 'a', body: TypeAll},
			{label: 'b', body: TypeAll},
		],
		null,
		TypeBoolean
	),
	'@type': createExpFnJS(
		getType,
		[{label: 'value', body: TypeAll}],
		null,
		TypeAll
	),
	if: createExpFnJS(
		(cond: boolean, then: Exp, _else: Exp) => (cond ? then : _else),
		[
			{label: 'cond', body: TypeBoolean},
			{label: 'then', body: TypeAll, lazy: true},
			{label: 'else', body: TypeAll, lazy: true},
		],
		null,
		TypeAll
	),
})

function getType(v: Value): Exclude<Value, ValuePrim> {
	if (isValuePrim(v)) {
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
		case 'fn':
			return createFnType(
				v.params.map(p => getType(p.body)),
				v.restParam ? getType(v.restParam.body) : null,
				getType(v.out)
			)
		case 'infUnion':
		case 'fnType':
		case 'vectorType':
			return v
		case 'hashMap':
			return createHashMap(_.mapValues(v.value, getType))
		case 'exp':
			return TypeExp
	}
}

function isValue(form: Form): form is Value {
	return isValuePrim(form) || Array.isArray(form) || 'type' in form
}

function isValuePrim(value: Value | Exp): value is ValuePrim {
	return value !== Object(value)
}

// Type predicates

function isValueAll(value: Value): value is ValueAll {
	return !isValuePrim(value) && !Array.isArray(value) && value.type === 'all'
}

function isValueVoid(value: Value): value is ValueVoid {
	return !isValuePrim(value) && !Array.isArray(value) && value.type === 'void'
}

function isValueHashMap(value: Value): value is ValueHashMap {
	return (
		!isValuePrim(value) && !Array.isArray(value) && value.type === 'hashMap'
	)
}

function isValueFn(value: Value): value is ValueFn {
	return !isValuePrim(value) && !Array.isArray(value) && value.type === 'fn'
}

function isValueUnion(value: Value): value is ValueUnion {
	return !isValuePrim(value) && !Array.isArray(value) && value.type === 'union'
}

function isValueInfUion(value: Value): value is ValueInfUnion {
	return (
		!isValuePrim(value) && !Array.isArray(value) && value.type === 'infUnion'
	)
}

function isValueVectorType(value: Value): value is ValueVectorType {
	return (
		!isValuePrim(value) && !Array.isArray(value) && value.type === 'vectorType'
	)
}

function isValueFnType(value: Value): value is ValueFnType {
	return !isValuePrim(value) && !Array.isArray(value) && value.type === 'fnType'
}

function isValueExp(value: Value): value is ValueExp {
	return !isValuePrim(value) && !Array.isArray(value) && value.type === 'exp'
}

function inferType(form: Exp): Value {
	switch (form.ast) {
		case 'value':
			return form.value
		case 'symbol':
		case 'path':
			return inferType(resolveRef(form))
		case 'scope':
			return inferType(form.value)
		case 'fn':
		case 'fnType':
			return evalExp(form)
		case 'vectorType':
			return createVectorType(inferType(form.items))
		case 'list': {
			const first = form.value[0]
			const fn = evalExp(first)
			if (isValueFn(fn)) {
				return fn.out
			}
			throw new Error('Not a function')
		}
		case 'vector':
			return form.value.map(inferType)
		case 'hashMap':
			return createHashMap(_.mapValues(form.value, inferType))
	}
}

function inferAcceptableType(exp: Exp) {
	if (exp.parent && exp.parent.ast === 'list') {
		const {parent} = exp
		const index = parent.value.indexOf(exp)

		if (index === 0) {
			// Function
			return TypeAll
		}

		const paramIndex = index - 1

		const fn = evalExp(parent.value[0])

		if (!isValueFn(fn)) {
			throw new Error('Not a function')
		}

		if (paramIndex < fn.params.length) {
			return fn.params[paramIndex].body
		} else if (fn.restParam) {
			return fn.restParam.body
		}
	}

	return TypeAll
}

export class GlispError extends Error {
	constructor(message: string, public target: Exp) {
		super(message)
		this.name = 'Glisp'
	}
}

function resolveParams(exp: ExpList): ExpScope['vars'] {
	const [first, ...params] = exp.value

	const fn = evalExp(first)

	if (!isValueFn(fn)) {
		throw new Error('First element is not a function')
	}

	const {params: paramsDef, restParam: restDef} = fn

	const vars: {[label: string]: Exp} = {}

	// Length check
	if (paramsDef.length > params.length) {
		throw new GlispError(
			`Expected ${paramsDef.length} arguments, but got ${params.length}`,
			exp
		)
	}

	// Retrieve fixed part of params
	for (let i = 0; i < paramsDef.length; i++) {
		const {label} = paramsDef[i]
		// if (!containsValue(body, inferType(params[i]))) {
		// 	throw new Error('Cannot assign!!!!!!')
		// }
		vars[label] = params[i]
	}

	if (restDef) {
		const restParams = params.slice(paramsDef.length)
		const restVars = restParams.map(p => {
			// if (!containsValue(restDef.body, inferType(p))) {
			// 	throw new Error('Cannot assign!!! in rest')
			// }
			return p
		})

		vars[restDef.label] = createExpVector(restVars, {setParent: false})
	}

	return vars
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
	if (isValuePrim(a)) {
		return (isNaN(a as any) && isNaN(b as any)) || a === b
	}

	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			_$.zipShorter(a, b).every(_.spread(isEqualValue))
		)
	}

	switch (a.type) {
		case 'all':
			return isValueAll(b)
		case 'void':
			return isValueVoid(b)
		case 'hashMap':
			return (
				isValueHashMap(b) &&
				_.xor(_.keys(a.value), _.keys(b.value)).length === 0 &&
				_.toPairs(a.value).every(([key, av]) =>
					isEqualValue(av, (b as ValueHashMap).value[key])
				)
			)
		case 'fn':
			return isValueFn(b) && a.body === b.body
		case 'union': {
			return (
				isValueUnion(b) &&
				a.items.length === b.items.length &&
				_.differenceWith(a.items, b.items, isEqualValue).length === 0
			)
		}
		case 'infUnion':
			return a === b
		case 'vectorType':
			return isValueVectorType(b) && isEqualValue(a.items, b.items)
		case 'fnType':
			if (!isValueFnType(b)) {
				return false
			}
			if (!isEqualValue(a.out, b.out)) {
				return false
			}
			if (a.params.length !== b.params.length) {
				return false
			}
			if (a.restParam) {
				if (!b.restParam) {
					return false
				}
				if (!isEqualValue(a.restParam, b.restParam)) {
					return false
				}
			} else {
				if (b.restParam) {
					return false
				}
			}
			return _$.zipShorter(a.params, b.params).every(_.spread(isEqualValue))
		case 'exp':
			return isValueExp(b) && a.value === b.value
	}
}

function resolveRef(exp: ExpRef): Exclude<Exp, ExpRef> {
	return resolve(exp, [])

	function resolve(exp: ExpRef, trace: ExpRef[]): Exclude<Exp, ExpRef> {
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
					setAsParent(exp.parent, firstSym)
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
									const scope = resolveParams(ref)
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

		this.vars['def'] = createExpFnJS(
			(symbol: ExpSymbol, value: Exp) => {
				if (this.vars[symbol.value]) {
					clearEvaluatedRecursively(this.vars[symbol.value])
					disconnectExp(this.vars[symbol.value])
				}

				const cloned = cloneExp(value)
				this.vars[symbol.value] = cloned
				setAsParent(this.scope, cloned)
				return value
			},
			[
				{label: 'symbol', body: TypeAll, macro: true},
				{label: 'value', body: TypeAll, lazy: true},
			],
			null,
			TypeAll
		)

		this.scope = createExpScope(this.vars)
		setAsParent(GlobalScope, this.scope)
	}

	evalExp(exp: Exp): Value {
		setAsParent(this.scope, exp)
		return evalExp(exp)
	}
}

function setAsParent(parent: Exclude<Exp['parent'], undefined>, child: Exp) {
	if (child.parent) {
		throw new Error(
			`Expression ${printForm(child)} has a parent ${printForm(child.parent)}`
		)
	}
	child.parent = parent
}

function typeCount(value: Value): number {
	if (isValuePrim(value)) {
		return 1
	}

	if (Array.isArray(value)) {
		return value.reduce((count: number, d) => count * typeCount(d), 1)
	}

	switch (value.type) {
		case 'void':
			return 0
		case 'fn':
		case 'exp':
			return 1
		case 'all':
		case 'infUnion':
		case 'vectorType':
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
		case 'value':
			return exp.value
		case 'symbol':
		case 'path': {
			const ref = resolveRef(exp)
			return _eval(ref)
		}
		case 'scope':
			return _eval(exp.value)
		case 'fn':
			return defineFn(exp)
		case 'vectorType':
			return createVectorType(_eval(exp.items))
		case 'fnType':
			return createFnType(
				exp.params.map(_eval),
				exp.restParam ? _eval(exp.restParam) : undefined,
				_eval(exp.out)
			)
		case 'list': {
			const fn = _eval(exp.value[0])

			if (!isValueFn(fn)) {
				throw new Error('First element is not a function')
				// Function application
			}

			const scope = resolveParams(exp)

			// Type checking
			_.values(scope).forEach((e, i) => {
				if (i < fn.params.length) {
					if (fn.params[i].macro) {
						return
					}
					if (!containsValue(fn.params[i].body, inferType(e))) {
						throw new Error('Cannot assign!!!')
					}
				} else {
					// Rest
					if (!fn.restParam) {
						throw new Error('I dunnot why!!!!!!!2222')
					}
					if (fn.restParam.macro) {
						return
					}
					if (e.ast !== 'vector') {
						throw new Error('I dunnot why!!!!!!!')
					}
					const restType = fn.restParam.body
					if (!e.value.every(r => containsValue(restType, inferType(r)))) {
						throw new Error('Cannot assign!!! in rest')
					}
				}
			})

			// Eval parameters at first
			if (fn.isExp) {
				// Bootstrapped fn

				// Pass parameters as scope
				exp.expanded = fn.body(scope)
			} else {
				// JS-defined fn

				// Evaluate if necessary
				const paramsForm = _.values(scope).map((e, i) => {
					if (i < fn.params.length) {
						const {lazy, macro} = fn.params[i]
						return lazy || macro ? e : _eval(e)
					} else {
						if (!fn.restParam) {
							throw new Error('I donno whyyyyyyyy')
						}
						const {lazy, macro} = fn.restParam
						return lazy || macro ? e : _eval(e)
					}
				})

				// Pass parameters as a list
				exp.expanded = fn.body(...paramsForm)
			}

			return isValue(exp.expanded) ? exp.expanded : _eval(exp.expanded)
		}
		case 'vector':
			return exp.value.map(_eval)
		case 'hashMap':
			return createHashMap(_.mapValues(exp.value, _eval))
	}
}

function cloneExp(exp: Exp): Exp {
	switch (exp.ast) {
		case 'value':
			return {
				ast: 'value',
				value: exp.value,
				str: exp.str,
			}
		case 'symbol':
			return {
				ast: 'symbol',
				value: exp.value,
				quoted: exp.quoted,
			}
		case 'path':
			return {
				ast: 'path',
				value: [...exp.value],
			}
		case 'scope': {
			const cloned: ExpScope = {
				ast: 'scope',
				vars: _.mapValues(exp.vars),
				value: cloneExp(exp.value),
			}
			_.values(cloned.vars).forEach(_.partial(setAsParent, cloned))
			setAsParent(cloned, cloned.value)
			return cloned
		}
		case 'fn': {
			const cloned: ExpFn = {
				ast: 'fn',
				params: exp.params.map(it => ({
					label: it.label,
					body: cloneExp(it.body),
				})),
				restParam: exp.restParam ? {...exp.restParam} : undefined,
				body: cloneExp(exp.body),
			}
			exp.params.forEach(it => setAsParent(cloned, it.body))
			if (exp.restParam) {
				setAsParent(exp, exp.restParam.body)
			}
			return exp
		}
		case 'fnType': {
			const cloned: ExpFnType = {
				ast: 'fnType',
				params: exp.params.map(cloneExp),
				restParam: exp.restParam ? cloneExp(exp.restParam) : undefined,
				out: cloneExp(exp.out),
			}
			cloned.params.forEach(_.partial(setAsParent, cloned))
			if (cloned.restParam) {
				setAsParent(cloned, cloned.restParam)
			}
			return cloned
		}
		case 'vectorType': {
			const cloned: ExpVectorType = {
				ast: 'vectorType',
				items: cloneExp(exp.items),
			}
			setAsParent(exp, exp.items)
			return cloned
		}
		case 'list': {
			const cloned: ExpList = {
				ast: 'list',
				value: exp.value.map(cloneExp as any) as Exp[],
				...(exp.delimiters ? {delimiters: [...exp.delimiters]} : {}),
			}
			cloned.value.forEach(_.partial(setAsParent, cloned))
			return cloned
		}
		case 'vector': {
			const cloned: ExpVector = {
				ast: 'vector',
				value: exp.value.map(cloneExp as any) as Exp[],
				...(exp.delimiters ? {delimiters: [...exp.delimiters]} : {}),
			}
			cloned.value.forEach(_.partial(setAsParent, cloned))
			return cloned
		}
		case 'hashMap': {
			const cloned: ExpHashMap = {
				ast: 'hashMap',
				value: _.mapValues(exp.value),
				...(exp.delimiters ? {delimiters: [...exp.delimiters]} : {}),
			}
			_.values(cloned.value).forEach(_.partial(setAsParent, cloned))
			return cloned
		}
	}
}

function defineFn(exp: ExpFn): ValueFn {
	if (!exp.parent) {
		throw new Error('No parent')
	}

	const body = cloneExp(exp.body)

	// Create scope
	const fnScope = createExpScope({}, body)
	if (exp.parent) {
		setAsParent(exp.parent, fnScope)
	}

	// Infer Param Type
	const varsType = Object.fromEntries(
		exp.params.map(
			({label, body}) => [label, wrapExp(evalExp(body))] as [string, ExpValue]
		)
	)

	if (exp.restParam) {
		varsType[exp.restParam.label] = wrapExp(evalExp(exp.restParam.body))
	}

	fnScope.vars = varsType

	const varsTypeList = _.values(varsType)

	inferParamType(body)

	const params: ValueFn['params'] = _.toPairs(varsType).map(
		([label, {value}]) => ({
			label,
			body: value,
		})
	)

	let restParam: ValueFn['restParam']
	if (exp.restParam) {
		restParam = params.splice(-1, 1)[0]
	}

	const outType = inferType(body)

	varsTypeList.forEach(v => {
		clearEvaluatedRecursively(v)
		disconnectExp(v)
	})

	// Define function
	const fn: IFnExp = (vars: ExpScope['vars']) => {
		// Set params
		fnScope.vars = vars

		// Evaluate
		const out = evalExp(body)

		// Clean params
		_.values(fnScope.vars).forEach(clearEvaluatedRecursively)

		return out
	}

	return createFnExp(fn, params, restParam, outType)

	function inferParamType(e: Exp) {
		switch (e.ast) {
			case 'list':
				e.value.slice(1).forEach(inferParamType)
				break
			case 'symbol':
			case 'path': {
				const ref = resolveRef(e)
				if (ref.ast === 'value' && varsTypeList.includes(ref)) {
					ref.value = intersectType([ref.value, inferAcceptableType(e)])
				}
			}
		}
	}
}

// Create functions
function createExpSymbol(value: string): ExpSymbol {
	return {
		ast: 'symbol',
		value,
	}
}

function createExpFnJS(
	body: (...params: any[]) => Form,
	params: ValueFn['params'],
	restParam: ValueFn['restParam'] | null,
	out: ValueFnType['out']
): ExpValue<ValueFnJS> {
	return {
		ast: 'value',
		value: {
			type: 'fn',
			body: body as IFnJS,
			params,
			...(restParam ? {restParam} : {}),
			out,
			isExp: false,
		},
	}
}

function createFnExp(
	body: IFnExp,
	params: ValueFn['params'],
	restParam: ValueFn['restParam'] | null,
	out: ValueFnType['out']
): ValueFnExp {
	return {
		type: 'fn',
		body,
		params,
		...(restParam ? {restParam} : {}),
		out,
		isExp: true,
	}
}

function createVectorType(items: ValueVectorType['items']): ValueVectorType {
	return {
		type: 'vectorType',
		items,
	}
}

function createExpScope(vars: ExpScope['vars'], value?: Exp): ExpScope {
	const exp: ExpScope = {
		ast: 'scope',
		vars,
		value: value || wrapExp(null),
	}

	setAsParent(exp, exp.value)
	_.values(vars).forEach(_.partial(setAsParent, exp))

	return exp
}

function createExpList(value: Exp[], {setParent = true} = {}): ExpList {
	const exp: ExpList = {
		ast: 'list',
		value,
	}

	if (setParent) {
		value.forEach(_.partial(setAsParent, exp))
	}

	return exp
}

function createExpVector(value: Exp[], {setParent = true} = {}) {
	const exp: ExpVector = {
		ast: 'vector',
		value,
	}

	if (setParent) {
		value.forEach(_.partial(setAsParent, exp))
	}

	return exp
}

function createExpHashMap(value: ExpHashMap['value'], {setParent = true} = {}) {
	const exp: ExpHashMap = {
		ast: 'hashMap',
		value,
	}

	if (setParent) {
		_.values(value).forEach(_.partial(setAsParent, exp))
	}

	return exp
}

function createHashMap(value: ValueHashMap['value']): ValueHashMap {
	return {
		type: 'hashMap',
		value,
	}
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
				return printSeq('[', ']', value, exp.delimiters)
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
			// case 'restVector': {
			// 	const val: Form[] = [...value.value]
			// 	const delimiters = ['', ...Array(val.length - 1).fill(' '), '', '']
			// 	val.splice(-1, 0, createExpSymbol('...'))
			// 	return printSeq('[', ']', val, delimiters)
			// }
			case 'hashMap': {
				const pairs = _.entries(value.value)
				const coll: string[] = pairs.map(
					([label, body]) => `${label}: ${printValue(body)}`
				)
				const delimiters =
					pairs.length === 0
						? ['']
						: ['', ...Array(pairs.length - 1).fill(' '), '']
				return printSeq('{', '}', coll, delimiters)
			}
			case 'fn': {
				const params = value.params.map(
					({label, body}) => `${label}:${printValue(body)}`
				)
				if (value.restParam) {
					const {label, body} = value.restParam
					params.push(`...${label}:${printValue(body)}`)
				}
				const out = printValue(value.out)
				return `(=> [${params.join(' ')}] ${out})`
			}
			case 'union': {
				if (value.original) {
					const name = getName(value.original)
					if (name) {
						return name
					}
				}
				const items = value.items.map(printForm).join(' ')
				return `(@| ${items})`
			}
			case 'infUnion':
				if (value.original) {
					const name = getName(value.original)
					if (name) {
						return name
					}
				}
				throw new Error('Cannot print this InfUnion')
			case 'vectorType':
				return `[...${printValue(value.items)}]`
			case 'fnType': {
				const params = value.params.map(printValue)
				if (value.restParam) {
					params.push(`...${printValue(value.restParam)}`)
				}
				const out = printValue(value.out)
				return `(@=> [${params.join(' ')}] ${out})`
			}
			case 'exp':
				return `'${printExp(value.value)}`
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
