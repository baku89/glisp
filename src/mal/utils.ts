import {
	MalVal,
	M_FN,
	isMap,
	MalFunc,
	keywordFor as K,
	MalMap,
	MalNode,
	isVector,
	MalJSFunc,
	M_EVAL,
	isSeq,
	keywordFor,
	getMeta,
	MalSeq,
	isMalFunc,
	getType,
	isSymbol,
	MalSymbol,
	symbolFor as S,
	createList as L,
	M_EVAL_PARAMS,
	isNode,
	M_OUTER,
	isList,
	M_OUTER_INDEX,
	MalType,
	isFunc,
	getEvaluated,
	isSymbolFor,
	cloneExp,
	MalError,
	M_KEYS,
	M_ELMSTRS
} from '@/mal/types'
import ConsoleScope from '@/scopes/console'
import {mat2d, vec2} from 'gl-matrix'
import {saveOuter} from './reader'

export function getPrimitiveType(exp: MalVal): string | null {
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
	return null
}

// Cached Tree-shaking
export function replaceExp(original: MalNode, replaced: MalVal) {
	const outer = original[M_OUTER]
	const index = original[M_OUTER_INDEX]

	if (index === undefined || !isNode(outer)) {
		throw new MalError('Cannot execute replaceExp')
	}

	// // Inherit delimiters if possible
	// if (isNode(original) && original[M_DELIMITERS] && isNode(replaced)) {
	// 	replaced[M_DELIMITERS] = []
	// 	console.log('sdfd', original, replaced)
	// 	if (isList(original) && isList(replaced)) {
	// 		for (let i = 0; i < replaced.length; i++) {
	// 			const oi = Math.min(i, original.length - 2)
	// 			replaced.push(original[M_DELIMITERS][oi])
	// 		}
	// 		replaced.push(original[M_DELIMITERS][original.length - 1])
	// 	}
	// }

	// Set as child
	if (isSeq(outer)) {
		outer[index] = replaced
	} else {
		// hash map
		const key = outer[M_KEYS][index]
		outer[key] = replaced
	}

	delete outer[M_ELMSTRS]

	// Set outer recursively
	saveOuter(replaced, outer, index)

	// Refresh M_ELMSTRS of ancestors
	let _outer = outer

	while (_outer) {
		delete _outer[M_ELMSTRS]

		// Go upward
		_outer = _outer[M_OUTER]
	}
}

export function getMapValue(
	exp: MalVal | undefined,
	path: string,
	type?: MalType
): MalVal {
	if (exp === undefined) {
		return null
	}

	const keys = path.split('/').map(k => (/^[0-9]+$/.test(k) ? parseInt(k) : k))

	while (keys.length > 0) {
		const key = keys[0]

		if (typeof key === 'number') {
			if (!isSeq(exp) || exp[key] === undefined) {
				return null
			}
			exp = exp[key]
		} else {
			// map key
			const kw = keywordFor(key)
			if (!isMap(exp) || !(kw in exp)) {
				return null
			}

			exp = exp[kw]
		}

		keys.shift()
	}

	// Type checking
	if (type && getType(exp) !== type) {
		return null
	}

	return exp
}

export interface FnInfoType {
	fn: MalFunc | MalJSFunc
	meta: MalMap | null
	aliasFor: string | null
	primitive: string | null
}

export function getFnInfo(exp: MalVal): FnInfoType | null {
	let fn = null
	if (isSeq(exp)) {
		fn = exp[M_FN]
	} else if (isFunc(exp)) {
		fn = exp
	}

	// Check if primitive type
	let primitive = null
	if (!fn && isNode(exp)) {
		primitive = getPrimitiveType(exp[M_EVAL] || exp)
		if (primitive) {
			fn = ConsoleScope.var(primitive) as MalFunc
		}
	}

	if (fn) {
		const meta = getMeta(fn)

		if (isMap(meta)) {
			const aliasFor = getMapValue(meta, 'alias-for')

			if (typeof aliasFor === 'string') {
				// is an alias
				return {
					fn,
					meta,
					aliasFor,
					primitive
				}
			} else {
				// is not an alias
				return {fn, meta, aliasFor: null, primitive}
			}
		} else {
			return {fn, meta: null, aliasFor: null, primitive}
		}
	}

	return null
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
				if (!isMalFunc(inverseFn)) break

				const fnName = (original as MalSeq)[0]
				const originalParams = (original as MalSeq).slice(1)
				const evaluatedParams = (original as MalSeq)[M_EVAL_PARAMS]

				// Compute the original parameter
				const result = inverseFn({
					[K('return')]: exp,
					[K('params')]: evaluatedParams
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

const K_TRANSFORM = K('transform')

export function computeExpTransform(exp: MalVal) {
	if (!isNode(exp)) {
		return mat2d.identity(mat2d.create())
	}

	// Collect ancestors
	let ancestors: MalNode[] = []
	for (let outer: MalNode = exp; outer; outer = outer[M_OUTER]) {
		ancestors.unshift(outer)
	}

	const attrMatrices: MalVal[] = []

	// If the exp is nested inside transform arguments
	for (let i = ancestors.length - 1; 0 < i; i--) {
		const node = ancestors[i]
		const outer = ancestors[i - 1]

		if (!isList(outer)) {
			continue
		}

		const isAttrOfG =
			isSymbolFor(outer[0], 'g') &&
			outer[1] === node &&
			isMap(node) &&
			K_TRANSFORM in node

		const isAttrOfTransform =
			isSymbolFor(outer[0], 'transform') && outer[1] === node
		const isAttrOfPathTransform =
			isSymbolFor(outer[0], 'path/transform') && outer[1] === node
		const isAttrOfArtboard =
			isSymbolFor(outer[0], 'artboard') && outer[1] === node

		if (
			isAttrOfG ||
			isAttrOfTransform ||
			isAttrOfPathTransform ||
			isAttrOfArtboard
		) {
			// Exclude attributes' part from ancestors
			const attrAncestors = ancestors.slice(i)
			ancestors = ancestors.slice(0, i - 1)

			// Calculate transform compensation inside attribute
			for (let j = attrAncestors.length - 1; 0 < j; j--) {
				const node = attrAncestors[j]
				const outer = attrAncestors[j - 1]

				if (isList(outer)) {
					if (isSymbolFor(outer[0], 'mat2d/*')) {
						// Prepend matrices
						const matrices = outer.slice(1, node[M_OUTER_INDEX])
						attrMatrices.unshift(...matrices)
					} else if (isSymbolFor(outer[0], 'pivot')) {
						// Prepend matrices
						const matrices = outer.slice(2, node[M_OUTER_INDEX])
						attrMatrices.unshift(...matrices)

						// Append pivot itself as translation matrix
						const pivot =
							isNode(outer[1]) && M_EVAL in outer[1]
								? (outer[1][M_EVAL] as vec2)
								: vec2.create()

						const pivotMat = mat2d.fromTranslation(mat2d.create(), pivot)

						attrMatrices.unshift(pivotMat as number[])
					}
				}
			}

			break
		}
	}

	// Extract the matrices from ancestors
	const matrices = ancestors.reduce((filtered, node) => {
		if (isList(node)) {
			if (
				isSymbolFor(node[0], 'g') &&
				isMap(node[1]) &&
				K_TRANSFORM in node[1]
			) {
				const matrix = node[1][K_TRANSFORM]
				filtered.push(matrix)
			} else if (isSymbolFor(node[0], 'artboard')) {
				const bounds = (node[1] as MalMap)[K('bounds')] as number[]
				const matrix = [1, 0, 0, 1, ...bounds.slice(0, 2)]
				filtered.push(matrix)
			} else if (
				isSymbolFor(node[0], 'transform') ||
				isSymbolFor(node[0], 'path/transform')
			) {
				const matrix = node[1]
				filtered.push(matrix)
			}
		}

		return filtered
	}, [] as MalVal[])

	// Append attribute matrices
	matrices.push(...attrMatrices)

	// Multiplies all matrices in order
	const ret = (matrices.map(xform => getEvaluated(xform)) as mat2d[]).reduce(
		(xform, elXform) => mat2d.multiply(xform, xform, elXform),
		mat2d.create()
	)

	return ret
}
