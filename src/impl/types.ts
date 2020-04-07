/* eslint-disable @typescript-eslint/no-use-before-define */

import Env from './env'

type MalPureFunc = (...args: MalList) => MalVal

export interface MalFunc {
	(...args: MalList): MalVal
	meta: object | null
	ast: MalVal
	env: Env
	params: Array<symbol>
	ismacro: boolean
}

export interface MalVector {
	[index: number]: MalVal
	isvector: boolean
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
	| MalVector
	| MalList

export type MalList = Array<MalVal>

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
	if (isList(obj)) {
		newObj = (obj as MalList).slice(0)
	} else if (isVector(obj)) {
		newObj = createMalVector((obj as MalList).slice(0))
	} /* else if (obj instanceof Map) {
			newObj = new Map(obj.entries())
	}*/ else if (
		obj instanceof Function
	) {
		// new function instance
		const fn = (...args: any) => obj.apply(fn, args)
		// copy original properties
		newObj = Object.assign(fn, obj)
	} else {
		throw Error('Unsupported type for clone')
	}

	if (typeof newMeta !== 'undefined') {
		;(newObj as MalFunc).meta = newMeta
	}

	return newObj
}

// Functions
export function createMalFunc(
	fn: (...args: MalList) => MalVal,
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

// Lists
export function isList(obj: MalVal) {
	return !!(Array.isArray(obj) && !(obj as any).isvector)
}

// Vector
export function createMalVector(obj: MalList) {
	;(obj as any).isvector = true
	return obj
}

export function isVector(obj: MalVal) {
	return !!(Array.isArray(obj) && (obj as any).isvector)
}

// Atoms
export class MalAtom {
	public val: any

	constructor(val: any) {
		this.val = val
	}
}
