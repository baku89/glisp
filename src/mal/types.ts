/* eslint-disable @typescript-eslint/no-use-before-define */
import Env from './env'

export type MalJSFunc = (...args: MalVal[]) => MalVal | never

export const M_META = Symbol.for('meta')
export const M_AST = Symbol.for('ast')
export const M_ENV = Symbol.for('env')
export const M_PARAMS = Symbol.for('params')
export const M_ISMACRO = Symbol.for('ismacro')
const M_ISVECTOR = Symbol.for('isvector')

export const M_EVAL = Symbol.for('eval')
export const M_EVAL_PARAMS = Symbol.for('eval-params')
export const M_EXPANDED = Symbol.for('macroexpanded')
export const M_FN = Symbol.for('fn')
export const M_OUTER = Symbol.for('outer')
export const M_OUTER_INDEX = Symbol.for('outer-key')
export const M_CACHE = Symbol.for('cache') // misc caches used by libraries

// Stores string repsentation
export const M_ISSUGAR = Symbol('issugar')
export const M_ELMSTRS = Symbol.for('elmstrs') // string representations of each elements
export const M_KEYS = Symbol.for('keys') // keys of hashmap in order
export const M_DELIMITERS = Symbol.for('delimiters') // delimiter strings of list/map

export type MalBind = (string | MalBind)[]

export interface MalFunc extends Function {
	(...args: MalVal[]): MalVal
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

export interface MalNodeList extends Array<MalVal> {
	[M_ISVECTOR]: boolean
	[M_META]?: MalVal
	[M_ISSUGAR]: boolean
	[M_DELIMITERS]: string[]
	[M_ELMSTRS]: string[]
	[M_FN]: MalFunc | MalJSFunc // Reference to a function
	[M_EVAL]: MalVal // Stores evaluted value of the node
	[M_EVAL_PARAMS]: MalVal[] // Stores evaluated values of fn's parameters
	[M_EXPANDED]: MalVal
	[M_OUTER]: MalNode
	[M_OUTER_INDEX]: number
	[M_CACHE]: {[k: string]: any}
}

type MalTypeString =
	// Collections
	| 'list'
	| 'vector'
	| 'map'

	// Atomics
	| 'number'
	| 'string'
	| 'boolean'
	| 'nil'
	| 'symbol'
	| 'keyword'
	| 'atom'
	// Functions
	| 'fn'
	| 'macro'
	| 'undefined'

export function getType(obj: MalVal | undefined): MalTypeString {
	const _typeof = typeof obj
	switch (_typeof) {
		case 'object':
			if (obj === null) {
				return 'nil'
			} else if (Array.isArray(obj)) {
				const isvector = (obj as MalNodeList)[M_ISVECTOR]
				return isvector ? 'vector' : 'list'
			} else if (obj instanceof Float32Array) {
				return 'vector'
			} else if (obj instanceof MalAtom) {
				return 'atom'
			} else {
				return 'map'
			}
		case 'function': {
			const ismacro = (obj as MalFunc)[M_ISMACRO]
			return ismacro ? 'macro' : 'fn'
		}
		case 'string':
			switch ((obj as string)[0]) {
				case SYMBOL_PREFIX:
					return 'symbol'
				case KEYWORD_PREFIX:
					return 'keyword'
				default:
					return 'string'
			}
		case 'number':
			return 'number'
		case 'boolean':
			return 'boolean'
		default:
			return 'undefined'
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

export type MalNode = MalNodeMap | MalNodeList

export const isMalNode = (v: MalVal): v is MalNode => v instanceof Object

export function getMeta(obj: MalVal) {
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
	if (!isMalNode(a)) {
		throw new LispError('[with-meta] Object should not be atom')
	}
	const c = cloneExp(a)
	;(c as MalNode)[M_META] = m
	return c
}

export type MalVal =
	| number
	| string
	| boolean
	| null
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
	if (Array.isArray(obj)) {
		newObj = [...obj] as any
		if (isVector(obj)) {
			markMalVector(newObj as any)
		}
	} else if (isMap(obj)) {
		newObj = {...(obj as MalMap)} as any
	} else if (obj instanceof Function) {
		// new function instance
		const fn = (...args: any) => obj.apply(fn, args)
		// copy original properties
		newObj = Object.assign(fn, obj)
	} else {
		throw new LispError('[JS: cloneExp] Unsupported type for clone')
	}

	if (typeof newMeta !== 'undefined') {
		;(newObj as MalNode)[M_META] = newMeta
	}

	return newObj
}

// Functions
export function createMalFunc(
	fn: (...args: MalVal[]) => MalVal,
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

const KEYWORD_PREFIX = '\u029e'
const SYMBOL_PREFIX = '\u01a8'

export const isMalFunc = (obj: MalVal): obj is MalFunc =>
	obj instanceof Function && (obj as MalFunc)[M_AST] ? true : false

// String
export const isString = (obj: MalVal | undefined): obj is string =>
	getType(obj) === 'string'

// Symbol
// Use \u01a8 as the prefix of symbol for AST object
export const isSymbol = (obj: MalVal): obj is string =>
	getType(obj) === 'symbol'

export const symbolFor = (k: string) => SYMBOL_PREFIX + k

// Keyword
// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal): obj is string =>
	getType(obj) === 'keyword'

export const keywordFor = (k: string) => KEYWORD_PREFIX + k

// List
export const isList = (obj: MalVal): obj is MalVal[] => getType(obj) === 'list'

// Vectors
export const isVector = (obj: MalVal): obj is MalVal[] =>
	getType(obj) === 'vector'

export function markMalVector(arr: MalVal[]): MalVal[] {
	;(arr as any)[M_ISVECTOR] = true
	return arr
}

// Maps
export const isMap = (obj: MalVal | undefined): obj is MalMap =>
	getType(obj) === 'map'

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
		case 'list':
		case 'vector':
			if ((a as MalVal[]).length !== (b as MalVal[]).length) {
				return false
			}
			for (let i = 0; i < (a as MalVal[]).length; i++) {
				if (!malEquals((a as MalVal[])[i], (b as MalVal[])[i])) {
					return false
				}
			}
			return true
		case 'map': {
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
		default:
			return a === b
	}
}
