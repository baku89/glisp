import {mat2d} from 'linearly'

import {
	cloneExpr,
	createList as L,
	getMeta,
	getParent as getParent,
	getType,
	isFunc,
	isList,
	isMap,
	isColl,
	isSeq,
	isSymbol,
	isSymbolFor,
	isVector,
	keywordFor as K,
	keywordFor,
	M_DELIMITERS,
	ExprFn,
	ExprJSFn,
	ExprMap,
	ExprColl,
	ExprSeq,
	ExprSymbol,
	ExprType,
	Expr,
	symbolFor as S,
	getEvaluated,
} from '@/glisp/types'
import ConsoleScope from '@/scopes/console'

import {markParent} from './reader'
import printExpr, {generateDefaultDelimiters} from './printer'

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

type WatchOnReplacedCallback = (newExp: Expr) => any

const ExprWatchers = new WeakMap<ExprColl, Set<WatchOnReplacedCallback>>()

export function watchExpOnReplace(
	exp: ExprColl,
	callback: WatchOnReplacedCallback
) {
	const callbacks = ExprWatchers.get(exp) || new Set()
	callbacks.add(callback)
	ExprWatchers.set(exp, callbacks)
}

export function unwatchExpOnReplace(
	exp: ExprColl,
	callback: WatchOnReplacedCallback
) {
	const callbacks = ExprWatchers.get(exp)
	if (callbacks) {
		callbacks.delete(callback)
		if (callbacks.size === 0) {
			ExprWatchers.delete(exp)
		}
	}
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
}

/**
 * 置き換える。最終的にルートまで置き換える
 */
export function replaceExpr(original: ExprColl, replaced: Expr) {
	// Execute a callback if necessary
	ExprWatchers.get(original)?.forEach(cb => cb(replaced))
	ExprWatchers.delete(original)

	const parent = getParent(original)
	if (!parent) return

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
	markParent(newParent)

	replaceExpr(parent, newParent)
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
			const def = (original as ExprSymbol).def
			if (def && !isSymbol(exp)) {
				// NOTE: Making side-effects on the below line
				const newDefBody = reverseEval(exp, def[2], forceOverwrite)
				replaceExpr(def, L(S('defvar'), original, newDefBody))
				return cloneExpr(original)
			}
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
	if (!isList(exp)) {
		//throw new GlispError(`${printExp(exp)} is not a function application`)
		return undefined
	}

	const first = getEvaluated(exp[0])

	if (!isFunc(first)) {
		// throw new Error(`${printExp(exp[0])} is not a function`)
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
	const length = isSeq(exp) ? exp.length : Object.keys(exp).length * 2

	if (!exp[M_DELIMITERS]) {
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
