import {mapValues} from 'lodash'

import Env from './env'
import {getDelimiters} from './utils'

export type ExprJSFn = (...args: Expr[]) => Expr

export const M_META = Symbol.for('meta')
export const M_AST = Symbol.for('ast')
export const M_ENV = Symbol.for('env')
export const M_PARAMS = Symbol.for('params')
export const M_ISMACRO = Symbol.for('ismacro')
export const M_ISLIST = Symbol.for('islist')
export const M_TYPE = Symbol.for('type')

export const M_EVAL = Symbol.for('eval')
export const M_PARENT = Symbol.for('outer')
export const M_PARENT_INDEX = Symbol.for('outer-key')
export const M_EXPAND = Symbol.for('expand')

// Stores string repsentation
export const M_ISSUGAR = Symbol('issugar')
export const M_DELIMITERS = Symbol.for('delimiters') // delimiter strings of list/map

export type ExprBind = (
	| ExprSymbol
	| string
	| Record<string, ExprSymbol>
	| ExprBind
)[]

export enum ExpandType {
	Constant = 1,
	Env,
	Unchange,
}

export interface ExpandInfoConstant {
	type: ExpandType.Constant
	exp: Expr
}

export interface ExpandInfoEnv {
	type: ExpandType.Env
	exp: Expr
	env: Env
}

export interface ExpandInfoUnchange {
	type: ExpandType.Unchange
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

// Expand
function expandSymbolsInExpr(expr: Expr, env: Env): Expr {
	const type = getType(expr)
	switch (type) {
		case 'list':
		case 'vector': {
			let ret = (expr as Expr[]).map(val => expandSymbolsInExpr(val, env))
			if (type === 'list') {
				ret = createList(...ret)
			}
			return ret
		}
		case 'map': {
			const ret = {} as ExprMap
			Object.entries(expr as ExprMap).forEach(([key, val]) => {
				ret[key] = expandSymbolsInExpr(val, env)
			})
			return ret
		}
		case 'symbol':
			if (env.hasOwn(expr as ExprSymbol)) {
				return env.get(expr as ExprSymbol)
			} else {
				return expr
			}
		default:
			return expr
	}
}

export function expandExp(exp: Expr) {
	if (isList(exp) && M_EXPAND in exp && exp[M_EXPAND]) {
		const info = exp[M_EXPAND]
		switch (info.type) {
			case ExpandType.Constant:
				return info.exp
			case ExpandType.Env:
				return expandSymbolsInExpr(info.exp, info.env)
			case ExpandType.Unchange:
				return exp
		}
	} else {
		return getEvaluated(exp)
	}
}

export function getParent(expr: Expr) {
	if (isColl(expr)) {
		return expr[M_PARENT] ?? null
	}
	return null
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
			switch ((obj as string)[0]) {
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
			throw new Error(`Unknown type: ${_typeof}`)
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

export function getMeta(obj: Expr): Expr {
	if (obj instanceof Object) {
		return M_META in obj ? (obj as any)[M_META] : null
	} else {
		return null
	}
}

export function withMeta(a: Expr, m: Expr) {
	if (canAttachMeta(a)) {
		const c = cloneExpr(a) as ExprWithMeta
		c[M_META] = m
		return c
	} else {
		throw new GlispError('[with-meta] Object should not be atom')
	}
}

export function setMeta(a: Expr, m: Expr) {
	if (!(a instanceof Object)) {
		throw new GlispError('[with-meta] Object should not be atom')
	}
	;(a as any)[M_META] = m
	return a
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

export function cloneExpr(expr: Expr, deep = false): Expr {
	if (isList(expr)) {
		const children: Expr[] = deep
			? expr.map(e => cloneExpr(e as any, true))
			: expr
		const cloned = createList(...children)
		cloned[M_DELIMITERS] = getDelimiters(expr)
		cloned[M_ISSUGAR] = expr[M_ISSUGAR]
		return cloned
	} else if (isVector(expr)) {
		const children = deep ? expr.map(c => cloneExpr(c as any, true)) : expr
		const cloned = createVector(...children)
		cloned[M_DELIMITERS] = getDelimiters(expr)
		return cloned
	} else if (isMap(expr)) {
		const cloned = deep
			? {
					...expr,
					...(mapValues(expr, c => cloneExpr(c as any, true)) as ExprMap),
			  }
			: {...expr}
		cloned[M_DELIMITERS] = getDelimiters(expr)
		return cloned
	} else if (isFunc(expr)) {
		// new function instance
		const fn = function (this: ExprFnThis, ...args: ExprSeq) {
			return expr.apply(this, args)
		}
		// copy original properties
		return Object.assign(fn, expr)
	} else if (isSymbol(expr)) {
		return symbolFor(expr.value)
	} else {
		return expr
	}
}

export function getEvaluated(expr: Expr): Expr {
	if (isColl(expr) || isSymbol(expr)) {
		return expr[M_EVAL] ?? expr
	} else {
		return expr
	}
}

export function getName(exp: Expr): string {
	switch (getType(exp)) {
		case 'string':
			return exp as string
		case 'keyword':
			return (exp as string).slice(1)
		case 'symbol':
			return (exp as ExprSymbol).value
		default:
			throw new GlispError(
				'getName() can only extract the name by string/keyword/symbol'
			)
	}
}

// Functions

export function createExprFn(
	fn: (this: void | ExprFnThis, ...args: Expr[]) => Expr,
	exp: Expr,
	env: Env,
	params: ExprBind,
	meta = null,
	ismacro = false
): ExprFn {
	const attrs = {
		[M_AST]: exp,
		[M_ENV]: env,
		[M_PARAMS]: params,
		[M_META]: meta,
		[M_ISMACRO]: ismacro,
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

export const isSymbol = (obj: Expr | undefined): obj is ExprSymbol =>
	getType(obj) === 'symbol'

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

// General functions
export function malEquals(a: Expr, b: Expr) {
	const type = getType(a)
	const typeB = getType(b)

	if (type !== typeB) {
		return false
	}

	switch (type) {
		case 'list':
		case 'vector':
			if ((a as Expr[]).length !== (b as Expr[]).length) {
				return false
			}
			for (let i = 0; i < (a as Expr[]).length; i++) {
				if (!malEquals((a as Expr[])[i], (b as Expr[])[i])) {
					return false
				}
			}
			return true
		case 'map': {
			const keys = Object.keys(a as ExprMap)
			if (keys.length !== Object.keys(b as ExprMap).length) {
				return false
			}
			for (const key of keys) {
				if (!malEquals((a as ExprMap)[key], (b as ExprMap)[key])) {
					return false
				}
			}
			return true
		}
		case 'symbol':
			return (a as ExprSymbol).value === (b as ExprSymbol).value
		default:
			return a === b
	}
}
