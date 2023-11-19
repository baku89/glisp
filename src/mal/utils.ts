import {
	MalVal,
	isMap,
	MalFunc,
	keywordFor as K,
	MalMap,
	MalNode,
	isVector,
	MalJSFunc,
	isSeq,
	keywordFor,
	getMeta,
	MalSeq,
	getType,
	isSymbol,
	MalSymbol,
	symbolFor as S,
	createList as L,
	isNode,
	M_OUTER,
	isList,
	M_OUTER_INDEX,
	MalType,
	isFunc,
	getEvaluated,
	isSymbolFor,
	cloneExp,
	MalNodeMap,
	M_DELIMITERS,
	getOuter,
} from '@/mal/types'
import ConsoleScope from '@/scopes/console'
import {mat2d} from 'gl-matrix'
import {reconstructTree} from './reader'

export function getStructType(exp: MalVal): StructTypes | undefined {
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
	return undefined
}

type WatchOnReplacedCallback = (newExp: MalVal) => any

const ExpWatcher = new WeakMap<MalNode, Set<WatchOnReplacedCallback>>()

export function watchExpOnReplace(
	exp: MalNode,
	callback: WatchOnReplacedCallback
) {
	const callbacks = ExpWatcher.get(exp) || new Set()
	callbacks.add(callback)
	ExpWatcher.set(exp, callbacks)
}

export function unwatchExpOnReplace(
	exp: MalNode,
	callback: WatchOnReplacedCallback
) {
	const callbacks = ExpWatcher.get(exp)
	if (callbacks) {
		callbacks.delete(callback)
		if (callbacks.size === 0) {
			ExpWatcher.delete(exp)
		}
	}
}

export function getExpByPath(root: MalNode, path: string): MalVal {
	const keys = path
		.split('/')
		.filter(k => k !== '')
		.map(k => parseInt(k))
	return find(root, keys)

	function find(exp: MalVal, keys: number[]): MalVal {
		const [index, ...rest] = keys

		const expBody = getUIBodyExp(exp)

		if (keys.length === 0) {
			return expBody
		}

		if (isSeq(expBody)) {
			return find(expBody[index], rest)
		} else if (isMap(expBody)) {
			const keys = Object.keys(expBody as MalNodeMap)
			return find(expBody[keys[index]], rest)
		} else {
			return expBody
		}
	}
}

export function generateExpAbsPath(exp: MalNode) {
	return seek(exp, '')

	function seek(exp: MalNode, path: string): string {
		const outer = getOuter(exp)
		if (outer) {
			if (isList(outer) && isSymbolFor(outer[0], 'ui-annotate')) {
				return seek(outer, path)
			} else {
				const index = exp[M_OUTER_INDEX]
				return seek(outer, index + '/' + path)
			}
		} else {
			return '/' + path
		}
	}
}

export function getUIOuterInfo(
	_exp: MalVal | undefined
): [MalNode | null, number] {
	if (!isNode(_exp)) {
		return [null, -1]
	}

	let exp = _exp

	let outer = getOuter(exp)

	if (isList(outer) && isSymbolFor(outer[0], 'ui-annotate')) {
		exp = outer
		outer = getOuter(exp)
	}

	return outer ? [outer, exp[M_OUTER_INDEX]] : [null, -1]
}

/**
 * Cached Tree-shaking
 */
export function replaceExp(original: MalNode, replaced: MalVal) {
	// Execute a callback if necessary
	if (ExpWatcher.has(original)) {
		const callbacks = ExpWatcher.get(original) as Set<WatchOnReplacedCallback>
		ExpWatcher.delete(original)
		for (const cb of callbacks) {
			cb(replaced)
		}
	}

	const outer = original[M_OUTER]
	const index = original[M_OUTER_INDEX]

	if (index === undefined || !isNode(outer)) {
		// Is the root exp
		return
	}

	const newOuter = cloneExp(outer)

	// Set replaced as new child
	if (isSeq(newOuter)) {
		// Sequence
		newOuter[index] = replaced
		for (let i = 0; i < newOuter.length; i++) {
			if (isNode(newOuter[i])) {
				;(newOuter[i] as MalNode)[M_OUTER] = newOuter
				;(newOuter[i] as MalNode)[M_OUTER_INDEX] = i
			}
		}
	} else {
		// Hash map
		const keys = Object.keys(outer as MalNodeMap)
		const key = keys[index]
		newOuter[key] = replaced
		for (let i = 0; i < keys.length; i++) {
			if (isNode(newOuter[i])) {
				;(newOuter[i] as MalNode)[M_OUTER] = newOuter
				;(newOuter[i] as MalNode)[M_OUTER_INDEX] = i
			}
		}
	}

	newOuter[M_DELIMITERS] = outer[M_DELIMITERS]

	replaceExp(outer, newOuter)
}

export function getUIAnnotationExp(exp: MalNode) {
	const outer = getOuter(exp)
	return isList(outer) && isSymbolFor(outer[0], 'ui-annotate') ? outer : exp
}

export function getUIBodyExp(exp: MalVal) {
	return isList(exp) && isSymbolFor(exp[0], 'ui-annotate') ? exp[2] : exp
}

export function deleteExp(exp: MalNode) {
	const outer = exp[M_OUTER]
	const index = exp[M_OUTER_INDEX]

	if (!outer) {
		return false
	}

	const newOuter = cloneExp(outer)

	if (isSeq(newOuter)) {
		newOuter.splice(index, 1)
	} else {
		const key = Object.keys(newOuter)[index]
		delete newOuter[key]
	}

	copyDelimiters(newOuter, outer)
	reconstructTree(newOuter)

	replaceExp(outer, newOuter)

	return true
}

export function getMapValue(
	exp: MalVal | undefined,
	path: string,
	type?: MalType,
	defaultValue?: MalVal
): MalVal {
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

type StructTypes = 'vec2' | 'rect2d' | 'mat2d' | 'path'

export interface FnInfoType {
	fn: MalFunc | MalJSFunc
	meta?: MalVal
	aliasFor?: string
	structType?: StructTypes
}

export function getFnInfo(exp: MalVal): FnInfoType | undefined {
	let fn = isFunc(exp) ? exp : getFn(exp)

	let meta = undefined
	let aliasFor = undefined
	let structType: StructTypes | undefined = undefined

	// Check if the exp is struct
	if (!fn) {
		structType = getStructType(getEvaluated(exp))
		if (structType) {
			fn = ConsoleScope.var(structType) as MalFunc
		}
	}

	if (!fn) {
		return undefined
	}

	meta = getMeta(fn)

	if (isMap(meta)) {
		aliasFor = getMapValue(meta, 'alias-for', MalType.String) as string
	}

	return {fn, meta, aliasFor, structType}
}

export function reverseEval(
	exp: MalVal,
	original: MalVal,
	forceOverwrite = false
) {
	// const meta = getMeta(original)

	switch (getType(original)) {
		case MalType.List: {
			// Check if the list is wrapped within const
			if (isSymbolFor((original as MalSeq)[0], 'const')) {
				return original
			} else {
				// find Inverse function
				const info = getFnInfo(original as MalSeq)
				if (!info) break
				const inverseFn = getMapValue(info.meta, 'inverse')
				if (!isFunc(inverseFn)) break

				const fnName = (original as MalSeq)[0]
				const originalParams = (original as MalSeq).slice(1)
				const evaluatedParams = originalParams.map(e => getEvaluated(e))

				// Compute the original parameter
				const result = inverseFn({
					[K('return')]: exp,
					[K('params')]: evaluatedParams,
				})

				if (!isVector(result) && !isMap(result)) {
					return null
				}

				// Parse the result
				let newParams: MalVal[]
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
								? [replace as any as [number, MalVal]]
								: (replace as any as [number, MalVal][])
						).map(
							([si, e]) =>
								[si < 0 ? newParams.length + si : si, e] as [number, MalVal]
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
		case MalType.Vector: {
			if (isVector(exp) && exp.length === (original as MalSeq).length) {
				const newExp = exp.map((e, i) =>
					reverseEval(e, (original as MalSeq)[i], forceOverwrite)
				) as MalVal[]
				return newExp
			}
			break
		}
		case MalType.Map: {
			if (isMap(exp)) {
				const newExp = {...exp} as MalMap

				Object.entries(original as MalMap).forEach(([key, value]) => {
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
		case MalType.Symbol: {
			const def = (original as MalSymbol).def
			if (def && !isSymbol(exp)) {
				// NOTE: Making side-effects on the below line
				const newDefBody = reverseEval(exp, def[2], forceOverwrite)
				replaceExp(def, L(S('defvar'), original, newDefBody))
				return cloneExp(original)
			}
			break
		}
		case MalType.Number:
		case MalType.String:
		case MalType.Keyword:
		case MalType.Boolean:
			return exp
	}

	return forceOverwrite ? exp : original
}

export function computeExpTransform(exp: MalVal): mat2d {
	if (!isNode(exp)) {
		return mat2d.create()
	}

	// Collect ancestors with index
	const ancestors: [MalNode, number][] = []
	for (let _exp: MalNode = exp; _exp[M_OUTER]; _exp = _exp[M_OUTER]) {
		ancestors.unshift([_exp[M_OUTER], _exp[M_OUTER_INDEX]])
	}

	const xform = mat2d.create()

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
		const paramXforms = viewportFn(...evaluatedParams) as MalVal

		if (!isVector(paramXforms) || !paramXforms[index - 1]) {
			continue
		}

		mat2d.mul(xform, xform, paramXforms[index - 1] as mat2d)
	}

	return xform
}

const K_PARAMS = K('params')
const K_REPLACE = K('replace')

export function applyParamModifier(modifier: MalVal, originalParams: MalVal[]) {
	if (!isVector(modifier) && !isMap(modifier)) {
		return null
	}

	// Parse the modifier
	let newParams: MalVal[]
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
					? [replace as any as [number, MalVal]]
					: (replace as any as [number, MalVal][])
			).map(
				([si, e]) =>
					[si < 0 ? newParams.length + si : si, e] as [number, MalVal]
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

export function getFn(exp: MalVal) {
	if (!isList(exp)) {
		//throw new MalError(`${printExp(exp)} is not a function application`)
		return undefined
	}

	const first = getEvaluated(exp[0])

	if (!isFunc(first)) {
		// throw new Error(`${printExp(exp[0])} is not a function`)
		return undefined
	}

	return first
}

export function copyDelimiters(target: MalVal, original: MalVal) {
	if (isSeq(target) && isSeq(original) && M_DELIMITERS in original) {
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
