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
	MalNil,
	MalString,
	MalBoolean,
} from '@/mal/types'
import ConsoleScope from '@/scopes/console'
import {mat2d} from 'gl-matrix'
import printExp from './printer'

export function isUIAnnotation(exp: MalVal | undefined): exp is MalList {
	return MalList.is(exp) && MalSymbol.isFor(exp.value[0], 'ui-annotate')
}

export function getStructType(exp: MalVal): StructTypes | undefined {
	if (MalVector.is(exp)) {
		if (MalKeyword.isFor(exp.value[0], 'path')) {
			return 'path'
		}
		if (exp.length <= 6) {
			const isAllNumber =
				exp.value instanceof Float32Array || exp.value.every(MalNumber.is)
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

export function getExpByPath<T extends MalVal>(base: MalVal, path: string, type?: MalType): T | null {

	const keys = path
		.split('/')
		.filter(k => k !== '')
		.map(k => parseInt(k))
	
	return find(base, keys)

	function find(exp: MalVal, keys: number[]): T | null {
		const [index, ...rest] = keys

		const expBody = getUIBodyExp(exp)

		if (keys.length === 0) {
			if (type) {
				return expBody.type === type ? expBody as T : null
			} else {
				return expBody as T
			}
		}

		if (isMalSeq(expBody)) {
			return find(expBody.value[index], rest)
		} else if (MalMap.is(expBody)) {
			return find(expBody.get(index), rest)
		} else {
			return null
		}
	}
}

export function generateExpAbsPath(exp: MalVal) {
	return seek(exp, '')

	function seek(exp: MalVal, path: string): string {
		if (exp.parent) {
			const {ref: parent, index} = exp.parent
			if (isUIAnnotation(parent)) {
				return seek(parent, path)
			} else {
				return seek(parent, index + '/' + path)
			}
		} else {
			return '/' + path
		}
	}
}

export function getUIOuterInfo(
	_exp: MalVal | undefined
): {ref: MalColl; index: number} | undefined {
	if (!isMalColl(_exp) || !_exp.parent) {
		return undefined
	} else {
		return isUIAnnotation(_exp.parent.ref)
			? _exp.parent.ref.parent
			: _exp.parent
	}
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

	if (!original.parent) {
		// Is the root exp
		return
	}

	const {ref: parent, index} = original.parent

	const newOuter = parent.clone()

	// Set replaced as new child
	if (isMalSeq(newOuter)) {
		// Sequence
		newOuter.value[index] = replaced
	} else {
		// Hash map
		const keys = (parent as MalMap).keys()
		const key = keys[index]
		newOuter.value[key] = replaced
	}

	reconstructTree(newOuter)
	newOuter.delimiters = parent.delimiters ? [...parent.delimiters] : undefined

	replaceExp(parent, newOuter)
}

export function getUIAnnotationExp(exp: MalColl) {
	const parent = exp.parent?.ref
	return isUIAnnotation(parent) ? parent : exp
}

export function getUIBodyExp(exp: MalVal) {
	return isUIAnnotation(exp) ? exp.value[2] : exp
}

export function deleteExp(exp: MalColl) {
	if (!exp.parent) return false

	const {ref: oldParent, index} = exp.parent

	const newParent = oldParent.clone()

	if (isMalSeq(newParent)) {
		newParent.value.splice(index, 1)
	} else {
		const key = newParent.keys()[index]
		delete newParent.value[key]
	}

	copyDelimiters(newParent, oldParent)
	reconstructTree(newParent)

	replaceExp(oldParent, newParent)

	return true
}

type StructTypes = 'vec2' | 'rect2d' | 'mat2d' | 'path'

export interface FnInfoType {
	fn: MalFunc
	meta?: MalVal
	aliasFor?: string
	structType?: StructTypes
}

export function getFnInfo(exp: MalVal): FnInfoType | undefined {
	let fn = MalFunc.is(exp) ? exp : getFn(exp)

	let meta: MalMap | undefined = undefined
	let aliasFor = undefined
	let structType: StructTypes | undefined = undefined

	// Check if the exp is struct
	if (!fn) {
		structType = getStructType(exp.evaluated)
		if (structType) {
			fn = ConsoleScope.var(structType) as MalFunc
		}
	}

	if (!fn) {
		return undefined
	}

	meta = MalMap.is(fn.meta) ? fn.meta : undefined
	if (meta) {
		aliasFor = getMapValue(meta, 'alias-for', MalString)
	}

	return {fn, meta, aliasFor, structType}
}

export function reverseEval(
	exp: MalVal,
	original: MalVal,
	forceOverwrite = false
): MalVal {
	// const meta = getMeta(original)

	switch (original.type) {
		case MalType.List: {
			// Check if the list is wrapped within const
			if (MalSymbol.isFor((original as MalList).fn, 'const')) {
				return original
			} else {
				// find Inverse function
				const info = getFnInfo(original as MalSeq)
				if (!info) break
				const inverseFn = getMapValue(info.meta, 'inverse')
				if (!MalFunc.is(inverseFn)) break

				const fnName = (original as MalSeq)[0]
				const originalParams = (original as MalSeq).slice(1)
				const evaluatedParams = originalParams.map(e => e.evaluated)

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
					const {params, replace} = result.value

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

				const newExp = MalList.create(fnName, ...newParams)

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
	for (let _exp: MalColl = exp; _exp.parent; _exp = _exp.parent) {
		ancestors.unshift([_exp.parent, _exp[M_OUTER_INDEX]])
	}

	const xform = mat2d.create()

	for (const [node, index] of ancestors) {
		if (!MalList.is(node)) {
			continue
		}

		const meta = getMeta(node.value[0].evaluated)
		const viewportFn = getMapValue(meta, 'viewport-transform')

		if (!MalFunc.is(viewportFn)) {
			continue
		}

		// Execute the viewport transform function

		const evaluatedParams = node.params.map(x => x.evaluated)
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
		const params = modifier.get('params')
		const replace = modifier.get('params')

		if (MalVector.is(params)) {
			newParams = params.clone(false)
		} else if (MalVector.is(replace)) {
			newParams = originalParams.clone(false)
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
	if (isMalSeq(target) && isMalSeq(original) && original.delimiters) {
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

export function reconstructTree(exp: MalVal) {
	seek(exp)

	function seek(exp: MalVal, parent?: {ref: MalColl; index: number}) {
		if (parent) {
			exp.parent = parent
		}

		if (isMalSeq(exp)) {
			exp.value.forEach((child, index) => seek(child, {ref: exp, index}))
		} else if (MalMap.is(exp)) {
			exp
				.entries()
				.forEach(([, child], index) => seek(child, {ref: exp, index}))
		}
	}
}

export function getRangeOfExp(
	exp: MalColl,
	root?: MalColl
): [number, number] | null {
	function isAncestorOf(ancestor: MalColl, child: MalVal): boolean {
		if (ancestor === child) {
			return true
		} else if (!child.parent) {
			return false
		} else {
			return isAncestorOf(ancestor, child.parent.ref)
		}
	}

	function calcOffset(exp: MalColl): number {
		if (!exp.parent || exp === root) {
			return 0
		}

		const parent = exp.parent.ref
		let offset = calcOffset(parent)

		// Creates a delimiter cache
		printExp(parent)

		if (isMalSeq(parent)) {
			const index = exp[M_OUTER_INDEX]
			offset +=
				(MalList.is(parent) && parent.isSugar ? 0 : 1) +
				parent.delimiters.slice(0, index + 1).join('').length +
				parent[M_ELMSTRS].slice(0, index).join('').length
		} else if (MalMap.is(parent)) {
			const index = exp[M_OUTER_INDEX]
			offset +=
				1 /* '{'.   length */ +
				parent.delimiters.slice(0, (index + 1) * 2).join('').length +
				parent[M_ELMSTRS].slice(0, index * 2 + 1).join('').length
		}

		return offset
	}

	const isExpOutsideOfParent = root && !isAncestorOf(root, exp)

	if (!isMalColl(exp) || isExpOutsideOfParent) {
		return null
	}

	const expLength = exp.print().length
	const offset = calcOffset(exp)

	return [offset, offset + expLength]
}

export function findExpByRange(
	exp: MalVal,
	start: number,
	end: number
): MalColl | null {
	if (!isMalColl(exp)) {
		// If Atom
		return null
	}

	// Creates a caches of children at the same time calculating length of exp
	const expLen = printExp(exp, true).length

	if (!(0 <= start && end <= expLen)) {
		// Does not fit within the exp
		return null
	}

	if (MalList.is(exp)) {
		// Sequential

		// Add the length of open-paren
		let offset = exp.isSugar ? 0 : 1

		// Search Children
		for (let i = 0; i < exp.length; i++) {
			const child = exp.value[i]
			offset += exp.delimiters[i].length

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			// For #() syntaxtic sugar
			if (i < exp[M_ELMSTRS].length) {
				offset += exp[M_ELMSTRS][i].length
			}
		}
	} else if (MalMap.is(exp)) {
		// Hash Map

		let offset = 1 // length of '{'

		const keys = Object.keys(exp)
		const elmStrs = exp[M_ELMSTRS]
		const delimiters = exp.delimiters

		// Search Children
		for (let i = 0; i < keys.length; i++) {
			const child = exp[keys[i]]

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

	return exp
}

export function jsToMal(obj: ): MalVal {
	if (obj instanceof MalVal) {
		return obj
	}

	if (Array.isArray(obj)) {
		// Vector
		return MalVector.create(...obj.map(jsToMal))
	} else if (obj instanceof Object) {
		// Map
		const ret: {[k: string]: MalVal} = {}
		for (const [key, value] of Object.entries(obj)) {
			ret[key] = jsToMal(value)
		}
		return MalMap.create(ret)
	} else if (obj === null) {
		// Nil
		return MalNil.create()
	} else {
		switch (typeof obj) {
			case 'number':
				return MalNumber.create(obj)
			case 'string':
				return MalString.create(obj)
			case 'undefined':
				return MalNil.create()
			case 'boolean':
				return MalBoolean.create(obj)
			case 'function':
				return MalFunc.create((...xs) => jsToMal(obj(...xs)))
		}
		throw new Error('Cannot convert to Mal')
	}
}
