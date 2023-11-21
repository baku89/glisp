import {mapValues} from 'lodash'

import Env from './env'

export type MalJSFunc = (...args: MalVal[]) => MalVal | never

export const M_META = Symbol.for('meta')
export const M_AST = Symbol.for('ast')
export const M_ENV = Symbol.for('env')
export const M_PARAMS = Symbol.for('params')
export const M_ISMACRO = Symbol.for('ismacro')
export const M_ISLIST = Symbol.for('islist')
export const M_TYPE = Symbol.for('type')

export const M_EVAL = Symbol.for('eval')
export const M_OUTER = Symbol.for('outer')
export const M_OUTER_INDEX = Symbol.for('outer-key')
const M_EXPAND = Symbol.for('expand')

// Stores string repsentation
export const M_ISSUGAR = Symbol('issugar')
export const M_ELMSTRS = Symbol.for('elmstrs') // string representations of each elements
export const M_DELIMITERS = Symbol.for('delimiters') // delimiter strings of list/map

export const M_DEF = Symbol.for('def') // save def exp reference in symbol object

export type MalBind = (
	| MalSymbol
	| string
	| Record<string, MalSymbol>
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

export interface MalFunc {
	(this: void | MalFuncThis, ...args: MalVal[]): MalVal
	[M_META]?: MalVal
	[M_AST]: MalVal
	[M_ENV]: Env
	[M_PARAMS]: MalBind
	[M_ISMACRO]: boolean
}

export class MalError extends Error {}

export interface MalMap {
	[keyword: string]: MalVal
	[M_META]?: MalVal
	[M_DELIMITERS]: string[]
	[M_ELMSTRS]: string[]
	[M_EVAL]: MalVal
	[M_OUTER]: MalNode
	[M_OUTER_INDEX]: number
}

export interface MalSeq extends Array<MalVal> {
	[M_ISLIST]: boolean
	[M_META]?: MalVal
	[M_ISSUGAR]: boolean
	[M_DELIMITERS]: string[]
	[M_ELMSTRS]: string[]
	[M_EVAL]: MalVal // Stores evaluted value of the node
	[M_EXPAND]: ExpandInfo
	[M_OUTER]: MalNode
	[M_OUTER_INDEX]: number
}

// Expand
function expandSymbolsInExp(exp: MalVal, env: Env): MalVal {
	const type = getType(exp)
	switch (type) {
		case MalType.List:
		case MalType.Vector: {
			let ret = (exp as MalVal[]).map(val => expandSymbolsInExp(val, env))
			if (type === MalType.List) {
				ret = createList(...ret)
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
			} else if ((obj as any)[M_TYPE] === MalType.Symbol) {
				return MalType.Symbol
			} else if ((obj as any)[M_TYPE] === MalType.Atom) {
				return MalType.Atom
			} else {
				return MalType.Map
			}
		case 'function': {
			const ismacro = obj[M_ISMACRO]
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

export type MalNode = MalMap | MalSeq

export const isNode = (v?: MalVal): v is MalNode => {
	const type = getType(v)
	return (
		type === MalType.List || type === MalType.Map || type === MalType.Vector
	)
}

export const isSeq = (v?: MalVal): v is MalSeq => {
	const type = getType(v)
	return type === MalType.List || type === MalType.Vector
}

export const isAtom = (v: MalVal | undefined): v is MalAtom => {
	return getType(v) === MalType.Atom
}

export function getMeta(obj: MalVal): MalVal {
	if (obj instanceof Object) {
		return M_META in obj ? (obj as any)[M_META] : null
	} else {
		return null
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

export type MalVal =
	| number
	| string
	| boolean
	| null
	| MalSymbol
	| MalAtom
	| MalFunc
	| MalJSFunc
	| MalMap
	| MalVal[]
	| MalNode

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
	if (isList(exp)) {
		const children = deep ? exp.map(e => cloneExp(e, true)) : exp
		const cloned = createList(...children)
		if (Array.isArray((exp as MalNode)[M_DELIMITERS])) {
			cloned[M_DELIMITERS] = [...(exp as MalNode)[M_DELIMITERS]]
		}
		return cloned as T
	} else if (isVector(exp)) {
		const children = deep ? exp.map(e => cloneExp(e, true)) : exp
		const cloned = createVector(...children)
		if (Array.isArray((exp as MalNode)[M_DELIMITERS])) {
			cloned[M_DELIMITERS] = [...(exp as MalNode)[M_DELIMITERS]]
		}
		return cloned as T
	} else if (isMap(exp)) {
		const cloned = deep
			? mapValues(exp, v => cloneExp(v, true))
			: {...(exp as MalMap)}

		if (Array.isArray((exp as MalNode)[M_DELIMITERS])) {
			;(cloned as MalNode)[M_DELIMITERS] = [...(exp as MalNode)[M_DELIMITERS]]
		}
		return cloned as T
	} else if (isFunc(exp)) {
		// new function instance
		const fn = function (this: MalFuncThis, ...args: MalSeq) {
			return exp.apply(this, args)
		}
		// copy original properties
		return Object.assign(fn, exp) as T
	} else if (isSymbol(exp)) {
		return symbolFor(exp.value) as T
	} else {
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
	switch (getType(exp)) {
		case MalType.String:
			return exp as string
		case MalType.Keyword:
			return (exp as string).slice(1)
		case MalType.Symbol:
			return (exp as MalSymbol).value
		default:
			throw new MalError(
				'getName() can only extract the name by string/keyword/symbol'
			)
	}
}

// Functions

export function createMalFunc(
	fn: (this: void | MalFuncThis, ...args: MalVal[]) => MalVal,
	exp: MalVal,
	env: Env,
	params: MalBind,
	meta = null,
	ismacro = false
): MalFunc {
	const attrs = {
		[M_AST]: exp,
		[M_ENV]: env,
		[M_PARAMS]: params,
		[M_META]: meta,
		[M_ISMACRO]: ismacro,
	}
	return Object.assign(fn, attrs)
}

export const isFunc = (exp: MalVal | undefined): exp is MalFunc =>
	exp instanceof Function

export const isMalFunc = (obj: MalVal | undefined): obj is MalFunc =>
	obj instanceof Function && (obj as MalFunc)[M_AST] ? true : false

// String
export const isString = (obj: MalVal | undefined): obj is string =>
	getType(obj) === MalType.String

// Symbol
export class MalSymbol {
	public constructor(public value: string) {
		;(this as any)[M_TYPE] = MalType.Symbol
	}

	public set def(def: MalSeq | null) {
		;(this as any)[M_DEF] = def
	}

	public get def(): MalSeq | null {
		return (this as any)[M_DEF] || null
	}

	public set evaluated(value: MalVal) {
		;(this as any)[M_EVAL] = value
	}

	public get evaluated(): MalVal {
		return (this as any)[M_EVAL]
	}

	public toString() {
		return this.value
	}
}

export const isSymbol = (obj: MalVal | undefined): obj is MalSymbol =>
	getType(obj) === MalType.Symbol

export const isSymbolFor = (obj: any, name: string): obj is MalSymbol =>
	isSymbol(obj) && obj.value === name

export const symbolFor = (value: string) => new MalSymbol(value)

// Keyword
const KEYWORD_PREFIX = '\u029e'

// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal | undefined): obj is string =>
	getType(obj) === MalType.Keyword

export const keywordFor = (k: string) => KEYWORD_PREFIX + k

// List
export const isList = (obj: MalVal | undefined): obj is MalSeq => {
	// below code is identical to `getType(obj) === MalType.List`
	return Array.isArray(obj) && (obj as any)[M_ISLIST]
}

export function createList(...coll: MalVal[]): MalSeq {
	;(coll as MalSeq)[M_ISLIST] = true
	coll.forEach((child, i) => {
		if (isNode(child)) {
			child[M_OUTER] = coll as MalSeq
			child[M_OUTER_INDEX] = i
		}
	})
	return coll as MalSeq
}

// Vectors
export const isVector = (obj: MalVal | undefined): obj is MalSeq => {
	// below code is identical to `getType(obj) === MalType.Vector`
	return (
		(Array.isArray(obj) && !(obj as any)[M_ISLIST]) ||
		obj instanceof Float32Array
	)
}

export function createVector(...coll: MalVal[]) {
	coll.forEach((child, i) => {
		if (isNode(child)) {
			child[M_OUTER] = coll as MalSeq
			child[M_OUTER_INDEX] = i
		}
	})
	return coll as MalSeq
}

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
	return hm
}

// Atoms
export class MalAtom {
	public constructor(public value: MalVal) {
		;(this as any)[M_TYPE] = MalType.Atom
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
