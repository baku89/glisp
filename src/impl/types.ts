/* eslint-disable @typescript-eslint/no-use-before-define */

import Env from './env'
import {LispError} from './repl'

type MalPureFunc = (...args: MalVal[]) => MalVal

export interface MalFunc {
	(...args: MalVal[]): MalVal
	meta: object | null
	ast: MalVal
	env: Env
	params: Array<symbol>
	ismacro: boolean
}

export type MalVal =
	| number
	| string
	| boolean
	| symbol
	| null
	| MalAtom
	| MalFunc
	| MalPureFunc
	| MalVal[]

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
	} else {
		return a === b
	}
}

export function cloneAST(obj: MalVal, newMeta?: object): MalVal {
	let newObj = null
	if (Array.isArray(obj)) {
		newObj = [...obj]
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
	params: Array<symbol>,
	meta = null,
	ismacro = false
): MalFunc {
	return Object.assign(fn, {ast, env, params, meta, ismacro})
}

export const isMalFunc = (obj: MalVal) =>
	obj && (obj as MalFunc).ast ? true : false

// Keyword
// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: MalVal) =>
	typeof obj === 'string' && obj[0] === '\u029e'
export const createKeyword = (obj: MalVal) =>
	isKeyword(obj) ? obj : '\u029e' + (obj as string)

export const keywordFor = (k: string) => '\u029e' + k

// Atoms
export class MalAtom {
	public val: any

	constructor(val: any) {
		this.val = val
	}
}
