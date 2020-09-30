import {
	MalVal,
	MalFunc,
	MalKeyword,
	MalMap,
	MalColl,
	MalVector,
	isMalSeq,
	MalSeq,
	MalSymbol,
	MalList,
	isMalColl,
	MalType,
	MalNumber,
} from '@/mal/types'
import ConsoleScope from '@/scopes/console'
import {mat2d} from 'gl-matrix'
import {reconstructTree} from './reader'

export function isUIAnnotation(exp: MalVal | undefined): exp is MalList {
	return MalList.is(exp) && MalSymbol.isFor(exp.value[0], 'ui-annotate')
}

export function getStructType(exp: MalVal): StructTypes | undefined {
	if (MalVector.is(exp)) {
		if (exp.value[0] === MalKeyword.create('path')) {
			return 'path'
		}
		if (exp.length <= 6) {
			const isAllNumber =
				exp instanceof Float32Array || exp.value.every(MalNumber.is)
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

const ExpWatcher = new WeakMap<MalColl, Set<WatchOnReplacedCallback>>()

export function watchExpOnReplace(
	exp: MalColl,
	callback: WatchOnReplacedCallback
) {
	const callbacks = ExpWatcher.get(exp) || new Set()
	callbacks.add(callback)
	ExpWatcher.set(exp, callbacks)
}

export function unwatchExpOnReplace(
	exp: MalColl,
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

export function getExpByPath(root: MalColl, path: string): MalVal {
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

		if (isMalSeq(expBody)) {
			return find(expBody[index], rest)
		} else if (MalMap.is(expBody)) {
			const keys = Object.keys(expBody as MalCollMap)
			return find(expBody[keys[index]], rest)
		} else {
			return expBody
		}
	}
}

export function generateExpAbsPath(exp: MalColl) {
	return seek(exp, '')

	function seek(exp: MalColl, path: string): string {
		const outer = exp.parent
		if (outer) {
			if (isUIAnnotation(outer)) {
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
): [MalColl | null, number] {
	if (!isMalColl(_exp)) {
		return [null, -1]
	}

	let exp = _exp

	let outer = exp.parent

	if (isUIAnnotation(outer)) {
		exp = outer
		outer = exp.parent
	}

	return outer ? [outer, exp[M_OUTER_INDEX]] : [null, -1]
}

/**
 * Cached Tree-shaking
 */
export function replaceExp(original: MalColl, replaced: MalVal) {
	// Execute a callback if necessary
	if (ExpWatcher.has(original)) {
		const callbacks = ExpWatcher.get(original) as Set<WatchOnReplacedCallback>
		ExpWatcher.delete(original)
		for (const cb of callbacks) {
			cb(replaced)
		}
	}

	const outer = original.parent
	const index = original[M_OUTER_INDEX]

	if (index === undefined || !isMalColl(outer)) {
		// Is the root exp
		return
	}

	const newOuter = outer.clone()

	// Set replaced as new child
	if (isMalSeq(newOuter)) {
		// Sequence
		newOuter[index] = replaced
		for (let i = 0; i < newOuter.length; i++) {
			if (isMalColl(newOuter[i])) {
				;(newOuter[i] as MalColl)[M_OUTER] = newOuter
				;(newOuter[i] as MalColl)[M_OUTER_INDEX] = i
			}
		}
	} else {
		// Hash map
		const keys = Object.keys(outer as MalCollMap)
		const key = keys[index]
		newOuter[key] = replaced
		for (let i = 0; i < keys.length; i++) {
			if (isMalColl(newOuter[i])) {
				;(newOuter[i] as MalColl)[M_OUTER] = newOuter
				;(newOuter[i] as MalColl)[M_OUTER_INDEX] = i
			}
		}
	}

	newOuter.delimiters = oute.delimiters

	replaceExp(outer, newOuter)
}

export function getUIAnnotationExp(exp: MalColl) {
	const outer = exp.parent
	return isUIAnnotation(outer) ? outer : exp
}

export function getUIBodyExp(exp: MalVal) {
	return isUIAnnotation(exp) ? exp[2] : exp
}

export function deleteExp(exp: MalColl) {
	const outer = exp[M_OUTER]
	const index = exp[M_OUTER_INDEX]

	if (!outer) {
		return false
	}

	const newOuter = outer.clone()

	if (isMalSeq(newOuter)) {
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
			if (!isMalSeq(exp) || exp[key] === undefined) {
				return defaultValue !== undefined ? defaultValue : null
			}
			exp = exp[key]
		} else {
			// map key
			const kw = keywordFor(key)
			if (!MalMap.is(exp) || !(kw in exp)) {
				return defaultValue !== undefined ? defaultValue : null
			}

			exp = exp[kw]
		}

		keys.shift()
	}

	// Type checking
	if (type && exp.type !== type) {
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

	if (MalMap.is(meta)) {
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

	switch (original.type) {
		case MalType.List: {
			// Check if the list is wrapped within const
			if (MalSymbol.isFor((original as MalSeq)[0], 'const')) {
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
				const result = inverseFn(
					MalMap.create({
						return: exp,
						params: evaluatedParams,
					})
				)

				if (!MalVector.is(result) && !MalMap.is(result)) {
					return null
				}

				// Parse the result
				let newParams: MalVal[]
				let updatedIndices: number[] | undefined = undefined

				if (MalMap.is(result)) {
					const params = result[MalKeyword.create('params')]
					const replace = result[MalKeyword.create('replace')]

					if (MalVector.is(params)) {
						newParams = params
					} else if (MalVector.is(replace)) {
						newParams = [...originalParams]
						const pairs = (typeof replace[0] === 'number'
							? [(replace as any) as [number, MalVal]]
							: ((replace as any) as [number, MalVal][])
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
			if (MalVector.is(exp) && exp.length === (original as MalSeq).length) {
				const newExp = exp.map((e, i) =>
					reverseEval(e, (original as MalSeq)[i], forceOverwrite)
				) as MalVal[]
				return newExp
			}
			break
		}
		case MalType.Map: {
			if (MalMap.is(exp)) {
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
			if (def && !MalSymbol.is(exp)) {
				// NOTE: Making side-effects on the below line
				const newDefBody = reverseEval(exp, def[2], forceOverwrite)
				replaceExp(
					def,
					MalList.create(MalSymbol.create('defvar'), original, newDefBody)
				)
				return original.clone()
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
	if (!isMalColl(exp)) {
		return mat2d.create()
	}

	// Collect ancestors with index
	const ancestors: [MalColl, number][] = []
	for (let _exp: MalColl = exp; _exp[M_OUTER]; _exp = _exp[M_OUTER]) {
		ancestors.unshift([_exp[M_OUTER], _exp[M_OUTER_INDEX]])
	}

	const xform = mat2d.create()

	for (const [node, index] of ancestors) {
		if (!MalList.is(node)) {
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

		if (!MalVector.is(paramXforms) || !paramXforms[index - 1]) {
			continue
		}

		mat2d.mul(xform, xform, paramXforms[index - 1] as mat2d)
	}

	return xform
}

const K_PARAMS = MalKeyword.create('params')
const K_REPLACE = MalKeyword.create('replace')

export function applyParamModifier(modifier: MalVal, originalParams: MalVal[]) {
	if (!MalVector.is(modifier) && !MalMap.is(modifier)) {
		return null
	}

	// Parse the modifier
	let newParams: MalVal[]
	let updatedIndices: number[] | undefined = undefined

	if (MalMap.is(modifier)) {
		const params = modifier[K_PARAMS]
		const replace = modifier[K_REPLACE]

		if (MalVector.is(params)) {
			newParams = [...params]
		} else if (MalVector.is(replace)) {
			newParams = [...originalParams]
			const pairs = (typeof replace[0] === 'number'
				? [(replace as any) as [number, MalVal]]
				: ((replace as any) as [number, MalVal][])
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

		// if (MalVector.is(changeId)) {
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
	if (!MalList.is(exp)) {
		return undefined
	}

	const fn = exp.fn

	if (!MalFunc.is(fn)) {
		return undefined
	}

	return fn
}

export function copyDelimiters(target: MalVal, original: MalVal) {
	if (isMalSeq(target) && isMalSeq(original) && M_DELIMITERS in original) {
		const delimiters = [...original.delimiters]

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

		target.delimiters = delimiters
	}
}
