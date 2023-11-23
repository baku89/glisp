import Env from './env'
import {
	M_AST,
	M_DELIMITERS,
	M_ENV,
	M_EVAL,
	M_EXPAND,
	M_ISLIST,
	M_ISMACRO,
	M_ISSUGAR,
	M_META,
	M_PARAMS,
	M_PARENT,
	M_TYPE,
} from './symbols'

export type TextRange = [start: number, end: number]

export type ExprJSFn = (...args: Expr[]) => Expr

export type ExprBind = (
	| ExprSymbol
	| string
	| Record<string, ExprSymbol>
	| ExprBind
)[]

export interface ExpandInfoConstant {
	type: 'constant'
	exp: Expr
}

export interface ExpandInfoEnv {
	type: 'env'
	exp: Expr
	env: Env
}

export interface ExpandInfoUnchange {
	type: 'unchange'
}

export type ExpandInfo = ExpandInfoConstant | ExpandInfoEnv | ExpandInfoUnchange

export interface ExprFnThis {
	callerEnv: Env
}

export interface ExprFn {
	(this: void | ExprFnThis, ...args: Expr[]): Expr
	[M_META]?: Expr
	[M_AST]: Expr
	[M_ENV]: Env
	[M_PARAMS]: ExprBind
	[M_ISMACRO]: boolean
}

export class GlispError extends Error {}

interface ExprNodeBase {
	/**
	 * Caches the evaluated value of the node
	 */
	[M_EVAL]?: Expr
	[M_META]?: Expr
	[M_DELIMITERS]?: string[]
	[M_PARENT]?: ExprColl
}

export interface ExprMap extends ExprNodeBase {
	[keyword: string]: Expr
}

export interface ExprList extends Array<Expr>, ExprNodeBase {
	[M_ISLIST]: true
	[M_ISSUGAR]: boolean
	[M_EXPAND]?: ExpandInfo
}

export interface ExprVector extends Array<Expr>, ExprNodeBase {
	[M_ISLIST]?: false
}

export type ExprSeq = ExprList | ExprVector

export type ExprWithMeta = ExprFn | ExprColl

export function canAttachMeta(expr: Expr): expr is ExprWithMeta {
	return isColl(expr) || isFunc(expr)
}

export type ExprType =
	// Collections
	| 'list'
	| 'vector'
	| 'map'
	// Atoms
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
	// Others
	| 'undefined'

export function getType(obj: any): ExprType {
	const _typeof = typeof obj
	switch (_typeof) {
		case 'object':
			if (obj === null) {
				return 'nil'
			} else if (Array.isArray(obj)) {
				const isList = M_ISLIST in obj && obj[M_ISLIST]
				return isList ? 'list' : 'vector'
			} else if (obj instanceof Float32Array) {
				return 'vector'
			} else if ((obj as any)[M_TYPE] === 'symbol') {
				return 'symbol'
			} else if ((obj as any)[M_TYPE] === 'atom') {
				return 'atom'
			} else {
				return 'map'
			}
		case 'function': {
			const isMacro = obj[M_ISMACRO]
			return isMacro ? 'macro' : 'fn'
		}
		case 'string':
			switch (obj[0]) {
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

export type ExprColl = ExprMap | ExprList | ExprVector

export const isColl = (v?: Expr): v is ExprColl => {
	return isList(v) || isVector(v) || isMap(v)
}

export const isSeq = (v?: Expr): v is ExprSeq => {
	const type = getType(v)
	return type === 'list' || type === 'vector'
}

export const isAtom = (v: Expr | undefined): v is ExprAtom => {
	return getType(v) === 'atom'
}

export type Expr =
	| number
	| string
	| boolean
	| null
	| ExprSymbol
	| ExprAtom
	| ExprFn
	| ExprJSFn
	| ExprColl

export interface ExprCollSelection {
	outer: ExprColl
	index: number
}

interface ExprRootSelection {
	root: Expr
}

export type ExprSelection = ExprCollSelection | ExprRootSelection

export function getExprFromSelection(sel: ExprSelection) {
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
export function isEqual(a: Expr, b: Expr) {
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

// Functions

export function createFn(
	fn: (this: void | ExprFnThis, ...args: Expr[]) => Expr,
	exp: Expr,
	env: Env,
	params: ExprBind,
	meta = null,
	isMacro = false
): ExprFn {
	const attrs = {
		[M_AST]: exp,
		[M_ENV]: env,
		[M_PARAMS]: params,
		[M_META]: meta,
		[M_ISMACRO]: isMacro,
	}
	return Object.assign(fn, attrs)
}

export const isFunc = (exp: Expr | undefined): exp is ExprFn =>
	exp instanceof Function

export const isExprFn = (obj: Expr | undefined): obj is ExprFn =>
	obj instanceof Function && (obj as ExprFn)[M_AST] ? true : false

// String
export const isString = (obj: Expr | undefined): obj is string =>
	getType(obj) === 'string'

// Symbol
export interface ExprSymbol {
	[M_TYPE]: 'symbol'
	[M_EVAL]: Expr
	value: string
}

export const isSymbol = (obj: Expr | undefined): obj is ExprSymbol => {
	return getType(obj) === 'symbol'
}

export const isSymbolFor = (obj: any, name: string): obj is ExprSymbol =>
	isSymbol(obj) && obj.value === name

export function symbolFor(value: string): ExprSymbol {
	return {
		[M_TYPE]: 'symbol',
		[M_EVAL]: null,
		value,
	}
}

// Keyword
const KEYWORD_PREFIX = '\u029e'

// Use \u029e as the prefix of keyword instead of colon (:) for AST object
export const isKeyword = (obj: Expr | undefined): obj is string =>
	getType(obj) === 'keyword'

export const keywordFor = (k: string) => KEYWORD_PREFIX + k

// List
export const isList = (obj: Expr | undefined): obj is ExprList => {
	// below code is identical to `getType(obj) === 'list'`
	return Array.isArray(obj) && M_ISLIST in obj && (obj[M_ISLIST] ?? false)
}

export function createList(...coll: Expr[]): ExprList {
	const list = coll as ExprList
	list[M_ISLIST] = true
	return list
}

// Vectors
export const isVector = (obj: Expr | undefined): obj is ExprVector => {
	// below code is identical to `getType(obj) === 'vector'`
	return (
		(Array.isArray(obj) && (!(M_ISLIST in obj) || !obj[M_ISLIST])) ||
		obj instanceof Float32Array
	)
}

export function createVector(...coll: Expr[]) {
	coll.forEach(child => {
		if (isColl(child)) {
			child[M_PARENT] = coll as ExprSeq
		}
	})
	return coll as ExprSeq
}

// Maps
export const isMap = (obj: Expr | undefined): obj is ExprMap =>
	getType(obj) === 'map'

export function assocBang(hm: ExprMap, ...args: any[]) {
	if (args.length % 2 === 1) {
		throw new GlispError('Odd number of map arguments')
	}
	for (let i = 0; i < args.length; i += 2) {
		if (typeof args[i] !== 'string') {
			throw new GlispError('Hash map can only use string/symbol/keyword as key')
		}
		hm[args[i]] = args[i + 1]
	}
	return hm
}

// Atoms
export class ExprAtom {
	public constructor(public value: Expr) {
		;(this as any)[M_TYPE] = 'atom'
	}
}
