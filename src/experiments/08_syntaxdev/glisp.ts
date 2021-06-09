import _ from 'lodash'
import peg from 'pegjs'

import _$ from '@/lodash-ext'

import ParserDefinition from './parser.pegjs'

const parser = peg.generate(ParserDefinition)

type Value =
	| Value[]
	| ValueVariadicVector
	| ValueAny
	| ValueSingleton
	| ValueValType
	| ValueUnionType
	| ValueFnType
	| ValueVariadicVector
	| ValueHashMap
	| ValueFn

interface ValueAny {
	kind: 'any'
}

function createAny(): ValueAny {
	return {kind: 'any'}
}

type ValueSingleton = ValueLiteralSingleton | ValueCustomSingleton

type ValueLiteralSingleton = null | boolean | string | number
interface ValueCustomSingleton {
	kind: 'singleton'
	origExp?: Exp
}

function isLiteralSingleton(x: Value): x is ValueLiteralSingleton {
	return x === null || typeof x !== 'object'
}

interface ValueVariadicVector<T extends Value = Value> {
	kind: 'variadicVector'
	items: T[]
}

interface ValueValType {
	kind: 'valType'
	id: symbol
	cast: (value: Value) => Value
}

interface ValueUnionType {
	kind: 'unionType'
	items: Exclude<Value, ValueUnionType>[]
	cast?: (value: Value) => Value
}

interface ValueFnType {
	kind: 'fnType'
	params: Value[] | ValueVariadicVector
	out: Value
}

interface ValueFnThis {
	log: (log: Log) => void
	eval: <R extends Value>(exp: Exp) => R
}

interface ValueFn {
	kind: 'fn'
	type: ValueFnType
	body: <A extends Exp[], R extends Value>(this: ValueFnThis, ...arg0: A) => R
}

interface ValueHashMap {
	kind: 'hashMap'
	value: {
		[key: string]: Value
	}
}

type Exp = ExpValue | ExpSymbol | ExpList | ExpVector | ExpHashMap | ExpScope

interface Log {
	level: 'error' | 'warn' | 'info'
	reason: string
}

interface ExpBase {
	parent?: Exp
}

interface ExpValue<T extends Value = Value> extends ExpBase {
	ast: 'value'
	value: T
}

type InspectedResult =
	| {semantic: 'raw'}
	| InspectedResultSymbol
	| InspectedResultList
	| InspectedResultHashMap

type InspectedResultSymbol =
	| {semantic: 'ref'; ref: Exp}
	| {semantic: 'capture'}
	| {semantic: 'undefined'}
	| {semantic: 'circular'}

interface ExpSymbol extends ExpBase {
	ast: 'symbol'
	name: string
}

type InspectedResultList =
	| {semantic: 'application'; fn: Exp; params: Exp[]}
	| {semantic: 'scope'; scope: ExpScope['scope']; out?: ExpScope['out']}
	| {semantic: 'null'}

interface ExpList extends ExpBase {
	ast: 'list'
	items: Exp[]
}

interface ExpVector extends ExpBase {
	ast: 'vector'
	items: Exp[]
}

type InspectedResultHashMap = {
	semantic: 'hashMap'
	items: {
		[hash: string]: Exp
	}
}

interface ExpHashMap extends ExpBase {
	ast: 'hashMap'
	items: Exp[]
}

interface ExpScope extends ExpBase {
	ast: 'scope'
	scope: {[name: string]: Exp}
	out?: Exp
}

export function readStr(str: string): Exp {
	const exp = parser.parse(str) as Exp | undefined

	if (exp === undefined) {
		return createValue([])
	} else {
		// Set global scope as parent
		exp.parent = GlobalScope
		return exp
	}
}

function createValue(value: Value): ExpValue {
	const ret: ExpValue = {ast: 'value', value}
	if (isKindOf(value, 'singleton')) {
		value.origExp = ret
	}
	return ret
}

function createSymbol(name: string): ExpSymbol {
	return {ast: 'symbol', name}
}

function createVariadicVector<T extends Value = Value>(
	...items: T[]
): ValueVariadicVector<T> {
	return {
		kind: 'variadicVector',
		items,
	}
}

function createValType(
	base: ValueValType | string,
	cast: ValueValType['cast']
): ValueValType {
	const id = typeof base === 'string' ? Symbol(base) : base.id

	return {
		kind: 'valType',
		id,
		cast,
	}
}

function createScope(
	{
		scope,
		out,
	}: {
		scope: ExpScope['scope']
		out?: ExpScope['out']
	},
	setParent = true
): ExpScope {
	const ret: ExpScope = {ast: 'scope', scope, out}

	if (setParent) {
		_.values(scope).forEach(e => (e.parent = ret))
	}

	return ret
}

const TypeBoolean = uniteType([false, true], v => !!v)
const TypeNumber = createValType('number', () => 0)
const TypeString = createValType('string', () => '')
const TypeFnType = createValType('fnType', () => null)
const TypeHashMap = createValType('hashMap', () => ({
	kind: 'hashMap',
	value: {},
}))

const OrderingLT: ValueSingleton = {kind: 'singleton'}
const OrderingEQ: ValueSingleton = {kind: 'singleton'}
const OrderingGT: ValueSingleton = {kind: 'singleton'}

const GlobalScope = createScope({
	scope: {
		Any: createValue(createAny()),
		Number: createValue(TypeNumber),
		String: createValue(TypeString),
		Boolean: createValue(TypeBoolean),
		LT: createValue(OrderingLT),
		EQ: createValue(OrderingEQ),
		GT: createValue(OrderingGT),
		Ordering: createValue({
			kind: 'unionType',
			items: [OrderingLT, OrderingEQ, OrderingGT],
		}),
		PI: createValue(Math.PI),
		'+': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: createVariadicVector(TypeNumber),
				out: TypeNumber,
			},
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs.map(x => this.eval<number>(x)).reduce((a, b) => a + b, 0)
			} as any,
		}),
		'*': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: createVariadicVector(createValType(TypeNumber, () => 1)),
				out: TypeNumber,
			},
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs.map(x => this.eval<number>(x)).reduce((a, b) => a * b, 1)
			} as any,
		}),
		and: createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: createVariadicVector(TypeBoolean),
				out: TypeBoolean,
			},
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs.map(x => this.eval<boolean>(x)).reduce((a, b) => a && b, true)
			} as any,
		}),
		or: createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: createVariadicVector(TypeBoolean),
				out: TypeBoolean,
			},
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				return xs
					.map(x => this.eval<boolean>(x))
					.reduce((a, b) => a || b, false)
			} as any,
		}),
		':=>': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: [createVariadicVector(createAny()), createAny()],
				out: TypeFnType,
			},
			body: function (this: ValueFnThis, params: Exp, out: Exp) {
				return {
					kind: 'fnType',
					params: this.eval(params),
					out: this.eval(out),
				}
			} as any,
		}),
		':|': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: createVariadicVector(createAny()),
				out: createAny(),
			},
			body: function (this: ValueFnThis, ...a: Exp[]) {
				return uniteType(a.map(this.eval))
			} as any,
		}),
		'...': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: createVariadicVector(createAny()),
				out: createAny(),
			},
			body: function (this: ValueFnThis, ...xs: Exp[]) {
				const items: Value[] = xs.map(this.eval)

				if (items.length === 0) {
					items.push(createAny())
				} else if (items.length >= 2) {
					const last = items[items.length - 1]
					for (let i = items.length - 2; i >= 0; i--) {
						if (equalsValue(items[i], last)) {
							items.pop()
						}
					}
				}

				return {
					kind: 'variadicVector',
					items,
				}
			} as any,
		}),
		':type': createValue({
			kind: 'fn',
			type: {kind: 'fnType', params: [createAny()], out: createAny()},
			body: function (this: ValueFnThis, t: Exp) {
				return assertExpType(t)
			} as any,
		}),
		':<': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: [createAny(), createAny()],
				out: TypeBoolean,
			},
			body: function (this: ValueFnThis, a: Exp, b: Exp) {
				return isSubtypeOf(this.eval(a), this.eval(b))
			} as any,
		}),
		'::': createValue({
			kind: 'fn',
			type: {
				kind: 'fnType',
				params: [createAny(), createAny()],
				out: createAny(),
			},
			body: function (this: ValueFnThis, type: Exp, value: Exp) {
				const t = this.eval(type)
				const v = this.eval(value)

				const casted = castType(t, v)

				this.log({
					level: 'info',
					reason: `Value ${printValue(v)} is converted to ${printValue(
						casted
					)}`,
				})

				return casted
			} as any,
		}),
	},
})

interface WithLogs<T> {
	result: T
	logs: Log[]
}

function uniteType(
	types: Value[],
	cast?: NonNullable<ValueUnionType['cast']>
): Value {
	const items: (
		| Exclude<Value, ValueUnionType>
		| undefined
	)[] = types.flatMap(t => (isKindOf(t, 'unionType') ? t.items : [t]))

	if (items.length >= 2) {
		for (let a = 0; a < items.length - 1; a++) {
			const aItem = items[a]
			if (aItem === undefined) continue

			for (let b = a + 1; b < items.length; b++) {
				const bItem = items[b]
				if (bItem === undefined) continue

				if (isSubtypeOf(bItem, aItem)) {
					items[b] = undefined
				} else if (isSubtypeOf(aItem, bItem)) {
					items[a] = undefined
					break
				}
			}
		}
	}

	const uniqItems = items.filter(
		i => i !== undefined
	) as ValueUnionType['items']

	return uniqItems.length > 0
		? {kind: 'unionType', items: uniqItems, cast}
		: uniqItems[0]
}

function equalsValue(a: Value, b: Value): boolean {
	if (isLiteralSingleton(a)) {
		return a === b
	}

	if (Array.isArray(a)) {
		return (
			Array.isArray(b) &&
			a.length === b.length &&
			_$.zipShorter(a, b).every(_.spread(equalsValue))
		)
	}

	switch (a.kind) {
		case 'any':
			return isAny(b)
		case 'singleton':
		case 'fn':
		case 'valType':
			return a === b
		case 'fnType':
			return (
				isKindOf(b, 'fnType') &&
				equalsValue(a.params, b.params) &&
				equalsValue(a.out, b.out)
			)
		case 'hashMap':
			if (isKindOf(b, 'hashMap')) {
				const aKeys = Object.keys(a.value)
				const bKeys = Object.keys(b.value)
				return (
					aKeys.length === bKeys.length &&
					aKeys.every(
						k => bKeys.includes(k) && equalsValue(a.value[k], b.value[k])
					)
				)
			}
			return false
		case 'unionType':
			return (
				isKindOf(b, 'unionType') &&
				_.xorWith(a.items, b.items, equalsValue).length === 0
			)
		case 'variadicVector':
			return isKindOf(b, 'variadicVector') && equalsValue(a.items, b.items)
	}
}

function withLog<T>(result: T, logs: Log[] = []) {
	return {result, logs}
}

function inspectExp(exp: Exp): WithLogs<InspectedResult> {
	switch (exp.ast) {
		case 'symbol':
			return inspectExpSymbol(exp)
		case 'list':
			return inspectExpList(exp)
		case 'hashMap':
			return inspectExpHashMap(exp)
		case 'scope':
			return withLog({semantic: 'scope', scope: exp.scope, out: exp.out})
		default:
			return withLog({semantic: 'raw'})
	}
}

function inspectExpSymbol(exp: ExpSymbol): WithLogs<InspectedResultSymbol> {
	// Search ancestors
	let parent = exp.parent
	let name = exp.name
	const history = new WeakSet<ExpSymbol>([exp])
	while (parent) {
		const inspected: InspectedResult = inspectExp(parent).result
		if (inspected.semantic === 'scope') {
			if (name in inspected.scope) {
				const ref: Exp = inspected.scope[name]
				if (ref.ast === 'symbol') {
					if (history.has(ref)) {
						return withLog({semantic: 'circular'}, [
							{
								level: 'error',
								reason: `Symbol ${printExp(exp)} has a circular reference`,
							},
						])
					}
					// Proceed resolving
					history.add(ref)
					parent = ref
					name = ref.name
				} else {
					return withLog({
						semantic: 'ref',
						ref,
					})
				}
			}
		}
		parent = parent.parent
	}

	// Not Defined
	return withLog({semantic: 'undefined'}, [
		{level: 'error', reason: `${exp.name} is not defined`},
	])
}

function inspectExpList(exp: ExpList): WithLogs<InspectedResultList> {
	if (exp.items.length >= 1) {
		const [fst, ...rest] = exp.items

		if (fst.ast === 'symbol' && fst.name === '@') {
			const scope: {[name: string]: Exp} = {}
			let out: Exp | undefined
			const logs: Log[] = []

			_.chunk(rest, 2).forEach(pair => {
				if (pair.length === 2) {
					const [sym, value] = pair
					if (sym.ast === 'symbol') {
						scope[sym.name] = value
					} else {
						logs.push({
							level: 'warn',
							reason: `${printExp(sym)} is not a symbol`,
						})
					}
				} else if (pair.length === 1) {
					out = pair[0]
				}
			})
			return withLog({semantic: 'scope', scope, out}, logs)
		}
		return withLog({semantic: 'application', fn: fst, params: rest})
	} else {
		return withLog({semantic: 'null'})
	}
}

function inspectExpHashMap(exp: ExpHashMap): WithLogs<InspectedResultHashMap> {
	const items: {[hash: string]: Exp} = {}

	const logs: Log[] = []

	if (exp.items.length % 2 !== 0) {
		logs.push({level: 'warn', reason: 'Odd number of hashMap items'})
	}

	for (let i = 0; i < exp.items.length; i += 2) {
		const key = exp.items[i]
		const value = exp.items[i + 1]
		if (key.ast !== 'value' || typeof key.value !== 'string') {
			logs.push({
				level: 'warn',
				reason: `Key ${printExp(key)} is not a string`,
			})
			continue
		}
		items[key.value] = value
	}

	return withLog({semantic: 'hashMap', items}, logs)
}

function assertValueType(v: Value): Value {
	if (isLiteralSingleton(v)) {
		return v
	}

	if (Array.isArray(v)) {
		return v.map(assertValueType)
	}

	switch (v.kind) {
		case 'any':
		case 'singleton':
		case 'valType':
		case 'fnType':
		case 'unionType':
		case 'variadicVector':
			return v
		case 'fn':
			return v.type
		case 'hashMap':
			return TypeHashMap
	}
}

function assertExpType(exp: Exp): Value {
	switch (exp.ast) {
		case 'value':
			return assertValueType(exp.value)
		case 'symbol': {
			const inspected = inspectExpSymbol(exp).result
			if (inspected.semantic == 'ref') {
				return assertValueType(evalExp(inspected.ref).result)
			}
			return createAny()
		}
		case 'list': {
			const inspected = inspectExpList(exp).result
			if (inspected.semantic === 'application') {
				const fn = evalExp(inspected.fn).result
				return isKindOf(fn, 'fn') ? fn.type.out : assertExpType(inspected.fn)
			} else {
				return null
			}
		}
		case 'vector':
			return exp.items.map(assertExpType)
		case 'hashMap':
			return TypeHashMap
		case 'scope':
			return exp.out ? assertExpType(exp) : null
	}
}

function evalExpSymbol(exp: ExpSymbol): WithLogs<Value> {
	const {result: inspected, logs} = inspectExpSymbol(exp)
	switch (inspected.semantic) {
		case 'ref':
			return evalExp(inspected.ref)
		default:
			return withLog(null, logs)
	}
}

function evalExpVector(exp: ExpVector): WithLogs<Value> {
	const evaluated = exp.items.map(evalExp)
	return withLog(
		evaluated.map(e => e.result),
		evaluated.flatMap(e => e.logs)
	)
}

function evalExpList(exp: ExpList): WithLogs<Value> {
	const {result: inspected, logs: inspectLogs} = inspectExpList(exp)
	if (inspected.semantic === 'application') {
		const {result: fn, logs: fnLogs} = evalExp(inspected.fn)

		if (isKindOf(fn, 'fn')) {
			const {result: params, logs: castLogs} = castExpParam(
				fn.type.params,
				inspected.params
			)

			const paramsLogs: Log[] = []
			const execLogs: Log[] = []

			const result = fn.body.call(
				{
					log: function (log) {
						execLogs.push(log)
					},
					eval: function (e: Exp) {
						const {result, logs: logs} = evalExp(e)
						paramsLogs.push(...logs)
						return result
					} as any,
				},
				...params
			)
			return withLog(result, [
				...inspectLogs,
				...fnLogs,
				...castLogs,
				...paramsLogs,
				...execLogs,
			])
		}
		return withLog(fn, [...inspectLogs, ...fnLogs])
	} else if (inspected.semantic === 'scope') {
		if (inspected.out !== undefined) {
			const {result, logs} = evalExp(inspected.out)
			return withLog(result, [...inspectLogs, ...logs])
		}
	}
	return withLog(null, inspectLogs)
}

function evalExpHashMap(exp: ExpHashMap): WithLogs<ValueHashMap> {
	const {result: inspected, logs} = inspectExpHashMap(exp)
	const evaluated = _.mapValues(inspected.items, evalExp)
	return withLog(
		{
			kind: 'hashMap',
			value: _.mapValues(evaluated, e => e.result),
		},
		[...logs, ..._.values(evaluated).flatMap(e => e.logs)]
	)
}

function evalExpScope(exp: ExpScope): WithLogs<Value> {
	if (exp.out) {
		const {result, logs} = evalExp(exp.out)
		return withLog(result, logs)
	} else {
		return withLog(null, [])
	}
}

export function evalExp(exp: Exp): WithLogs<Value> {
	switch (exp.ast) {
		case 'value':
			return withLog(exp.value, [])
		case 'symbol':
			return evalExpSymbol(exp)
		case 'list':
			return evalExpList(exp)
		case 'vector':
			return evalExpVector(exp)
		case 'hashMap':
			return evalExpHashMap(exp)
		case 'scope':
			return evalExpScope(exp)
	}
}

// Kind predicates
function isAny(x: Value): x is ValueAny {
	return x instanceof Object && !Array.isArray(x) && x.kind === 'any'
}

function isKindOf(x: Value, kind: 'any'): x is ValueAny
function isKindOf(x: Value, kind: 'fn'): x is ValueFn
function isKindOf(x: Value, kind: 'fnType'): x is ValueFnType
function isKindOf(x: Value, kind: 'hashMap'): x is ValueHashMap
function isKindOf(x: Value, kind: 'unionType'): x is ValueUnionType
function isKindOf(x: Value, kind: 'valType'): x is ValueValType
function isKindOf(x: Value, kind: 'variadicVector'): x is ValueVariadicVector
function isKindOf(x: Value, kind: 'singleton'): x is ValueCustomSingleton
function isKindOf<
	T extends Exclude<Value, null | boolean | number | string | any[]>
>(x: Value, kind: T['kind']): x is T {
	return x instanceof Object && !Array.isArray(x) && x.kind === kind
}

function isSubtypeOf(a: Value, b: Value): boolean {
	if (a === b) {
		return true
	}

	if (isAny(b)) {
		return true
	}

	if (isAny(a)) {
		return false
	}

	if (isKindOf(a, 'valType')) {
		return isKindOf(b, 'valType') && a.id === b.id
	}

	// Handling Vector/VariadicVector

	if (isKindOf(b, 'variadicVector')) {
		if (isKindOf(a, 'variadicVector')) {
			const alen = a.items.length,
				blen = b.items.length
			if (alen < blen) {
				return false
			}
			const bitems = [...b.items, ...Array(alen - blen).fill(b.items[blen - 1])]
			return _$.zipShorter(a.items, bitems).every(_.spread(isSubtypeOf))
		} else if (Array.isArray(a)) {
			const minLength = b.items.length - 1
			if (a.length < minLength) {
				return false
			}
			const variadicCount = a.length - minLength
			const bLast = b.items[b.items.length - 1]
			const bv = [
				...b.items.slice(0, minLength),
				...Array(variadicCount).fill(bLast),
			]
			return isSubtypeOf(a, bv)
		}
		return false
	}

	if (Array.isArray(b)) {
		if (Array.isArray(a)) {
			if (a.length < b.length) {
				return false
			}
			return _$.zipShorter(a, b).every(([a, b]) => isSubtypeOf(a, b))
		}
		return false
	}

	if (Array.isArray(a)) {
		return false
	}

	// Handle for union type
	if (isKindOf(b, 'unionType')) {
		const aTypes: Value[] = isKindOf(a, 'unionType') ? a.items : [a]
		const bTypes = b.items
		return aTypes.every(at => bTypes.some(bt => isSubtypeOf(at, bt)))
	}

	if (isKindOf(a, 'unionType')) {
		return false
	}

	// Handle for literals / value
	if (typeof a === 'number') {
		return isKindOf(b, 'valType') && b.id === TypeNumber.id
	}
	if (typeof a === 'string') {
		return isKindOf(b, 'valType') && b.id === TypeString.id
	}

	if (isKindOf(a, 'fn')) {
		return a === b || isSubtypeOf(assertValueType(a), b)
	}

	if (typeof b === 'number' || typeof b === 'string' || isKindOf(b, 'fn')) {
		return false
	}

	// Either is singleton
	if (
		a === null ||
		b === null ||
		typeof a === 'boolean' ||
		typeof b === 'boolean' ||
		a.kind === 'singleton' ||
		b.kind === 'singleton'
	) {
		return false
	}

	// Either is fnType
	const na = normalizeTypeToFn(a)
	const nb = normalizeTypeToFn(b)

	return isSubtypeOf(nb.params, na.params) && isSubtypeOf(na.out, nb.out)

	function normalizeTypeToFn(
		type: Value
	): {
		params: ValueFnType['params']
		out: Value
	} {
		if (!isLiteralSingleton(type) && !Array.isArray(type)) {
			if (type.kind == 'fnType') {
				return {params: type.params, out: type.out}
			}
		}
		return {params: [], out: type}
	}
}

function testSubtype(aStr: string, bStr: string, toBe: boolean) {
	const a = assertExpType(readStr(aStr))
	const b = assertExpType(readStr(bStr))

	const ret = isSubtypeOf(a, b)

	const fn = ret === toBe ? console.log : console.error

	fn(
		`a=${aStr}, b=${bStr}, a :< b = ${printValue(a)} :< ${printValue(
			b
		)} = ${printValue(ret)}`
	)
}

testSubtype('Number', 'Any', true)
testSubtype('true', 'Boolean', true)
testSubtype('Any', 'Number', false)
testSubtype('Number', 'Number', true)
testSubtype('Number', 'String', false)
testSubtype('[Number Number]', '[Number]', true)
testSubtype('[Number Number]', '[]', true)
testSubtype('[Number Number]', 'Any', true)
testSubtype('(+ 1 2)', 'Number', true)

function castType(type: Value, value: Value): Value {
	if (isLiteralSingleton(type)) {
		return type
	}

	if (Array.isArray(type)) {
		const values = Array.isArray(value) ? value : []
		return type.map((t, i) =>
			castType(t, values[i] !== undefined ? values[i] : null)
		)
	}

	switch (type.kind) {
		case 'valType':
			return isSubtypeOf(value, type) ? value : type.cast(value)
		case 'fnType':
			return castType(type.out, null)
		case 'unionType':
			return type.cast
				? isSubtypeOf(value, type)
					? value
					: type.cast(value)
				: castType(type.items[0], null)
		case 'singleton':
			return type
	}

	return null
}

function castExpParam(
	to: Value[] | ValueVariadicVector,
	from: Exp[]
): WithLogs<Exp[]> {
	const logs: Log[] = []

	if (Array.isArray(to)) {
		if (to.length > from.length) {
			logs.push({level: 'error', reason: 'Too short aguments'})
		}
	} else {
		const minLength = to.items.length - 1
		if (from.length < minLength) {
			logs.push({level: 'error', reason: 'Too short arguments'})

			from = [...from]
			while (from.length < minLength) {
				from.push(createValue(castType(to.items[from.length], null)))
			}
		}

		const variadicCount = from.length - minLength
		to = [
			...to.items.slice(0, minLength),
			...Array(variadicCount).fill(to.items[minLength]),
		]
	}

	const casted: Exp[] = []

	for (let i = 0; i < to.length; i++) {
		const toType = to[i]
		const fromItem: Exp = from[i] || {ast: 'value', value: null}

		const fromType = assertExpType(fromItem)

		if (isSubtypeOf(fromType, toType)) {
			casted.push(fromItem)
		} else {
			logs.push({
				level: 'error',
				reason:
					'Type ' +
					printValue(fromType) +
					' cannot be casted to ' +
					printValue(toType),
			})
			casted.push({
				ast: 'list',
				items: [createSymbol('::'), createValue(toType), fromItem],
			})
		}
	}

	return withLog(casted, logs)
}

export function printExp(exp: Exp): string {
	switch (exp.ast) {
		case 'list':
			return '(' + exp.items.map(printExp).join(' ') + ')'
		case 'vector':
			return '[' + exp.items.map(printExp).join(' ') + ']'
		case 'hashMap':
			return '{' + exp.items.map(printExp).join(' ') + '}'
		case 'symbol':
			return exp.name
		case 'value':
			return printValue(exp.value)
		case 'scope':
			return (
				'(@' +
				Object.entries(exp.scope)
					.map(([k, v]) => k + ' ' + printExp(v))
					.join(' ') +
				(exp.out ? printExp(exp.out) : '') +
				')'
			)
	}
}

function retrieveSingletonName(
	s: ValueCustomSingleton,
	baseExp: Exp
): string | undefined {
	if (!s.origExp) {
		return
	}

	const {origExp} = s

	if (!origExp.parent) {
		return
	}

	const inspected = inspectExp(origExp.parent).result

	if (inspected.semantic !== 'scope') {
		return
	}

	const name = _.findKey(inspected.scope, e => e === origExp)

	if (!name) {
		return
	}

	const sym: ExpSymbol = {
		parent: baseExp,
		ast: 'symbol',
		name,
	}

	const symInspected = inspectExpSymbol(sym).result

	if (symInspected.semantic !== 'ref' || symInspected.ref !== origExp) {
		return
	}

	return name
}

export function printValue(val: Value, baseExp: Exp = GlobalScope): string {
	if (val === null) {
		return 'null'
	}
	switch (typeof val) {
		case 'boolean':
			return val ? 'true' : 'false'
		case 'number':
			return val.toString()
		case 'string':
			return `"${val}"`
	}

	if (Array.isArray(val)) {
		return '[' + val.map(_.unary(printValue)).join(' ') + ']'
	}

	switch (val.kind) {
		case 'any':
			return 'Any'
		case 'valType':
			switch (val.id) {
				case TypeNumber.id:
					return 'Number'
				case TypeString.id:
					return 'String'
				case TypeFnType.id:
					return 'FnType'
				default:
					throw new Error('aaa!!!')
			}
		case 'variadicVector':
			return '(... ' + val.items.map(_.unary(printValue)).join(' ') + ')'
		case 'unionType':
			return '(:| ' + val.items.map(_.unary(printValue)).join(' ') + ')'
		case 'singleton':
			return retrieveSingletonName(val, baseExp) || '<singleton>'
		case 'fnType':
			return '(:=> ' + printValue(val.params) + ' ' + printValue(val.out) + ')'
		case 'fn':
			return '<JS Function>'
		case 'hashMap':
			return (
				'{' +
				Object.entries(val.value)
					.flatMap(([k, v]) => [`"${k}"`, printValue(v)])
					.join(' ') +
				'}'
			)
	}
}
