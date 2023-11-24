import Env from './env'
import {
	M_AST,
	M_DELIMITERS,
	M_ENV,
	M_ISMACRO,
	M_META,
	M_PARAMS,
	M_PARENT,
	M_TYPE,
} from './symbols'

export type TextRange = [start: number, end: number]

export type Expr = ExprPrim | ExprForm

export type ExprPrim = number | string | boolean | null

export type ExprForm = ExprSymbol | ExprAtom | ExprFn | ExprJSFn | ExprColl

export type ExprColl = ExprMap | ExprList | Expr[]

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

export interface ExprCollBase {
	/**
	 * Caches the evaluated value of the node
	 */
	[M_META]?: Expr
	[M_DELIMITERS]?: string[]
	[M_PARENT]?: ExprColl
}

export interface ExprMap extends ExprCollBase {
	[keyword: string]: Expr
}

export type ExprSeq = ExprList | Expr[]

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
	| 'null'
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
				return 'null'
			} else if (Array.isArray(obj)) {
				return (obj as ExprList)[M_TYPE] === 'list' ? 'list' : 'vector'
			} else if (obj instanceof Float32Array) {
				return 'vector'
			} else if (M_TYPE in obj) {
				return obj[M_TYPE]
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

export const isColl = (expr?: Expr): expr is ExprColl => {
	return Array.isArray(expr) || isMap(expr)
}

export const isSeq = (expr?: Expr): expr is ExprSeq => {
	return Array.isArray(expr)
}

export const isAtom = (expr: Expr | undefined): expr is ExprAtom => {
	return typeof expr !== 'object' || expr === null
}
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

export const isFunc = (exp: Expr | undefined): exp is ExprFn | ExprJSFn =>
	exp instanceof Function

export const isExprFn = (obj: Expr | undefined): obj is ExprFn =>
	obj instanceof Function && (obj as ExprFn)[M_AST] ? true : false

// String
export const isString = (obj: Expr | undefined): obj is string =>
	getType(obj) === 'string'

// Symbol
export interface ExprSymbol {
	[M_TYPE]: 'symbol'
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
export interface ExprList extends Array<Expr>, ExprCollBase {
	[M_TYPE]: 'list'
	isSugar?: boolean
	expandInfo?: ExpandInfo
}

export const isList = (obj: Expr | undefined): obj is ExprList => {
	return Array.isArray(obj) && (obj as ExprList)[M_TYPE] === 'list'
}

export function createList(...coll: Expr[]): ExprList {
	;(coll as ExprList)[M_TYPE] = 'list'
	return coll as ExprList
}

// Vectors
export const isVector = (obj: Expr | undefined): obj is Expr[] => {
	return (
		(Array.isArray(obj) && (obj as ExprList)[M_TYPE] !== 'list') ||
		obj instanceof Float32Array
	)
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
	[M_TYPE] = 'atom'
	public constructor(public value: Expr) {}
}
