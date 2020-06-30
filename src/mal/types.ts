/* eslint-disable @typescript-eslint/no-use-before-define */
import Env from './env'

export type MalJSFunc = (...args: MalVal[]) => MalVal | never

export const M_META = Symbol.for('meta')
export const M_AST = Symbol.for('ast')
export const M_ENV = Symbol.for('env')
export const M_PARAMS = Symbol.for('params')
export const M_ISMACRO = Symbol.for('ismacro')
export const M_ISLIST = Symbol.for('islist')

export const M_EVAL = Symbol.for('eval')
export const M_EVAL_PARAMS = Symbol.for('eval-params')
export const M_FN = Symbol.for('fn')
export const M_OUTER = Symbol.for('outer')
export const M_OUTER_INDEX = Symbol.for('outer-key')
export const M_CACHE = Symbol.for('cache') // misc caches used by libraries
const M_EXPAND = Symbol.for('expand')

// Stores string repsentation
export const M_ISSUGAR = Symbol('issugar')
export const M_ELMSTRS = Symbol.for('elmstrs') // string representations of each elements
export const M_KEYS = Symbol.for('keys') // keys of hashmap in order
export const M_DELIMITERS = Symbol.for('delimiters') // delimiter strings of list/map

export const M_DEF = Symbol.for('def') // save def exp reference in symbol object

export type MalBind = (MalSymbol | {[k: string]: MalSymbol} | MalBind)[]

export enum ExpandType {
	Constant = 1,
	Env
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

export type ExpandInfo = ExpandInfoConstant | ExpandInfoEnv

export interface MalFuncThis {
	callerEnv: Env
}

export interface MalFunc extends Function {
	(this: void | MalFuncThis, ...args: MalVal[]): MalVal
	[M_META]?: MalVal
	[M_AST]: MalVal
	[M_ENV]: Env
	[M_PARAMS]: MalBind
	[M_ISMACRO]: boolean
}

export class LispError extends Error {}

export type MalMap = {[keyword: string]: MalVal}

export interface MalNodeMap extends MalMap {
	[M_META]?: MalVal
	[M_DELIMITERS]: string[]
	[M_ELMSTRS]: string[]
	[M_KEYS]: string[]
	[M_EVAL]: MalVal
	[M_OUTER]: MalNode
	[M_OUTER_INDEX]: number
	[M_CACHE]: {[k: string]: any}
}

export interface MalNodeSeq extends Array<MalVal> {
	[M_ISLIST]: boolean
	[M_META]?: MalVal
	[M_ISSUGAR]: boolean
	[M_DELIMITERS]: string[]
	[M_ELMSTRS]: string[]
	[M_FN]: MalFunc | MalJSFunc // Reference to a function
	[M_EVAL]: MalVal // Stores evaluted value of the node
	[M_EVAL_PARAMS]: MalVal[] // Stores evaluated values of fn's parameters
	[M_EXPAND]: ExpandInfo
	[M_OUTER]: MalNode
	[M_OUTER_INDEX]: number
	[M_CACHE]: {[k: string]: any}
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

export function setExpandInfo(exp: MalNodeSeq, info: ExpandInfo) {
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
		}
	} else {
		return getEvaluated(exp)
	}
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
	Undefined = 'undefined'
}

export function getType(obj: MalVal | undefined): MalType {
	const _typeof = typeof obj
	switch (_typeof) {
		case 'object':
			if (obj === null) {
				return MalType.Nil
			} else if (Array.isArray(obj)) {
				const islist = (obj as MalNodeSeq)[M_ISLIST]
				return islist ? MalType.List : MalType.Vector
			} else if (obj instanceof Float32Array) {
				return MalType.Vector
			} else if ((obj as MalSymbol).type === MalType.Symbol) {
				return MalType.Symbol
			} else if (obj instanceof MalAtom) {
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

export function getMalNodeCache(node: MalNode, key: string): any | undefined {
	if (node[M_CACHE] instanceof Object) {
		return node[M_CACHE][key]
	} else {
		return undefined
	}
}

export function setMalNodeCache(node: MalNode, key: string, value: any) {
	if (!(node[M_CACHE] instanceof Object)) {
		node[M_CACHE] = {}
	}
	node[M_CACHE][key] = value
}

export type MalNode = MalNodeMap | MalNodeSeq

export const isMalNode = (v: MalVal): v is MalNode => {
	const type = getType(v)
	return (
		type === MalType.List || type === MalType.Map || type === MalType.Vector
	)
}

export const isSeq = (v: MalVal): v is MalNodeSeq => {
	const type = getType(v)
	return type === MalType.List || type === MalType.Vector
}

export function getMeta(obj: MalVal): MalVal {
	if (obj instanceof Object) {
		return M_META in obj ? (obj as any)[M_META] : null
	} else {
		return null
	}
}

export function withMeta(a: MalVal, m: any) {
	if (m === undefined) {
		throw new LispError('[with-meta] Need the metadata to attach')
	}
	if (!(a instanceof Object)) {
		throw new LispError('[with-meta] Object should not be atom')
	}
	const c = cloneExp(a, m)
	return c
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
			return outer[outer[M_KEYS][index]]
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

export function cloneExp<T extends MalVal>(obj: T, newMeta?: MalVal): T {
	let newObj: T

	const type = getType(obj)

	switch (getType(obj)) {
		case MalType.List:
		case MalType.Vector:
			newObj = [...(obj as MalVal[])] as any
			if (type === MalType.List) {
				createList(...(newObj as any))
			}
			break
		case MalType.Map:
			newObj = {...(obj as MalMap)} as any
			break
		case MalType.Function:
		case MalType.Macro: {
			// new function instance
			const fn = (...args: any) => (obj as Function)(...args)
			// copy original properties
			newObj = Object.assign(fn, obj)
			break
		}
		default:
			newObj = obj
	}

	if (newMeta !== undefined && newObj instanceof Object) {
		;(newObj as any)[M_META] = newMeta
	}

	return newObj
}

export function getEvaluated(exp: MalVal) {
	if (exp instanceof Object && M_EVAL in exp) {
		return (exp as MalNode)[M_EVAL]
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
			throw new LispError(
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
		[M_ISMACRO]: ismacro
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
	static map =
		((globalThis as any)['mal-symbols'] as Map<string, MalSymbol>) ||
		new Map<string, MalSymbol>()

	static get(value: string): MalSymbol {
		let token = MalSymbol.map.get(value)
		if (token) {
			return token
		}
		token = new MalSymbol(value)
		MalSymbol.map.set(value, token)
		return token
	}

	private constructor(public value: string) {}

	public type = MalType.Symbol

	public set def(def: MalNodeSeq | null) {
		;(this as any)[M_DEF] = def
	}

	public get def(): MalNodeSeq | null {
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
;(globalThis as any)['mal-symbols'] = MalSymbol.map
;(globalThis as any).MalSymbol = MalSymbol

export const isSymbol = (obj: MalVal): obj is MalSymbol =>
	getType(obj) === MalType.Symbol

export const symbolFor = MalSymbol.get

// Keyword
const KEYWORD_PREFIX = '\u029e'

// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal): obj is string =>
	getType(obj) === MalType.Keyword

export const keywordFor = (k: string) => KEYWORD_PREFIX + k

// List
export const isList = (obj: MalVal): obj is MalNodeSeq =>
	getType(obj) === MalType.List

export function createList(...coll: MalVal[]) {
	;(coll as MalNodeSeq)[M_ISLIST] = true
	return coll
}

// Vectors
export const isVector = (obj: MalVal): obj is MalVal[] =>
	getType(obj) === MalType.Vector

// Maps
export const isMap = (obj: MalVal | undefined): obj is MalMap =>
	getType(obj) === MalType.Map

export function assocBang(hm: MalMap, ...args: any[]) {
	if (args.length % 2 === 1) {
		throw new LispError('Odd number of map arguments')
	}
	for (let i = 0; i < args.length; i += 2) {
		if (typeof args[i] !== 'string') {
			throw new LispError('Hash map can only use string/symbol/keyword as key')
		}
		hm[args[i]] = args[i + 1]
	}
	return hm
}

// Atoms
export class MalAtom {
	public val: MalVal

	constructor(val: MalVal) {
		this.val = val
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
