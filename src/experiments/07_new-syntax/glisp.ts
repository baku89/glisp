import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

function shouldQuote(name: string) {
	return !name.match(/^\.\.\.|[a-z_+\-*=?|&<>@][0-9a-z_+\-*=?|&<>@]*$/i)
}

type Form = Exp | Value

// Value
type Value =
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

interface ValueFnJS {
	type: 'fn'
	body: IFnExp
	fnType: ValueFnType
	isExp: false
}

interface ValueFnExp {
	type: 'fn'
	body: IFnJS
	fnType: ValueFnType
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
	predicate: (v: ValuePrim) => boolean
	original?: ExpValue<ValueInfUnion>
	supersets?: ValueInfUnion[]
}

interface ValueVectorType {
	type: 'vectorType'
	items: Value
}

interface ValueFnType {
	type: 'fnType'
	params: {
		items: {
			label: string
			body: Value
		}[]
		rest?: {
			label: string
			body: Value
		}
	}
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
	| ExpFnDef
	| ExpVectorType
	| ExpList
	| ExpVector
	| ExpHashMap

interface ExpBase {
	parent?:
		| ExpScope
		| ExpFnDef
		| ExpVectorType
		| ExpList
		| ExpVector
		| ExpHashMap
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
		[name: string]: Exp
	}
	value: Exp
}

interface ExpFnDef extends ExpBase {
	ast: 'fnDef'
	params: {
		items: {
			label: string
			body: Exp
		}[]
		rest?: {
			label: string
			body: Exp
		}
	}
	body: Exp
	evaluated?: ValueFn
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
			case 'fnDef':
				e.params.items.forEach(it => disconnect(it.body))
				if (e.params.rest) {
					disconnect(e.params.rest.body)
				}
				disconnect(e.body)
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
	if (outer === inner) {
		return true
	}

	if (isVoid(inner)) {
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

	switch (outer.type) {
		case 'void':
		case 'fn':
			return isEqualValue(outer, inner)
		case 'hashMap':
			return (
				isHashMap(inner) &&
				_.entries(inner).every(([key, iv]) =>
					containsValue(outer.value[key], iv)
				)
			)
		case 'all':
			return true
		case 'infUnion':
			if (isFn(inner)) {
				inner = inner.fnType
			}
			if (isFnType(inner)) {
				inner = inner.out
			}
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
			if (isFn(inner)) {
				inner = inner.fnType
			}
			if (isFnType(inner)) {
				inner = inner.out
			}
			const innerItems = isUnion(inner) ? inner.items : [inner]
			if (outer.items.length < innerItems.length) {
				return false
			}
			return !!innerItems.some(ii =>
				outer.items.some(_.partial(containsValue, _, ii))
			)
		}
		case 'vectorType':
			if (isVectorType(inner)) {
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

	const itemList = items.map(t => (isUnion(t) ? [...t.items] : [t]))

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
				items: itemList.flat(),
		  }
}

function intersectType(items: Value[]): Value {
	if (items.length === 0) {
		return TypeAll
	}

	const result = items.reduce((a, b) => {
		if (containsValue(a, b)) {
			return b
		}
		if (containsValue(b, a)) {
			return a
		}

		const aItems = isUnion(a) ? a.items : [a]
		const bItems = isUnion(b) ? b.items : [b]

		return {
			type: 'union',
			items: _.intersectionWith(aItems, bItems, isEqualValue),
		}
	}, TypeAll)

	if (isUnion(result)) {
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
	// '@=>': createFn(
	// 	(params: Value[], out: Value) => createFnType(params, out),
	// 	[TypeAll, TypeAll],
	// 	TypeAll
	// ),
	'@|': createFn(
		(items: Value[]) => uniteType(items),
		{
			items: [{label: 'value', body: TypeAll}],
		},
		TypeAll
	),
	'@&': createFn(
		(items: Value[]) => intersectType(items),
		{
			items: [],
			rest: {label: 'value', body: TypeAll},
		},
		TypeAll
	),
	'@count': createFn(
		(v: Value) => typeCount(v),
		{items: [{label: 'value', body: TypeAll}]},
		TypeNumber
	),
	length: createFn(
		(v: Value[]) => v.length,
		{
			items: [{label: 'value', body: createVectorType(TypeAll)}],
		},
		TypeNat
	),
	PI: wrapExp(Math.PI),
	'+': createFn(
		(xs: number[]) => xs.reduce((sum, v) => sum + v, 0),
		{
			items: [],
			rest: {label: 'value', body: TypeNumber},
		},
		TypeNumber
	),
	'*': createFn(
		(xs: number[]) => xs.reduce((prod, v) => prod * v, 1),
		{
			items: [],
			rest: {label: 'value', body: TypeNumber},
		},
		TypeNumber
	),
	pow: createFn(
		Math.pow,
		{
			items: [
				{label: 'base', body: TypeNumber},
				{label: 'exponent', body: TypeNumber},
			],
		},
		TypeNumber
	),
	take: createFn(
		(n: number, coll: Value[]) => coll.slice(0, n),
		{
			items: [
				{label: 'n', body: TypeNat},
				{label: 'coll', body: createVectorType(TypeAll)},
			],
		},
		TypeNumber
	),
	'&&': createFn(
		(a: boolean, b: boolean) => a && b,
		{
			items: [
				{label: 'x', body: TypeBoolean},
				{label: 'y', body: TypeBoolean},
			],
		},
		TypeBoolean
	),
	square: createFn(
		(v: number) => v * v,
		{items: [{label: 'value', body: TypeNumber}]},
		TypePosNumber
	),
	sqrt: createFn(
		Math.sqrt,
		{items: [{label: 'value', body: TypePosNumber}]},
		TypePosNumber
	),
	not: createFn(
		(v: boolean) => !v,
		{items: [{label: 'value', body: TypeBoolean}]},
		TypeBoolean
	),
	'==': createFn(
		isEqualValue,
		{items: [{label: 'value', body: TypeAll}]},
		TypeBoolean
	),
	'@>=': createFn(
		containsValue,
		{
			items: [
				{label: 'a', body: TypeAll},
				{label: 'b', body: TypeAll},
			],
		},
		TypeBoolean
	),
	'@type': createFn(
		getType,
		{items: [{label: 'value', body: TypeAll}]},
		TypeAll
	),
	if: createFn(
		(cond: boolean, then: Exp, _else: Exp) => (cond ? then : _else),
		{
			items: [
				{label: 'cond', body: TypeBoolean},
				{label: 'then', body: TypeAll},
				{label: 'else', body: TypeAll},
			],
		},
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
		case 'fn':
			return v.fnType
		case 'infUnion':
		case 'fnType':
		case 'vectorType':
			return v
		case 'hashMap':
			return createHashMap(_.mapValues(v.value, getType))
	}
}

function isValue(form: Form): form is Value {
	return isPrim(form) || Array.isArray(form) || 'type' in form
}

function isPrim(value: Value | Exp): value is ValuePrim {
	return value !== Object(value)
}

// Type predicates

function isAll(value: Value): value is ValueAll {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'all'
}

function isVoid(value: Value): value is ValueVoid {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'void'
}

function isHashMap(value: Value): value is ValueHashMap {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'hashMap'
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

function isVectorType(value: Value): value is ValueVectorType {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'vectorType'
}

function isFnType(value: Value): value is ValueFnType {
	return !isPrim(value) && !Array.isArray(value) && value.type === 'fnType'
}

function inferType(form: Form): Value {
	if (isValue(form)) {
		if (isFn(form)) {
			return form.fnType.out
		}
		return form
	}

	switch (form.ast) {
		case 'value':
			return inferType(form.value)
		case 'symbol':
		case 'path':
			return inferType(resolveRef(form))
		case 'scope':
			return inferType(form.value)
		case 'fnDef':
			return inferType(form.body)
		case 'vectorType':
			return inferType(createVectorType(inferType(form.items)))
		case 'list': {
			const first = form.value[0]
			return inferType(first)
		}
		case 'vector':
			return form.value.map(inferType)
		case 'hashMap':
			return createHashMap(_.mapValues(form.value, inferType))
	}
}

function resolveParams(exp: ExpList): ExpScope['vars'] {
	const [first, ...params] = exp.value

	const fn = evalExp(first)

	if (!isFn(fn)) {
		throw new Error('First element is not a function')
	}

	const {items, rest} = fn.fnType.params

	const vars: {[label: string]: Exp} = {}

	// Length check
	if (items.length > params.length) {
		new Error(`Expected ${items.length} arguments, but got ${params.length}`)
	}

	// Retrieve fixed part of params
	for (let i = 0; i < items.length; i++) {
		const {label, body} = items[i]
		if (!containsValue(body, inferType(params[i]))) {
			throw new Error('Cannot assign!!!!!!')
		}
		vars[label] = params[i]
	}

	if (rest) {
		const restParams = params.slice(items.length)
		const restVars = restParams.map(p => {
			if (!containsValue(rest.body, inferType(p))) {
				throw new Error('Cannot assign!!! in rest')
			}
			return p
		})

		vars[rest.label] = createExpVector(restVars, {setParent: false})
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
		case 'union': {
			return (
				isUnion(b) &&
				a.items.length === b.items.length &&
				_.differenceWith(a.items, b.items, isEqualValue).length === 0
			)
		}
		case 'infUnion':
			return a === b
		case 'vectorType':
			return isVectorType(b) && isEqualValue(a.items, b.items)
		case 'fnType':
			if (!isFnType(b)) {
				return false
			}
			if (!isEqualValue(a.out, b.out)) {
				return false
			}
			if (a.params.items.length !== b.params.items.length) {
				return false
			}
			if (a.params.rest) {
				if (!b.params.rest) {
					return false
				}
				if (!isEqualValue(a.params.rest.body, b.params.rest.body)) {
					return false
				}
			} else {
				if (b.params.rest) {
					return false
				}
			}
			return _$.zipShorter(a.params.items, b.params.items).every(([ai, bi]) =>
				isEqualValue(ai.body, bi.body)
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

		this.vars['def'] = createFn(
			(symbol: string, value: Exp) => {
				this.vars[symbol] = value
				setAsParent(this.scope, value)
				return value
			},
			{
				items: [
					{label: 'symbol', body: TypeString},
					{label: 'value', body: TypeAll},
				],
			},
			TypeAll,
			{lazyEval: [true]}
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
	if (isPrim(value) || Array.isArray(value)) {
		return 1
	}

	if (Array.isArray(value)) {
		return value.reduce((count, d) => count * typeCount(d), 1)
	}

	switch (value.type) {
		case 'void':
			return 0
		case 'fn':
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
		case 'fnDef':
			return defineFn(exp)
		case 'vectorType':
			return createVectorType(_eval(exp.items))
		case 'list': {
			const fn = _eval(exp.value[0])

			if (!isFn(fn)) {
				throw new Error('First element is not a function')
				// Function application
			}

			const fnType = fn.fnType
			const fnBody = fn.body

			const scope = resolveParams(exp)

			// Eval parameters at first
			const evaluatedParams = _.values(scope).map((p, i) =>
				fnType.lazyEval && fnType.lazyEval[i] ? p : _eval(p)
			)

			const expanded = fn.isExp
				? (fnBody as IFnExp)(scope)
				: (fnBody as IFnJS)(...evaluatedParams)

			exp.expanded = expanded

			return isValue(expanded) ? expanded : _eval(expanded)
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
		case 'fnDef': {
			const cloned: ExpFnDef = {
				ast: 'fnDef',
				params: {
					items: exp.params.items.map(it => ({...it})),
					rest: exp.params.rest ? {...exp.params.rest} : undefined,
				},
				body: cloneExp(exp.body),
			}
			exp.params.items.forEach(it => setAsParent(cloned, it.body))
			if (exp.params.rest) {
				setAsParent(exp, exp.params.rest.body)
			}
			return exp
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

function defineFn(exp: ExpFnDef): ValueFn {
	if (!exp.parent) {
		throw new Error('No parent')
	}

	// Create a function
	const params: ValueFnType['params'] = {
		items: exp.params.items.map(({label, body}) => ({
			label,
			body: evalExp(body),
		})),
	}

	if (exp.params.rest) {
		params.rest = {
			label: exp.params.rest.label,
			body: evalExp(exp.params.rest.body),
		}
	}

	const body = cloneExp(exp.body)

	// Create scope
	const fnScope = createExpScope({}, body)
	if (exp.parent) {
		setAsParent(exp.parent, fnScope)
	}

	// Define function
	const fn = (vars: ExpScope['vars']) => {
		// Set params
		fnScope.vars = vars

		// Evaluate
		const out = evalExp(body)

		// Clean params
		_.values(fnScope.vars).forEach(clearEvaluatedRecursively)

		return out
	}
	const outType = inferType(body)

	return createFn(fn, params, outType, {isExp: true}).value
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
	{lazyEval = undefined as undefined | boolean[], isExp = false as boolean} = {}
): ExpValue<ValueFn> {
	return {
		ast: 'value',
		value: {
			type: 'fn',
			body: body as IFnJS | IFnExp,
			fnType: createFnType(params, out, {lazyEval}),
			isExp,
		} as ValueFn,
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
				const {fnType} = value
				const params = fnType.params.items.map(
					({label, body}) => `${label}:${printValue(body)}`
				)
				if (fnType.params.rest) {
					const {label, body} = fnType.params.rest
					params.push(`...${label}:${printValue(body)}`)
				}
				const out = printValue(fnType.out)
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
			case 'vectorType':
				return `[...${printValue(value.items)}]`
			case 'fnType': {
				const params = value.params.items.map(
					({label, body}) => `${label}:${printValue(body)}`
				)

				if (value.params.rest) {
					const {label, body} = value.params.rest
					params.push(`...${label}:${printValue(body)}`)
				}
				const out = printValue(value.out)
				return `(#=> [${params.join(' ')}] ${out})`
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
