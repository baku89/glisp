import {
	MalVal,
	MalFunc,
	MalKeyword,
	MalMap,
	MalColl,
	MalVector,
	isMalSeq,
	MalConvertable,
	MalSymbol,
	MalList,
	isMalColl,
	MalType,
	MalNumber,
	MalNil,
	MalString,
	MalBoolean,
	MalMacro,
	MalAtom,
} from '@/mal/types'
import ConsoleScope from '@/scopes/console'
import {mat2d} from 'gl-matrix'
import printExp from './printer'

export function isUIAnnotation(exp: MalVal | undefined): exp is MalList {
	return MalList.is(exp) && MalSymbol.isFor(exp.fn, 'ui-annotate')
}

export function getStructType(exp: MalVal): StructTypes | undefined {
	if (MalVector.is(exp)) {
		if (MalKeyword.isFor(exp.get(0), 'path')) {
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

export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Number
): MalNumber | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.String
): MalString | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Boolean
): MalBoolean | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Nil
): MalNil | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Keyword
): MalKeyword | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Symbol
): MalSymbol | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.List
): MalList | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Vector
): MalVector | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Map
): MalMap | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Func
): MalFunc | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Macro
): MalMacro | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Vector
): MalVector | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type: MalType.Atom
): MalAtom | null
export function getExpByPath(
	base: MalVal,
	path: string,
	type?: MalType
): MalVal | null {
	const keys = path
		.split('/')
		.filter(k => k !== '')
		.map(k => parseInt(k))

	return find(base, keys)

	function find(exp: MalVal, keys: number[]): MalVal | null {
		const [index, ...rest] = keys

		const expBody = getUIBodyExp(exp)

		if (keys.length === 0) {
			if (type) {
				return expBody.type === type ? expBody : null
			} else {
				return expBody
			}
		}

		if (isMalSeq(expBody)) {
			return find(expBody.get(index), rest)
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

export function getUIParent(
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
export function replaceExp(original: MalVal, replaced: MalVal) {
	if (!original.parent) {
		// Is the root exp
		return
	}

	const {ref: parent, index} = original.parent

	const newOuter = parent.clone(true)

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
	let fn: MalFunc | undefined = MalFunc.is(exp) ? exp : getFn(exp)

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
		aliasFor = getExpByPath(meta, 'alias-for', MalType.String)?.value as string
	}

	return {fn, meta, aliasFor, structType}
}

export function reverseEval(exp: MalVal, original: MalVal) {
	return exec() || original

	function exec(): MalVal | undefined {
		if (MalList.is(original)) {
			// Check if the list is wrapped within const
			if (MalSymbol.isFor(original.fn, 'const')) return

			// find Inverse function
			const meta = original.fn.evaluated.meta
			if (!meta) return

			const inverseFn = getExpByPath(meta, 'inverse', MalType.Func)
			if (inverseFn === null) return

			const fn = original.fn
			const originalParams = original.params
			const evaluatedParams = originalParams.map(e => e.evaluated)

			// Compute the original parameter
			const result = inverseFn.value(
				MalMap.create({
					return: exp,
					params: MalVector.create(...evaluatedParams),
				})
			)

			if (!MalVector.is(result) && !MalMap.is(result)) {
				return original
			}

			// Parse the result
			let newParams: MalVal[]
			let updatedIndices: number[] | undefined = undefined

			if (MalMap.is(result)) {
				const {params, replace} = result.value

				if (MalVector.is(params)) {
					newParams = params.value
				} else if (MalVector.is(replace)) {
					newParams = [...originalParams]

					let pairs: [number, MalVal][]

					if (MalNumber.is(replace.get(0))) {
						pairs = [replace.get(0).value, replace.get(1)]
					} else {
						pairs = (replace.value as MalVector[]).map(r => [
							r.get(0).value,
							r.get(1),
						])
					}
					for (const [i, value] of pairs) {
						newParams[i] = value
					}
					updatedIndices = pairs.map(([i]) => i)
				} else {
					return original
				}
			} else if (MalVector.is(result)) {
				newParams = result.value
			} else {
				// Invalid returned type
				return original
			}

			if (!updatedIndices) {
				updatedIndices = Array(newParams.length)
					.fill(0)
					.map((_, i) => i)
			}

			for (const i of updatedIndices) {
				newParams[i] = reverseEval(newParams[i], originalParams[i])
			}

			const newExp = MalList.create(fn, ...newParams)

			return newExp
		} else if (MalVector.is(original)) {
			if (!MalVector.is(exp) || exp.length === original.length) return

			return MalVector.create(
				...exp.value.map((e, i) => reverseEval(e, original.value[i]))
			)
		} else if (MalMap.is(original)) {
			// Note: will fix it layer
			// if (MalMap.is(exp)) {
			// 	const newExp = {...exp}
			// 	Object.entries(original as MalMap).forEach(([key, value]) => {
			// 		if (key in exp) {
			// 			newExp.value[key] = reverseEval(exp[key], value)
			// 		} else {
			// 			newExp.value[key] = value
			// 		}
			// 	})
			// 	return newExp
			// }
		} else if (MalSymbol.is(original)) {
			// NOTE: temporarily disabling
			// const def = (original as MalSymbol).def
			// if (def && !MalSymbol.is(exp)) {
			// 	// NOTE: Making side-effects on the below line
			// 	const newDefBody = reverseEval(exp, def[2], forceOverwrite)
			// 	replaceExp(
			// 		def,
			// 		MalList.create(MalSymbol.create('defvar'), original, newDefBody)
			// 	)
			// 	return original.clone()
			// }
		}
	}
}

export function computeExpTransform(exp: MalVal): mat2d {
	if (!isMalColl(exp)) {
		return mat2d.create()
	}

	// Collect ancestors with index
	const ancestors: {ref: MalColl; index: number}[] = []

	for (let _exp: MalColl = exp; _exp.parent; _exp = _exp.parent.ref) {
		ancestors.unshift(_exp.parent)
	}

	const xform = mat2d.create()

	for (const {ref: node, index} of ancestors) {
		if (!MalList.is(node)) {
			continue
		}

		const meta = node.value[0].evaluated.meta
		const viewportFn = getExpByPath(meta, 'viewport-transform', MalType.Func)

		if (!viewportFn) {
			continue
		}

		// Execute the viewport transform function
		const evaluatedParams = node.params.map(x => x.evaluated)
		const paramXforms = viewportFn.value(...evaluatedParams)

		if (!MalVector.is(paramXforms) || !paramXforms.value[index - 1]) {
			continue
		}

		mat2d.mul(xform, xform, paramXforms.value[index - 1].value as mat2d)
	}

	return xform
}

// export function applyParamModifier(modifier: MalVal, originalParams: MalVal[]) {
// 	if (!MalVector.is(modifier) && !MalMap.is(modifier)) {
// 		return null
// 	}

// 	// Parse the modifier
// 	let newParams: MalVal[]
// 	let updatedIndices: number[] | undefined = undefined

// 	if (MalMap.is(modifier)) {
// 		const params = modifier.get('params')
// 		const replace = modifier.get('params')

// 		if (MalVector.is(params)) {
// 			newParams = params.clone(false)
// 		} else if (MalVector.is(replace)) {
// 			newParams = originalParams.clone(false)
// 			const pairs = (typeof replace[0] === 'number'
// 				? [(replace as any) as [number, MalVal]]
// 				: ((replace as any) as [number, MalVal][])
// 			).map(
// 				([si, e]) =>
// 					[si < 0 ? newParams.length + si : si, e] as [number, MalVal]
// 			)
// 			for (const [i, value] of pairs) {
// 				newParams[i] = value
// 			}
// 			updatedIndices = pairs.map(([i]) => i)
// 		} else {
// 			return null
// 		}

// 		// if (MalVector.is(changeId)) {
// 		// 	const newId = newParams[1]
// 		// 	data.draggingIndex = data.handles.findIndex(h => h.id === newId)
// 		// }
// 	} else {
// 		newParams = modifier
// 	}

// 	if (!updatedIndices) {
// 		updatedIndices = Array(newParams.length)
// 			.fill(0)
// 			.map((_, i) => i)
// 	}

// 	// Execute the backward evaluation
// 	for (const i of updatedIndices) {
// 		let newValue = newParams[i]
// 		const unevaluated = originalParams[i]

// 		// if (malEquals(newValue, this.params[i])) {
// 		// 	newValue = unevaluated
// 		// }

// 		newValue = reverseEval(newValue, unevaluated)
// 		newParams[i] = newValue
// 	}

// 	return newParams
// }

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

		const {ref: parent, index} = exp.parent
		let offset = calcOffset(parent)

		if (isMalSeq(parent)) {
			offset +=
				(MalList.is(parent) && parent.isSugar ? 0 : 1) +
				parent.delimiters.slice(0, index + 1).join('').length +
				parent.value
					.slice(0, index)
					.map(x => x.print())
					.join('').length
		} else if (MalMap.is(parent)) {
			offset +=
				1 /* '{'.   length */ +
				parent.delimiters.slice(0, (index + 1) * 2).join('').length +
				parent
					.keys()
					.slice(0, index + 1)
					.map(x => ':' + x)
					.join('').length +
				parent
					.values()
					.slice(0, index)
					.map(x => x.print())
					.join('').length
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
			if (i < exp.length) {
				offset += exp.get(i).print().length
			}
		}
	} else if (MalMap.is(exp)) {
		// Hash Map

		let offset = 1 // length of '{'

		const delimiters = exp.delimiters

		// Search Children
		exp.entries().forEach(([, child], i) => {
			// Offsets
			offset +=
				delimiters[i * 2].length + // delimiter before key
				exp.get(i).print().length + // key
				delimiters[i * 2 + 1].length // delimiter between key and value

			const ret = findExpByRange(child, start - offset, end - offset)
			if (ret !== null) {
				return ret
			}

			// NOTE: This must be buggy
			// offset += elmStrs[i * 2 + 1].length
		})
	}

	return exp
}
