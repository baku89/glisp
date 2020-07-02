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
	MalNodeSeq,
	isMalFunc,
	getType,
	isSymbol,
	MalSymbol,
	symbolFor as S,
	createList as L,
	M_EVAL_PARAMS,
	isMalNode,
	M_OUTER,
	isList,
	M_OUTER_INDEX,
	MalType,
	isFunc,
	getEvaluated
} from '@/mal/types'
import ConsoleScope from './scopes/console'
import {replaceExp} from './mal/eval'
import {mat2d, vec2} from 'gl-matrix'

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
	if (!fn && isMalNode(exp)) {
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
			if ((original as MalNodeSeq)[0] === S('const')) {
				return original
			} else {
				// find Inverse function
				const info = getFnInfo(original as MalNodeSeq)
				if (info) {
					const inverseFn = getMapValue(info.meta, 'inverse')

					if (isMalFunc(inverseFn)) {
						const fnName = (original as MalNodeSeq)[0]
						// const fnOriginalParams = (original as MalNodeSeq).slice(1)
						const fnEvaluatedParams = (original as MalNodeSeq)[M_EVAL_PARAMS]
						const fnParams = inverseFn(exp, fnEvaluatedParams)

						if (isSeq(fnParams)) {
							const newExp = L(fnName, ...fnParams)

							for (let i = 1; i < (original as MalNodeSeq).length; i++) {
								newExp[i] = reverseEval(
									newExp[i],
									(original as MalNodeSeq)[i],
									forceOverwrite
								)
							}
							return newExp
						}
					}
				}
			}
			break
		}
		case MalType.Vector: {
			if (isVector(exp) && exp.length === (original as MalNodeSeq).length) {
				const newExp = exp.map((e, i) =>
					reverseEval(e, (original as MalNodeSeq)[i], forceOverwrite)
				) as MalVal[]
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
				return original
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
	if (!isMalNode(exp)) {
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
			outer[0] === S('g') &&
			outer[1] === node &&
			isMap(node) &&
			K_TRANSFORM in node

		const isAttrOfTransform = outer[0] === S('transform') && outer[1] === node
		const isAttrOfPathTransform =
			outer[0] === S('path/transform') && outer[1] === node

		if (isAttrOfG || isAttrOfTransform || isAttrOfPathTransform) {
			// Exclude attributes' part from ancestors
			const attrAncestors = ancestors.slice(i)
			ancestors = ancestors.slice(0, i - 1)

			// Calculate transform compensation inside attribute
			for (let j = attrAncestors.length - 1; 0 < j; j--) {
				const node = attrAncestors[j]
				const outer = attrAncestors[j - 1]

				if (isList(outer)) {
					if (outer[0] === S('mat2d/*')) {
						// Prepend matrices
						const matrices = outer.slice(1, node[M_OUTER_INDEX])
						attrMatrices.unshift(...matrices)
					} else if (outer[0] === S('pivot')) {
						// Prepend matrices
						const matrices = outer.slice(2, node[M_OUTER_INDEX])
						attrMatrices.unshift(...matrices)

						// Append pivot itself as translation matrix
						const pivot =
							isMalNode(outer[1]) && M_EVAL in outer[1]
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
			if (node[0] === S('g') && isMap(node[1]) && K_TRANSFORM in node[1]) {
				const matrix = node[1][K_TRANSFORM]
				filtered.push(matrix)
			} else if (node[0] === S('artboard')) {
				const bounds = (node[1] as MalMap)[K('bounds')] as number[]
				const matrix = [1, 0, 0, 1, ...bounds.slice(0, 2)]
				filtered.push(matrix)
			} else if (
				node[0] === S('transform') ||
				node[0] === S('path/transform')
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
