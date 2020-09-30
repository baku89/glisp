import Env from './env'

export const M_META = Symbol.for('meta')
export const M_AST = Symbol.for('ast')
export const M_ENV = Symbol.for('env')
export const M_PARAMS = Symbol.for('params')
export const M_ISMACRO = Symbol.for('ismacro')
export const M_ISLIST = Symbol.for('islist')
export const M_TYPE = Symbol.for('type')
export const M_VALUE = Symbol.for('value')

export const M_EVAL = Symbol.for('eval')
export const M_OUTER = Symbol.for('outer')
export const M_OUTER_INDEX = Symbol.for('outer-key')
const M_EXPAND = Symbol.for('expand')

// Stores string repsentation
export const M_ISSUGAR = Symbol('issugar')
export const M_ELMSTRS = Symbol.for('elmstrs') // string representations of each elements
export const M_DELIMITERS = Symbol.for('delimiters') // delimiter strings of list/map

export const M_DEF = Symbol.for('def') // save def exp reference in symbol object

export enum MalType {
	// Collections
	List = 'list',
	Vector = 'vector',
	Map = 'map',

	// Atoms
	Number = 'number',
	String = 'string',
	Boolean = 'boolean',
	Nil = 'nil',
	Symbol = 'symbol',
	Keyword = 'keyword',
	Atom = 'atom',

	// Functions
	Function = 'fn',
	Macro = 'macro',

	// Others
	Undefined = 'undefined',
}

export type MalBind = (
	| MalSymbol
	| string
	| {[k: string]: MalSymbol}
	| MalBind
)[]

export enum ExpandType {
	Constant = 1,
	Env,
	Unchange,
}

export interface ExpandInfoConstant {
	type: ExpandType.Constant
	exp: MalVal
}

export interface ExpandInfoEnv {
	type: ExpandType.Env
	exp: MalVal
	env: Env
}

export interface ExpandInfoUnchange {
	type: ExpandType.Unchange
}

export type ExpandInfo = ExpandInfoConstant | ExpandInfoEnv | ExpandInfoUnchange

export interface MalFuncThis {
	callerEnv: Env
}

export abstract class MalVal {
	parent: {ref: MalColl; index: number} | undefined = undefined

	abstract type: MalType
	abstract toString(): string
	abstract isType(value: MalVal): boolean
}

export type MalColl = MalList | MalVector | MalMap
export type MalSeq = MalList | MalVal

export class MalNumber extends MalVal {
	readonly type: MalType.Number = MalType.Number

	private constructor(public readonly value: number) {
		super()
	}

	valueOf() {
		return this.value
	}

	toString() {
		return this.value.toFixed(4).replace(/\.?[0]+$/, '')
	}

	isType(value: MalVal) : value is MalNumber {
		return value.type === MalType.Number
	}

	static create(value: number) {
		return new MalNumber(value)
	}
}

export class MalString extends MalVal {
	readonly type: MalType.String = MalType.String

	private constructor(public readonly value: string) {
		super()
	}

	valueOf() {
		return this.value
	}

	toString() {
		return `"${this.value}"`
	}

	static create(value: string) {
		return new MalString(value)
	}
}

export class MalBoolean extends MalVal {
	readonly type: MalType.Boolean = MalType.Boolean

	private constructor(public readonly value: boolean) {
		super()
	}

	valueOf() {
		return this.value
	}

	toString() {
		return this.value.toString()
	}

	static create(value: boolean) {
		return new MalBoolean(value)
	}
}

export class MalNil extends MalVal {
	readonly type: MalType.Nil = MalType.Nil

	private constructor() {
		super()
	}

	valueOf() {
		return null
	}

	toString() {
		return 'nil'
	}

	static create() {
		return new MalNil()
	}
}

export class MalKeyword extends MalVal {
	readonly type: MalType.Keyword = MalType.Keyword

	private constructor(public readonly value: string) {
		super()
	}

	toString() {
		return this.value
	}

	private static map = new Map<string, MalKeyword>()

	static create(value: string) {
		const cached = this.map.get(value)
		if (cached) {
			return cached
		}

		const token = new MalKeyword(value)
		this.map.set(value, token)

		return token
	}
}

export class MalList extends MalVal {
	readonly type: MalType.List = MalType.List

	public delimiters: string[] | undefined = undefined
	public evaluated: MalVal | undefined = undefined
	private str: string | undefined = undefined

	constructor(private readonly value: MalVal[]) {
		super()
	}

	toString() {
		if (this.str === undefined) {
			if (!this.delimiters) {
				this.delimiters =
					this.value.length === 0
						? []
						: ['', ...Array(this.value.length - 1).fill(' '), '']
			}

			let str = this.delimiters[0]
			for (let i = 0; i < this.value.length; i++) {
				str += this.delimiters[i + 1] + this.value[i]?.toString()
			}
			str += this.delimiters[this.delimiters.length - 1]

			this.str = '(' + str + ')'
		}

		return this.str
	}

	static create(...value: MalVal[]) {
		return value.length === 0 ? MalNil.create() : new MalList(value)
	}
}

export class MalVector extends MalVal {
	readonly type: MalType.Vector = MalType.Vector

	public delimiters: string[] | undefined = undefined
	public evaluated: MalVector | undefined = undefined
	private str: string | undefined = undefined

	constructor(private readonly value: MalVal[]) {
		super()
	}

	toString() {
		if (this.str === undefined) {
			if (!this.delimiters) {
				this.delimiters =
					this.value.length === 0
						? ['']
						: ['', ...Array(this.value.length - 1).fill(' '), '']
			}

			let str = this.delimiters[0]
			for (let i = 0; i < this.value.length; i++) {
				str += this.delimiters[i + 1] + this.value[i]?.toString()
			}
			str += this.delimiters[this.delimiters.length - 1]

			this.str = '[' + str + ']'
		}

		return this.str
	}

	static create(...value: MalVal[]) {
		return new MalVector(value)
	}
}

export class MalMap extends MalVal {
	readonly type: MalType.Map = MalType.Map

	public delimiters: string[] | undefined = undefined
	public evaluated: MalMap | undefined = undefined
	private str: string | undefined = undefined

	private value!: {[key: string]: MalVal}

	constructor(value: MalVal[]) {
		super()

		for (let i = 0; i + 1 < value.length; i += 1) {
			const k = value[i]
			const v = value[i + 1]
			if (isKeyword(k) || isString(k)) {
				this.value[getName(k)] = v
			} else {
				throw new MalError(
					`Unexpected key symbol: ${getType(k)}, expected: keyword or string`
				)
			}
		}
	}

	toString() {
		if (this.str === undefined) {
			const entries = Object.entries(this.value)

			if (!this.delimiters) {
				const size = entries.length
				this.delimiters =
					this.value.length === 0
						? ['']
						: ['', ...Array(size * 2 - 1).fill(' '), '']
			}

			let str = ''
			for (let i = 0; i < entries.length; i++) {
				const [k, v] = entries[i]
				str +=
					this.delimiters[2 * i + 1] +
					`:${k}` +
					this.delimiters[2 * 1 + 2] +
					v?.toString()
			}
			str += this.delimiters[this.delimiters.length - 1]

			this.str = '{' + str + '}'
		}

		return this.str
	}

	static create(...value: MalVal[]) {
		return new MalMap(value)
	}
}

type MalF = (
	this: MalFuncThis | void,
	...args: (MalVal | undefined)[]
) => MalVal

export class MalFunction extends MalVal {
	readonly type: MalType.Function = MalType.Function
	value!: MalF

	ast!: MalVal | undefined
	env!: Env
	params!: MalVal
	meta!: MalVal
	isMacro!: boolean

	private constructor() {
		super()
	}

	toString() {
		if (this.ast) {
			const keyword = this.isMacro ? 'macro' : 'fn'
			return `(${keyword} ${this.params.toString()} ${MalVal})`
		} else {
			return `#<JS Function>`
		}
	}

	static create(func: MalF) {
		const f = new MalFunction()
		f.value = func
		f.isMacro = false
	}

	static fromMal(
		func: MalF,
		exp: MalVal,
		env: Env,
		params: MalVal,
		meta: MalVal = MalNil.create(),
		isMacro = false
	): MalFunction {

		const f = new MalFunction()

		f.value = func
		f.env = env
		f.params = params
		f.meta = meta
		f.isMacro = isMacro

		return f
	}
}

export function createMap(map: any) {
	return map as MalMap
}

export class MalError extends Error {}

// Expand
function expandSymbolsInExp(exp: MalVal, env: Env): MalVal {
	const type = getType(exp)
	switch (type) {
		case MalType.List:
		case MalType.Vector: {
			let ret = (exp as MalVal[]).map(val => expandSymbolsInExp(val, env))
			if (type === MalType.List) {
				ret = MalList.create(...ret)
			}
			return ret
		}
		case MalType.Map: {
			const ret = {} as MalMap
			Object.entries(exp as MalMap).forEach(([key, val]) => {
				ret[key] = expandSymbolsInExp(val, env)
			})
			return ret
		}
		case MalType.Symbol:
			if (env.hasOwn(exp as MalSymbol)) {
				return env.get(exp as MalSymbol)
			} else {
				return exp
			}
		default:
			return exp
	}
}

export function setExpandInfo(exp: MalSeq, info: ExpandInfo) {
	exp[M_EXPAND] = info
}

export function expandExp(exp: MalVal) {
	if (isList(exp) && M_EXPAND in exp) {
		const info = exp[M_EXPAND]
		switch (info.type) {
			case ExpandType.Constant:
				return info.exp
			case ExpandType.Env:
				return expandSymbolsInExp(info.exp, info.env)
			case ExpandType.Unchange:
				return exp
		}
	} else {
		return getEvaluated(exp, false)
	}
}

export function getOuter(exp: any) {
	if (isNode(exp) && M_OUTER in exp) {
		return exp[M_OUTER]
	}
	return null
}

export function getType(obj: any): MalType {
	const _typeof = typeof obj
	switch (_typeof) {
		case 'object':
			if (obj === null) {
				return MalType.Nil
			} else if (Array.isArray(obj)) {
				const islist = (obj as MalSeq)[M_ISLIST]
				return islist ? MalType.List : MalType.Vector
			} else if (obj instanceof Float32Array) {
				return MalType.Vector
			} else if (obj.type === MalType.Symbol) {
				return MalType.Symbol
			} else if (obj.type === MalType.Atom) {
				return MalType.Atom
			} else {
				return MalType.Map
			}
		case 'function': {
			const ismacro = (obj as MalFunc)[M_ISMACRO]
			return ismacro ? MalType.Macro : MalType.Function
		}
		case 'string':
			switch ((obj as string)[0]) {
				case KEYWORD_PREFIX:
					return MalType.Keyword
				default:
					return MalType.String
			}
		case 'number':
			return MalType.Number
		case 'boolean':
			return MalType.Boolean
		default:
			return MalType.Undefined
	}
}

export type MalNode = MalNodeMap | MalSeq

export const isNode = (v: MalVal | undefined): v is MalNode => {
	const type = getType(v)
	return (
		type === MalType.List || type === MalType.Map || type === MalType.Vector
	)
}

export const isSeq = (v: MalVal | undefined): v is MalVector | MalList => {
	return v?.type === MalType.Vector || v?.type === MalType.List
}

export function getMeta(obj: MalVal): MalVal {
	if (obj instanceof Object) {
		return M_META in obj ? (obj as any)[M_META] : null
	} else {
		return MalNil.create()
	}
}

const TYPES_SUPPORT_META = new Set([
	MalType.Function,
	MalType.Macro,
	MalType.List,
	MalType.Vector,
	MalType.Map,
])

export function withMeta(a: MalVal, m: any) {
	if (m === undefined) {
		throw new MalError('[with-meta] Need the metadata to attach')
	}
	if (!TYPES_SUPPORT_META.has(getType(a))) {
		throw new MalError('[with-meta] Object should not be atom')
	}
	const c = cloneExp(a as MalNode)
	c[M_META] = m
	return c
}

export function setMeta(a: MalVal, m: MalVal) {
	if (!(a instanceof Object)) {
		throw new MalError('[with-meta] Object should not be atom')
	}
	;(a as any)[M_META] = m
	return a
}

export interface MalNodeSelection {
	outer: MalNode
	index: number
}

interface MalRootSelection {
	root: MalVal
}

export type MalSelection = MalNodeSelection | MalRootSelection

export function getMalFromSelection(sel: MalSelection) {
	if ('root' in sel) {
		return sel.root
	} else {
		const {outer, index} = sel
		if (isMap(outer)) {
			return outer[Object.keys(outer)[index]]
		} else {
			return outer[index]
		}
	}
}

// General Functions
export function isEqual(a: MalVal, b: MalVal) {
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false
		}
		for (let i = 0; i < a.length; i++) {
			if (!isEqual(a[i], b[i])) {
				return false
			}
		}
		return true
	} else if (isMap(a) && isMap(b)) {
		if (a.size !== b.size) {
			return false
		}
		for (const k of Object.keys(a)) {
			const aval = a[k],
				bval = b[k]
			if (aval === undefined || bval === undefined || !isEqual(aval, bval)) {
				return false
			}
		}
		return true
	} else {
		return a === b
	}
}

export function cloneExp<T extends MalVal>(exp: T, deep = false): T {
	switch (getType(exp)) {
		case MalType.List: {
			const children = deep
				? (exp as MalSeq).map(e => cloneExp(e, true))
				: (exp as MalSeq)
			const cloned = MalList.create(...children)
			if (Array.isArray((exp as MalNode)[M_DELIMITERS])) {
				;(cloned as MalNode)[M_DELIMITERS] = [...(exp as MalNode)[M_DELIMITERS]]
			}
			return cloned as T
		}
		case MalType.Vector: {
			const children = deep
				? (exp as MalSeq).map(e => cloneExp(e, true))
				: (exp as MalSeq)
			const cloned = MalVector.create(...children)
			if (Array.isArray((exp as MalNode)[M_DELIMITERS])) {
				;(cloned as MalNode)[M_DELIMITERS] = [...(exp as MalNode)[M_DELIMITERS]]
			}
			return cloned as T
		}
		case MalType.Map: {
			const cloned = deep
				? Object.fromEntries(
						Object.entries(exp as MalMap).map(([k, v]) => [
							k,
							cloneExp(v, true),
						])
				  )
				: {...(exp as MalMap)}
			if (Array.isArray((exp as MalNode)[M_DELIMITERS])) {
				;(cloned as MalNode)[M_DELIMITERS] = [...(exp as MalNode)[M_DELIMITERS]]
			}
			return cloned as T
		}
		case MalType.Function:
		case MalType.Macro: {
			// new function instance
			const fn = function (this: MalFuncThis, ...args: MalSeq) {
				return (exp as MalFunc).apply(this, args)
			}
			// copy original properties
			return Object.assign(fn, exp) as T
		}
		case MalType.Symbol:
			return MalSymbol.create((exp as MalSymbol).value) as T
		default:
			return exp
	}
}

export function getEvaluated(exp: MalVal, deep = true): MalVal {
	if (exp instanceof Object && M_EVAL in exp) {
		const evaluated = (exp as MalNode)[M_EVAL]
		if (isList(evaluated) && deep) {
			return getEvaluated(evaluated, deep)
		} else {
			return evaluated
		}
	} else {
		return exp
	}
}

export function getName(exp: MalVal): string {
	switch (exp.type) {
		case MalType.String:
			return (exp as MalString).value
		case MalType.Keyword:
			return (exp as MalKeyword).value
		case MalType.Symbol:
			return (exp as MalSymbol).value
		default:
			throw new MalError(
				'getName() can only extract the name by string/keyword/symbol'
			)
	}
}

// Functions

export function createMalFunc = MalFunction.fromMal

export const isFunc = (exp: MalVal | undefined): exp is MalFunc =>
	exp instanceof Function

export const isMalFunc = (obj: MalVal | undefined): obj is MalFunc =>
	obj instanceof Function && (obj as MalFunc)[M_AST] ? true : false

// String
export const isString = (obj: MalVal | undefined): obj is string =>
	getType(obj) === MalType.String

// Symbol
export class MalSymbol extends MalVal {
	public readonly type: MalType.Symbol = MalType.Symbol
	private [M_DEF]: MalSeq | null
	public evaluated: MalVal | undefined = undefined

	private constructor(public readonly value: string) {
		super()
	}

	set def(def: MalSeq | null) {
		this[M_DEF] = def
	}

	get def(): MalSeq | null {
		return this[M_DEF] || null
	}

	toString() {
		return this.value
	}

	static create(identifier: string) {
		return new MalSymbol(identifier)
	}
}

export const isSymbol = (obj: MalVal | undefined): obj is MalSymbol =>
	getType(obj) === MalType.Symbol

export const isSymbolFor = (obj: any, name: string): obj is MalSymbol =>
	isSymbol(obj) && obj.value === name

export const symbolFor = MalSymbol.create

// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal | undefined): obj is MalKeyword =>
	obj?.type === MalType.Keyword

export const keywordFor = MalKeyword.create

// List
export const isList = (obj: MalVal | undefined): obj is MalList => {
	return obj?.type === MalType.Vector
	// below code is identical to `getType(obj) === MalType.List`
	// return Array.isArray(obj) && (obj as any)[M_ISLIST]
}

// Vectors
export const isVector = (obj: MalVal | undefined): obj is MalVector =>
	obj?.type === MalType.Vector

// Maps
export const isMap = (obj: MalVal | undefined): obj is MalMap =>
	getType(obj) === MalType.Map

export function assocBang(hm: MalMap, ...args: any[]) {
	if (args.length % 2 === 1) {
		throw new MalError('Odd number of map arguments')
	}
	for (let i = 0; i < args.length; i += 2) {
		if (typeof args[i] !== 'string') {
			throw new MalError('Hash map can only use string/symbol/keyword as key')
		}
		hm[args[i]] = args[i + 1]
	}
	return createMap(hm)
}

// Atoms
export class MalAtom extends MalVal {
	public readonly type: MalType.Atom = MalType.Atom
	public constructor(public value: MalVal) {
		super()
	}

	toString(): string {
		return `(atom ${this.value?.toString()})`
	}
}

// General functions
export function malEquals(a: MalVal, b: MalVal) {
	const type = getType(a)
	const typeB = getType(b)

	if (type !== typeB) {
		return false
	}

	switch (type) {
		case MalType.List:
		case MalType.Vector:
			if ((a as MalVal[]).length !== (b as MalVal[]).length) {
				return false
			}
			for (let i = 0; i < (a as MalVal[]).length; i++) {
				if (!malEquals((a as MalVal[])[i], (b as MalVal[])[i])) {
					return false
				}
			}
			return true
		case MalType.Map: {
			const keys = Object.keys(a as MalMap)
			if (keys.length !== Object.keys(b as MalMap).length) {
				return false
			}
			for (const key of keys) {
				if (!malEquals((a as MalMap)[key], (b as MalMap)[key])) {
					return false
				}
			}
			return true
		}
		case MalType.Symbol:
			return (a as MalSymbol).value === (b as MalSymbol).value
		default:
			return a === b
	}
}
