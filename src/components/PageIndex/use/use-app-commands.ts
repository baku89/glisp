import AppScope from '@/scopes/app'
import {
	MalVal,
	MalColl,
	expandExp,
	MalSymbol,
	MalList,
	MalKeyword,
	getName,
	getMeta,
	isFunc,
	MalType,
	MalError,
	cloneExp,
	isSeq,
	MalList.isType(,
	MalSymbol.isType(For,
	MalSeq,
	getEvaluated,
	getType,
	isNode,
	symbolFor,
	MalVector,
} from '@/mal/types'
import {
	getMapValue,
	getFnInfo,
	applyParamModifier,
	copyDelimiters,
	replaceExp,
	getUIOuterInfo,
	getUIAnnotationExp,
	deleteExp,
	generateExpAbsPath,
	getExpByPath,
} from '@/mal/utils'
import {readStr} from '@/mal'
import {toSketchCode} from '../utils'
import printExp from '@/mal/printer'
import ViewScope from '@/scopes/view'
import {reconstructTree} from '@/mal/reader'

export default function useAppCommands(
	data: {
		exp: MalColl
		selectedExp: MalColl[]
		activeExp: MalColl | undefined
		editingExp: MalColl | undefined
	},
	callbacks: {
		updateExp: (exp: MalColl) => any
		setActiveExp: (exp: MalColl | undefined) => any
		setSelectedExp: (exp: MalColl[]) => any
	}
) {
	AppScope.def('expand-selected', () => {
		if (!data.activeExp) {
			return false
		}

		const expanded = expandExp(data.activeExp)
		if (expanded === undefined) {
			return false
		}

		replaceExp(data.activeExp, expanded)

		return true
	})

	AppScope.def('insert-item', (exp: MalVal) => {
		let activeExp = data.exp
		if (data.activeExp) {
			activeExp = data.activeExp
		} else {
			activeExp = data.exp
		}

		const type = getType(exp)

		if (!isSeq(activeExp)) {
			throw new MalError('No insertable selection')
		}

		let newExp: MalSeq

		if (type === MalType.String || type === MalType.Symbol) {
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

			newExp = L(MalSymbol.create(fnName), ...initialParams)
		} else if (type === MalType.List) {
			newExp = exp as MalSeq
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

		const original = getExpByPath(data.exp, path)

		if (!isNode(original)) {
			throw new MalError('The original should be node')
		}

		replaceExp(original, replaced)

		return path
	})

	AppScope.def('select-items', (paths: MalVal) => {
		if (MalVector.isType(paths)) {
			const items: MalColl[] = []

			for (const path of paths) {
				if (typeof path !== 'string') {
					return false
				}
				const item = getExpByPath(data.exp, path)
				if (!isNode(item)) {
					return false
				}
				items.push(item)
			}

			callbacks.setSelectedExp(items)
		}
		return false
	})

	AppScope.def('item-selected?', (path: MalVal) => {
		if (typeof path !== 'string') {
			return false
		}

		const item = getExpByPath(data.exp, path)

		if (!isNode(item)) {
			return false
		}

		const index = data.selectedExp.findIndex(s => s === item)

		return index !== -1
	})

	AppScope.def('toggle-item-selection', (path: MalVal) => {
		if (typeof path !== 'string') {
			return false
		}

		const item = getExpByPath(data.exp, path)

		if (!isNode(item)) {
			return false
		}

		const index = data.selectedExp.findIndex(s => s === item)

		const items = [...data.selectedExp]
		if (index === -1) {
			items.push(item)
		} else {
			items.splice(index, 1)
		}

		callbacks.setSelectedExp(items)

		return true
	})

	AppScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(toSketchCode(code)) as MalColl
				callbacks.updateExp(exp)
				callbacks.setActiveExp(undefined)
				data.editingExp = exp
			} else {
				throw new MalError(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	AppScope.def('select-outer', () => {
		if (!data.activeExp) {
			throw new MalError('No selection')
		}

		const [outer] = getUIOuterInfo(data.activeExp)
		if (outer && outer !== data.exp) {
			callbacks.setActiveExp(outer)
		}
		return true
	})

	AppScope.def('wrap-selected', (wrapper: MalVal) => {
		if (!data.activeExp) {
			throw new MalError('No selection')
		}
		if (!MalList.isType((wrapper)) {
			throw new MalError(`${printExp(wrapper)} is not a list`)
		}

		const exp = data.activeExp
		let shouldDuplicate = false

		const newExp = L(
			...wrapper.map(e => {
				if (isMalSymbol.create(e, '%')) {
					const ret = shouldDuplicate ? cloneExp(exp, true) : exp
					shouldDuplicate = true
					return ret
				} else {
					return e
				}
			})
		)

		reconstructTree(newExp)

		replaceExp(data.activeExp, newExp)

		return true
	})

	AppScope.def('transform-selected', (xform: MalVal) => {
		for (const exp of data.selectedExp) {
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
				[MalKeyword.create('params')]: originalParams.map(p => getEvaluated(p)),
				[MalKeyword.create('transform')]: xform as MalVal,
			}

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
		if (!data.activeExp) {
			throw new MalError('No selection')
		}

		const code = printExp(data.activeExp)

		navigator.clipboard.writeText(code)

		return true
	})

	AppScope.def('paste-from-clipboard', () => {
		let outer: MalSeq, index: number

		if (!data.activeExp) {
			;[outer, index] = [data.exp as MalSeq, (data.exp as MalSeq).length - 1]
		} else {
			const [_outer, _index] = getUIOuterInfo(data.activeExp)

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

			callbacks.setActiveExp(isNode(exp) ? exp : undefined)
		})

		return null
	})

	AppScope.def('delete-selected', () => {
		for (const _exp of data.selectedExp) {
			const exp = getUIAnnotationExp(_exp)
			deleteExp(exp)
		}

		callbacks.setSelectedExp([])

		return true
	})

	AppScope.def('group-selected', () => {
		if (data.selectedExp.length === 0) {
			return false
		}

		const [first, ...rest] = data.selectedExp

		for (const exp of rest) {
			deleteExp(getUIAnnotationExp(exp))
		}

		const group = L(MalSymbol.create('g'), {}, first, ...rest)

		replaceExp(first, group)

		callbacks.setActiveExp(group)

		return true
	})
}
