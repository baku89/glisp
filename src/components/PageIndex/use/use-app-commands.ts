import {Ref} from 'vue'

import {readStr} from '@/mal'
import printExp from '@/mal/printer'
import {reconstructTree} from '@/mal/reader'
import {
	cloneExp,
	createList as L,
	expandExp,
	getEvaluated,
	getMeta,
	getName,
	isFunc,
	isList,
	isNode,
	isSeq,
	isSymbol,
	isSymbolFor,
	isVector,
	keywordFor as K,
	MalError,
	MalMap,
	MalNode,
	MalSeq,
	MalType,
	MalVal,
	symbolFor as S,
	symbolFor,
} from '@/mal/types'
import {
	applyParamModifier,
	copyDelimiters,
	deleteExp,
	generateExpAbsPath,
	getExpByPath,
	getFnInfo,
	getMapValue,
	getUIOuterInfo,
	replaceExp,
} from '@/mal/utils'
import AppScope from '@/scopes/app'
import ViewScope from '@/scopes/view'

import {toSketchCode} from '../utils'

export default function useAppCommands(options: {
	exp: Ref<MalNode>
	selectedExp: Ref<MalNode[]>
	activeExp: Ref<MalNode | null>
	editingExp: Ref<MalNode | null>
	updateExp: (exp: MalNode) => void
	setActiveExp: (exp: MalNode | null) => any
	setSelectedExp: (exp: MalNode[]) => void
}) {
	AppScope.def('expand-selected', () => {
		if (!options.activeExp.value) {
			return false
		}

		const expanded = expandExp(options.activeExp)
		if (expanded === undefined) {
			return false
		}

		replaceExp(options.activeExp.value, expanded)

		return true
	})

	AppScope.def('insert-item', (exp: MalVal) => {
		const activeExp = options.activeExp.value ?? options.exp.value

		if (!isSeq(activeExp)) {
			throw new MalError('No insertable selection')
		}

		let newExp: MalSeq

		if (typeof exp === 'string' || isSymbol(exp)) {
			const fnName = getName(exp)
			const fn = ViewScope.var(fnName)
			const meta = getMeta(fn)
			const returnType =
				(getMapValue(meta, 'return/type', MalType.String) as string) || ''
			const initialParams =
				(getMapValue(meta, 'initial-params', MalType.Vector) as MalSeq) || null

			if (!isFunc(fn) || !['item', 'path'].includes(returnType)) {
				throw new MalError(`${fnName} is not a function that returns item/path`)
			}

			if (!initialParams) {
				throw new MalError(
					`Function ${fnName} does not have the :initial-params field`
				)
			}

			newExp = L(S(fnName), ...initialParams)
		} else if (isList(exp)) {
			newExp = exp
		} else {
			throw new MalError('Invalid argument')
		}

		reconstructTree(newExp)

		// Insert
		const newActiveExp = cloneExp(activeExp)
		newActiveExp.push(newExp)
		copyDelimiters(newActiveExp, activeExp)

		replaceExp(activeExp, newActiveExp)

		return generateExpAbsPath(newExp)
	})

	AppScope.def('replace-item', (path: MalVal, replaced: MalVal) => {
		if (typeof path !== 'string') {
			throw new Error('Path should be string')
		}

		const original = getExpByPath(options.exp.value, path)

		if (!isNode(original)) {
			throw new MalError('The original should be node')
		}

		replaceExp(original, replaced)

		return path
	})

	AppScope.def('select-items', (paths: MalVal) => {
		if (isVector(paths)) {
			const items: MalNode[] = []

			for (const path of paths) {
				if (typeof path !== 'string') {
					return false
				}
				const item = getExpByPath(options.exp.value, path)
				if (!isNode(item)) {
					return false
				}
				items.push(item)
			}

			options.setSelectedExp(items)
		}
		return false
	})

	AppScope.def('item-selected?', (path: MalVal) => {
		if (typeof path !== 'string') {
			return false
		}

		const item = getExpByPath(options.exp.value, path)

		if (!isNode(item)) {
			return false
		}

		const index = options.selectedExp.value.findIndex(s => s === item)

		return index !== -1
	})

	AppScope.def('toggle-item-selection', (path: MalVal) => {
		if (typeof path !== 'string') {
			return false
		}

		const item = getExpByPath(options.exp.value, path)

		if (!isNode(item)) {
			return false
		}

		const index = options.selectedExp.value.findIndex(s => s === item)

		const items = [...options.selectedExp.value]
		if (index === -1) {
			items.push(item)
		} else {
			items.splice(index, 1)
		}

		options.setSelectedExp(items)

		return true
	})

	AppScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(toSketchCode(code)) as MalNode
				options.updateExp(exp)
				options.setActiveExp(null)
				options.editingExp.value = exp
			} else {
				throw new MalError(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	AppScope.def('select-outer', () => {
		if (!options.activeExp.value) {
			throw new MalError('No selection')
		}

		const [outer] = getUIOuterInfo(options.activeExp.value)
		if (outer && outer !== options.exp.value) {
			options.setActiveExp(outer)
		}
		return true
	})

	AppScope.def('wrap-selected', (wrapper: MalVal) => {
		if (!options.activeExp.value) {
			throw new MalError('No selection')
		}
		if (!isList(wrapper)) {
			throw new MalError(`${printExp(wrapper)} is not a list`)
		}

		const exp = options.activeExp.value
		let shouldDuplicate = false

		const newExp = L(
			...wrapper.map(e => {
				if (isSymbolFor(e, '%')) {
					const ret = shouldDuplicate ? cloneExp(exp, true) : exp
					shouldDuplicate = true
					return ret
				} else {
					return e
				}
			})
		)

		reconstructTree(newExp)

		replaceExp(options.activeExp.value, newExp)

		return true
	})

	AppScope.def('transform-selected', (xform: MalVal) => {
		for (const exp of options.selectedExp.value) {
			if (!isSeq(exp)) {
				return false
			}

			const fnInfo = getFnInfo(exp)

			if (!fnInfo) {
				return false
			}

			const {meta, structType} = fnInfo
			const transformFn = getMapValue(meta, 'transform')

			if (!isFunc(transformFn)) {
				return false
			}

			const originalParams = structType ? [exp] : exp.slice(1)
			const payload = {
				[K('params')]: originalParams.map(p => getEvaluated(p)),
				[K('transform')]: xform as MalVal,
			} as MalMap

			const modifier = transformFn(payload)
			let newParams: MalVal[] | null

			if (structType) {
				newParams = modifier as MalSeq
			} else {
				newParams = applyParamModifier(modifier, originalParams)
				if (!newParams) {
					return false
				}
			}

			const newExp = structType ? newParams[0] : L(exp[0], ...newParams)
			copyDelimiters(newExp, exp)

			replaceExp(exp, newExp)
		}

		return true
	})

	AppScope.def('copy-selected', () => {
		if (!options.activeExp.value) {
			throw new MalError('No selection')
		}

		const code = printExp(options.activeExp.value)

		navigator.clipboard.writeText(code)

		return true
	})

	AppScope.def('paste-from-clipboard', () => {
		let outer: MalSeq, index: number

		if (!options.activeExp.value) {
			;[outer, index] = [
				options.exp.value as MalSeq,
				(options.exp.value as MalSeq).length - 1,
			]
		} else {
			const [_outer, _index] = getUIOuterInfo(options.activeExp.value)

			if (!isSeq(_outer)) {
				return false
			}

			;[outer, index] = [_outer, _index]
		}

		const newOuter = cloneExp(outer)

		navigator.clipboard.readText().then((str: string) => {
			const exp = readStr(str)

			newOuter.splice(index + 1, 0, exp)
			copyDelimiters(newOuter, outer)

			reconstructTree(newOuter)
			replaceExp(outer, newOuter)

			options.setActiveExp(isNode(exp) ? exp : null)
		})

		return null
	})

	AppScope.def('delete-selected', () => {
		for (const exp of options.selectedExp.value) {
			deleteExp(exp)
		}

		options.setSelectedExp([])

		return true
	})

	AppScope.def('group-selected', () => {
		if (options.selectedExp.value.length === 0) {
			return false
		}

		const [first, ...rest] = options.selectedExp.value

		for (const exp of rest) {
			deleteExp(exp)
		}

		const group = L(symbolFor('g'), {} as MalMap, first, ...rest)

		replaceExp(first, group)

		options.setActiveExp(group)

		return true
	})
}
