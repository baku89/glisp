import {mat2d} from 'linearly'
import {mapValues} from 'lodash'

import ConsoleScope from '@/scopes/console'

import {Env} from '.'
import {generateDefaultDelimiters, printExpr} from './print'
import {
	M_DELIMITERS,
	M_EVAL,
	M_EXPAND,
	M_ISSUGAR,
	M_META,
	M_PARENT,
} from './symbols'
import {
	canAttachMeta,
	createList,
	createList as L,
	createVector,
	Expr,
	ExprColl,
	ExprFn,
	ExprFnThis,
	ExprJSFn,
	ExprMap,
	ExprSeq,
	ExprSymbol,
	ExprType,
	ExprWithMeta,
	getType,
	GlispError,
	isColl,
	isFunc,
	isList,
	isMap,
	isSeq,
	isSymbol,
	isSymbolFor,
	isVector,
	keywordFor as K,
	keywordFor,
	symbolFor,
} from './types'

/**
 * [1 2], [:path :M [1 2]]のような特殊な形式を検出する
 */
export function getStructType(exp: Expr): StructTypes | undefined {
	if (isVector(exp)) {
		if (exp[0] === K('path')) {
			return 'path'
		}
		if (exp.length <= 6) {
			const isAllNumber =
				exp instanceof Float32Array || exp.every(v => typeof v === 'number')
			if (isAllNumber) {
				switch (exp.length) {
					case 2:
						return 'vec2'
					case 4:
						return 'rect2d'
					case 6:
						return 'mat2d'
				}
			}
		}
	}
	return
}

export function getExpByPath(root: ExprColl, path: string): Expr {
	const keys = path
		.split('/')
		.filter(k => k !== '')
		.map(k => parseInt(k))
	return find(root, keys)

	function find(exp: Expr, keys: number[]): Expr {
		const [index, ...rest] = keys

		if (keys.length === 0) {
			return exp
		}

		if (isSeq(exp)) {
			return find(exp[index], rest)
		} else if (isMap(exp)) {
			const keys = Object.keys(exp)
			return find(exp[keys[index]], rest)
		} else {
			return exp
		}
	}
}

export function generateExpAbsPath(expr: ExprColl) {
	let path = ''

	for (let i = 0; i < 1e6; i++) {
		const parent = getParent(expr)

		if (!parent) {
			return '/' + path
		}

		const index = findElementIndex(expr, parent)
		path = index + '/' + path
		expr = parent
	}

	throw new Error('Cannot find the root')
}

/**
 * 置き換える。再帰的にルートまで置き換える
 */
export function replaceExpr(
	root: ExprColl,
	parent: ExprColl,
	original: Expr,
	replaced: Expr
) {
	const index = findElementIndex(original, parent)
	const newParent = cloneExpr(parent) as ExprColl

	// Set replaced as new child
	if (isSeq(newParent)) {
		// Sequence
		newParent[index] = replaced
	} else {
		// Hash map
		const key = Object.keys(parent)[index]
		;(newParent as ExprMap)[key] = replaced
	}

	newParent[M_DELIMITERS] = parent[M_DELIMITERS]
	newParent[M_META] = parent[M_META]

	if (root === parent) {
		return newParent
	}

	const grandParent = getParent(parent)

	if (!grandParent) {
		throw new Error('Invalid form')
	}

	return replaceExpr(root, grandParent, parent, newParent)
}

export function deleteExp(exp: ExprColl) {
	const parent = getParent(exp)

	if (!parent) {
		return false
	}

	const newParent = cloneExpr(parent) as ExprColl
	const index = findElementIndex(exp, newParent)

	if (isSeq(newParent)) {
		newParent.splice(index, 1)
	} else {
		const key = Object.keys(newParent)[index]
		delete newParent[key]
	}

	copyDelimiters(newParent, parent)
	markParent(newParent)

	replaceExpr(parent, newParent)

	return true
}

export function getMapValue(
	exp: Expr | undefined,
	path: string,
	type?: ExprType,
	defaultValue?: Expr
): Expr {
	if (exp === undefined) {
		return defaultValue !== undefined ? defaultValue : null
	}

	const keys = path.split('/').map(k => (/^[0-9]+$/.test(k) ? parseInt(k) : k))

	while (keys.length > 0) {
		const key = keys[0]

		if (typeof key === 'number') {
			if (!isSeq(exp) || exp[key] === undefined) {
				return defaultValue !== undefined ? defaultValue : null
			}
			exp = exp[key]
		} else {
			// map key
			const kw = keywordFor(key)
			if (!isMap(exp) || !(kw in exp)) {
				return defaultValue !== undefined ? defaultValue : null
			}

			exp = exp[kw]
		}

		keys.shift()
	}

	// Type checking
	if (type && getType(exp) !== type) {
		return defaultValue !== undefined ? defaultValue : null
	}

	return exp
}

/**
 * 特殊な型
 */
type StructTypes = 'vec2' | 'rect2d' | 'mat2d' | 'path'

export interface FnInfoType {
	fn: ExprFn | ExprJSFn
	meta?: Expr
	aliasFor?: string
	structType?: StructTypes
}

export function getFnInfo(exp: Expr): FnInfoType | undefined {
	let fn = isFunc(exp) ? exp : getFn(exp)

	let meta = undefined
	let aliasFor = undefined
	let structType: StructTypes | undefined

	// Check if the exp is struct
	if (!fn) {
		structType = getStructType(getEvaluated(exp))
		if (structType) {
			fn = ConsoleScope.var(structType) as ExprFn
		}
	}

	if (!fn) {
		return undefined
	}

	meta = getMeta(fn)

	if (isMap(meta)) {
		aliasFor = getMapValue(meta, 'alias-for', 'string') as string
	}

	return {fn, meta, aliasFor, structType}
}

export function reverseEval(exp: Expr, original: Expr, forceOverwrite = false) {
	// const meta = getMeta(original)

	switch (getType(original)) {
		case 'list': {
			// Check if the list is wrapped within const
			if (isSymbolFor((original as ExprSeq)[0], 'const')) {
				return original
			} else {
				// find Inverse function
				const info = getFnInfo(original as ExprSeq)
				if (!info) break
				const inverseFn = getMapValue(info.meta, 'inverse')
				if (!isFunc(inverseFn)) break

				const fnName = (original as ExprSeq)[0]
				const originalParams = (original as ExprSeq).slice(1)
				const evaluatedParams = originalParams.map(e => getEvaluated(e))

				// Compute the original parameter
				const result = inverseFn({
					[K('return')]: exp,
					[K('params')]: evaluatedParams,
				} as ExprMap)

				if (!isVector(result) && !isMap(result)) {
					return null
				}

				// Parse the result
				let newParams: Expr[]
				let updatedIndices: number[] | undefined = undefined

				if (isMap(result)) {
					const params = result[K('params')]
					const replace = result[K('replace')]

					if (isVector(params)) {
						newParams = params
					} else if (isVector(replace)) {
						newParams = [...originalParams]
						const pairs = (
							typeof replace[0] === 'number'
								? [replace as any as [number, Expr]]
								: (replace as any as [number, Expr][])
						).map(
							([si, e]) =>
								[si < 0 ? newParams.length + si : si, e] as [number, Expr]
						)
						for (const [i, value] of pairs) {
							newParams[i] = value
						}
						updatedIndices = pairs.map(([i]) => i)
					} else {
						return null
					}
				} else {
					newParams = result
				}

				if (!updatedIndices) {
					updatedIndices = Array(newParams.length)
						.fill(0)
						.map((_, i) => i)
				}

				for (const i of updatedIndices) {
					newParams[i] = reverseEval(
						newParams[i],
						originalParams[i],
						forceOverwrite
					)
				}

				const newExp = L(fnName, ...newParams)

				return newExp
			}
			break
		}
		case 'vector': {
			if (isVector(exp) && exp.length === (original as ExprSeq).length) {
				const newExp = exp.map((e, i) =>
					reverseEval(e, (original as ExprSeq)[i], forceOverwrite)
				) as Expr[]
				return newExp
			}
			break
		}
		case 'map': {
			if (isMap(exp)) {
				const newExp = {...exp} as ExprMap

				Object.entries(original as ExprMap).forEach(([key, value]) => {
					if (key in exp) {
						newExp[key] = reverseEval(exp[key], value, forceOverwrite)
					} else {
						newExp[key] = value
					}
				})

				return newExp
			}
			break
		}
		case 'symbol': {
			// const def = (original as ExprSymbol).def
			// if (def && !isSymbol(exp)) {
			// 	// NOTE: Making side-effects on the below line
			// 	const newDefBody = reverseEval(exp, def[2], forceOverwrite)
			// 	replaceExpr(def, L(S('defvar'), original, newDefBody))
			// 	return cloneExpr(original)
			// }
			break
		}
		case 'number':
		case 'string':
		case 'keyword':
		case 'boolean':
			return exp
	}

	return forceOverwrite ? exp : original
}

export function computeExpTransform(exp: Expr): mat2d {
	if (!isColl(exp)) {
		return mat2d.ident
	}

	// Collect ancestors with index
	const ancestors: [expr: ExprColl, index: number][] = []

	let outer = getParent(exp)
	while (outer) {
		ancestors.unshift([outer, findElementIndex(exp, outer)])
		outer = getParent(outer)
	}

	let xform = mat2d.ident

	for (const [node, index] of ancestors) {
		if (!isList(node)) {
			continue
		}

		const meta = getMeta(getEvaluated(node[0]))
		const viewportFn = getMapValue(meta, 'viewport-transform')

		if (!isFunc(viewportFn)) {
			continue
		}

		// Execute the viewport transform function

		const evaluatedParams = node.slice(1).map(x => getEvaluated(x))
		const paramXforms = viewportFn(...evaluatedParams) as Expr

		if (!isVector(paramXforms) || !paramXforms[index - 1]) {
			continue
		}

		xform = mat2d.mul(xform, paramXforms[index - 1] as unknown as mat2d)
	}

	return xform
}

const K_PARAMS = K('params')
const K_REPLACE = K('replace')

export function applyParamModifier(modifier: Expr, originalParams: Expr[]) {
	if (!isVector(modifier) && !isMap(modifier)) {
		return null
	}

	// Parse the modifier
	let newParams: Expr[]
	let updatedIndices: number[] | undefined = undefined

	if (isMap(modifier)) {
		const params = modifier[K_PARAMS]
		const replace = modifier[K_REPLACE]

		if (isVector(params)) {
			newParams = [...params]
		} else if (isVector(replace)) {
			newParams = [...originalParams]
			const pairs = (
				typeof replace[0] === 'number'
					? [replace as any as [number, Expr]]
					: (replace as any as [number, Expr][])
			).map(
				([si, e]) => [si < 0 ? newParams.length + si : si, e] as [number, Expr]
			)
			for (const [i, value] of pairs) {
				newParams[i] = value
			}
			updatedIndices = pairs.map(([i]) => i)
		} else {
			return null
		}

		// if (isVector(changeId)) {
		// 	const newId = newParams[1]
		// 	data.draggingIndex = data.handles.findIndex(h => h.id === newId)
		// }
	} else {
		newParams = modifier
	}

	if (!updatedIndices) {
		updatedIndices = Array(newParams.length)
			.fill(0)
			.map((_, i) => i)
	}

	// Execute the backward evaluation
	for (const i of updatedIndices) {
		let newValue = newParams[i]
		const unevaluated = originalParams[i]

		// if (malEquals(newValue, this.params[i])) {
		// 	newValue = unevaluated
		// }

		newValue = reverseEval(newValue, unevaluated)
		newParams[i] = newValue
	}

	return newParams
}

export function getFn(exp: Expr) {
	if (!isList(exp) || exp.length === 0) {
		//throw new GlispError(`${printExpr(exp)} is not a function application`)
		return undefined
	}

	const first = getEvaluated(exp[0])

	if (!isFunc(first)) {
		// throw new Error(`${printExpr(exp[0])} is not a function`)
		return undefined
	}

	return first
}

export function copyDelimiters(target: Expr, original: Expr) {
	if (isSeq(target) && isSeq(original) && original[M_DELIMITERS]) {
		const delimiters = [...original[M_DELIMITERS]]

		const lengthDiff = target.length - original.length

		if (lengthDiff < 0) {
			if (original.length === 1) {
				delimiters.pop()
			} else {
				delimiters.splice(delimiters.length - 1 + lengthDiff, -lengthDiff)
			}
		} else if (lengthDiff > 0) {
			if (original.length === 0) {
				delimiters.push('')
			} else {
				const filler = delimiters[delimiters.length - 2] || ' '
				const newDelimiters = Array(lengthDiff).fill(filler)
				delimiters.splice(delimiters.length - 1, 0, ...newDelimiters)
			}
		}

		target[M_DELIMITERS] = delimiters
	}
}

export function getDelimiters(exp: ExprSeq | ExprMap): string[] {
	if (!exp[M_DELIMITERS]) {
		const length = isSeq(exp) ? exp.length : Object.keys(exp).length * 2
		exp[M_DELIMITERS] = generateDefaultDelimiters(length)
	}

	return exp[M_DELIMITERS]
}

export function getElementStrs(expr: ExprSeq | ExprMap): string[] {
	if (isSeq(expr)) {
		return expr.map(printExpr)
	} else {
		return Object.entries(expr).flat().map(printExpr)
	}
}

export function insertDelimiters(
	elements: readonly string[],
	delimiters: readonly string[]
) {
	if (elements.length + 1 !== delimiters.length) {
		throw new Error(
			'Invalid length of delimiters. elements=' +
				JSON.stringify(elements) +
				' delimiters=' +
				JSON.stringify(delimiters)
		)
	}

	let str = delimiters[0]

	for (let i = 0; i < elements.length; i++) {
		str += elements[i] + delimiters[i + 1]
	}

	return str
}

export function findElementIndex(expr: Expr, parent: ExprColl) {
	const children = isSeq(parent) ? parent : Object.values(parent)

	const index = children.findIndex(e => e === expr)

	if (index === -1) {
		throw new Error('Cannot find the element in the parent')
	}

	return index
}

export function markParent(exp: Expr) {
	if (!isColl(exp)) {
		return
	}

	const children = isSeq(exp) ? exp : Object.values(exp)

	for (const child of children) {
		if (isColl(child)) {
			child[M_PARENT] = exp
		}
		markParent(child)
	}
}

export function convertJSObjectToExprMap(obj: any): Expr {
	if (Array.isArray(obj)) {
		return obj.map(v => convertJSObjectToExprMap(v))
	} else if (isMap(obj)) {
		const ret = {} as ExprMap
		for (const [key, value] of Object.entries(obj)) {
			ret[keywordFor(key)] = convertJSObjectToExprMap(value)
		}
		return ret
	} else if (isSymbol(obj) || obj instanceof Function) {
		return obj
	} else {
		return obj
	}
}

export function convertExprCollToJSObject(exp: Expr): any {
	if (isMap(exp)) {
		const ret: {[Key: string]: Expr} = {}
		for (const [key, value] of Object.entries(exp)) {
			const jsKey = getName(key)
			ret[jsKey] = convertExprCollToJSObject(value)
		}
		return ret
	} else if (isSeq(exp)) {
		return (exp as Expr[]).map(e => convertExprCollToJSObject(e))
	} else {
		return exp
	}
}
export function findExpByRange(
	expr: Expr,
	start: number,
	end: number
): ExprColl | null {
	if (!isColl(expr)) {
		// If Atom
		return null
	}

	// Creates a caches of children at the same time calculating length of exp
	const expLen = printExpr(expr).length

	if (!(0 <= start && end <= expLen)) {
		// Does not fit within the exp
		return null
	}

	if (isSeq(expr)) {
		// Sequential

		// Add the length of open-paren
		let offset = isList(expr) && expr[M_ISSUGAR] ? 0 : 1
		const delimiters = getDelimiters(expr)
		const elmStrs = getElementStrs(expr)

		// Search Children
		for (let i = 0; i < expr.length; i++) {
			const child = expr[i]
			offset += delimiters[i].length

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			// For #() syntaxtic sugar
			if (i < elmStrs.length) {
				offset += elmStrs[i].length
			}
		}
	} else if (isMap(expr)) {
		// Hash Map

		let offset = 1 // length of '{'

		const keys = Object.keys(expr)
		const delimiters = getDelimiters(expr)
		const elmStrs = getElementStrs(expr)

		// Search Children
		for (let i = 0; i < keys.length; i++) {
			const child = expr[keys[i]]

			// Offsets
			offset +=
				delimiters[i * 2].length + // delimiter before key
				elmStrs[i * 2].length + // key
				delimiters[i * 2 + 1].length // delimiter between key and value

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			offset += elmStrs[i * 2 + 1].length
		}
	}

	return expr
}

export function getRangeOfExpr(
	expr: ExprColl,
	root: ExprColl
): [begin: number, end: number] | null {
	let start = 0
	const length = printExpr(expr).length

	if (expr === root) {
		return [0, length]
	}

	for (let i = 0; i < 1e6; i++) {
		const parent = getParent(expr)

		if (!parent) {
			console.warn('root is not a parent')
			return null
		}

		const delimiters = getDelimiters(parent)
		const elmStrs = getElementStrs(parent)
		const index = findElementIndex(expr, parent)

		if (isSeq(parent)) {
			start += isList(parent) && parent[M_ISSUGAR] ? 0 : '('.length
			start += delimiters.slice(0, index + 1).join('').length
			start += elmStrs.slice(0, index).join('').length
		} else if (isMap(parent)) {
			start +=
				'{'.length +
				delimiters.slice(0, (index + 1) * 2).join('').length +
				elmStrs.slice(0, index * 2 + 1).join('').length
		}

		if (parent === root) {
			break
		}

		expr = parent
	}

	return [start, start + length]
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

export function getParent(expr: Expr) {
	if (isColl(expr)) {
		return expr[M_PARENT] ?? null
	}
	return null
}

export function expandExp(exp: Expr) {
	if (isList(exp) && M_EXPAND in exp && exp[M_EXPAND]) {
		const info = exp[M_EXPAND]
		switch (info.type) {
			case 'constant':
				return info.exp
			case 'env':
				return expandSymbolsInExpr(info.exp, info.env)
			case 'unchange':
				return exp
		}
	} else {
		return getEvaluated(exp)
	}
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

export function equals(a: Expr, b: Expr) {
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
				if (!equals((a as Expr[])[i], (b as Expr[])[i])) {
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
				if (!equals((a as ExprMap)[key], (b as ExprMap)[key])) {
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
