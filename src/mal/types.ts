import Env from './env'

export type MalJSFunc = (...args: MalVal[]) => MalVal | never

export const M_META = Symbol('meta')
export const M_AST = Symbol('ast')
export const M_ENV = Symbol('env')
export const M_PARAMS = Symbol('params')
export const M_ISMACRO = Symbol('ismacro')
export const M_START = Symbol('start')
export const M_END = Symbol('end')

export interface MalFunc {
	(...args: MalVal[]): MalVal
	[M_META]: MalVal
	[M_AST]: MalVal
	[M_ENV]: Env
	[M_PARAMS]: Array<string>
	[M_ISMACRO]: boolean
}

export class LispError extends Error {}

export type MalMap = {[keyword: string]: MalVal}

interface MalMapWithRange extends MalMap {
	[M_START]: number
	[M_END]: number
}

export interface MalListWithRange extends Array<MalVal> {
	[M_START]: number
	[M_END]: number
}

export type MalTreeWithRange = MalMapWithRange | MalListWithRange

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
	| MalTreeWithRange
	| Float32Array

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

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
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

export function cloneAST(obj: MalVal, newMeta?: MalVal): MalVal {
	let newObj = null
	if (Array.isArray(obj)) {
		newObj = [...obj]

		// eslint-disable-next-line @typescript-eslint/no-use-before-define
	} else if (isMap(obj)) {
		newObj = {...obj}
	} else if (obj instanceof Function) {
		// new function instance
		const fn = (...args: any) => obj.apply(fn, args)
		// copy original properties
		newObj = Object.assign(fn, obj)
	} else {
		throw new LispError('[JS: cloneAST] Unsupported type for clone')
	}

	if (typeof newMeta !== 'undefined') {
		;(newObj as MalFunc)[M_META] = newMeta
	}

	return newObj
}

// Functions
export function createMalFunc(
	fn: (...args: MalVal[]) => MalVal,
	ast: MalVal,
	env: Env,
	params: Array<string>,
	meta = null,
	ismacro = false
): MalFunc {
	const attrs = {
		[M_AST]: ast,
		[M_ENV]: env,
		[M_PARAMS]: params,
		[M_META]: meta,
		[M_ISMACRO]: ismacro
	}
	return Object.assign(fn, attrs)
}

export const isMalFunc = (obj: MalVal): obj is MalFunc =>
	obj && (obj as MalFunc)[M_AST] ? true : false

// Symbol
// Use \u01a8 as the prefix of symbol for AST object
export const isSymbol = (obj: MalVal): obj is string =>
	typeof obj === 'string' && obj[0] === '\u01a8'

export const symbolFor = (k: string) => '\u01a8' + k

// Keyword
// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal): obj is string =>
	typeof obj === 'string' && obj[0] === '\u029e'

export const keywordFor = (k: string) => '\u029e' + k

// List
export const isList = (obj: MalVal): obj is MalVal[] =>
	Array.isArray(obj) && !(obj instanceof MalVector) // eslint-disable-line @typescript-eslint/no-use-before-define

// Vectors
export class MalVector extends Array<MalVal> {}
export const isVector = (obj: MalVal): obj is MalVector =>
	obj instanceof MalVector

// Maps
export const isMap = (obj: MalVal): obj is MalMap =>
	obj instanceof Object && !isMalFunc(obj) && !Array.isArray(obj)

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

// Namespace
export interface MalNamespace {
	jsObjects?: Map<string, any>
	malCode?: string
}
