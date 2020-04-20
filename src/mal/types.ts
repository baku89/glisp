import Env from './env'

export type MalJSFunc = (...args: MalVal[]) => MalVal | never

export interface MalFunc {
	(...args: MalVal[]): MalVal
	meta: object | null
	ast: MalVal
	env: Env
	params: Array<string>
	ismacro: boolean
}

export class LispError extends Error {}

export type MalMap = Map<MalVal, MalVal>

interface MalMapWithRange extends MalMap {
	start: number
	end: number
}

export interface MalListWithRange extends MalMap {
	start: number
	end: number
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
	} else if (a instanceof Map && b instanceof Map) {
		if (a.size !== b.size) {
			return false
		}
		for (const k of a.keys()) {
			const aval = a.get(k),
				bval = b.get(k)
			if (aval === undefined || bval === undefined || !isEqual(aval, bval)) {
				return false
			}
		}
		return true
	} else {
		return a === b
	}
}

export function cloneAST(obj: MalVal, newMeta?: object): MalVal {
	let newObj = null
	if (Array.isArray(obj)) {
		newObj = [...obj]
	} else if (obj instanceof Map) {
		newObj = new Map(obj.entries())
	} else if (obj instanceof Function) {
		// new function instance
		const fn = (...args: any) => obj.apply(fn, args)
		// copy original properties
		newObj = Object.assign(fn, obj)
	} else {
		throw new LispError('[JS: cloneAST] Unsupported type for clone')
	}

	if (typeof newMeta !== 'undefined') {
		;(newObj as MalFunc).meta = newMeta
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
	return Object.assign(fn, {ast, env, params, meta, ismacro})
}

export const isMalFunc = (obj: MalVal) =>
	obj && (obj as MalFunc).ast ? true : false

// Symbol
// Use \u01a8 as the prefix of symbol for AST object
export const isSymbol = (obj: MalVal) =>
	typeof obj === 'string' && obj[0] === '\u01a8'
export const symbolFor = (k: string) => '\u01a8' + k

// Keyword
// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal) =>
	typeof obj === 'string' && obj[0] === '\u029e'
// export const createKeyword = (obj: MalVal) =>
// 	isKeyword(obj) ? obj : '\u029e' + (obj as string)

export const keywordFor = (k: string) => '\u029e' + k

// Maps
export function assocBang(hm: MalMap, ...args: any[]) {
	if (args.length % 2 === 1) {
		throw new LispError('Odd number of map arguments')
	}
	for (let i = 0; i < args.length; i += 2) {
		hm.set(args[i], args[i + 1])
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
