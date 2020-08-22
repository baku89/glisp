import AppScope from '@/scopes/app'
import {NonReactive, nonReactive} from '@/utils'
import {
	MalVal,
	MalNode,
	expandExp,
	symbolFor as S,
	createList as L,
	keywordFor as K,
	getName,
	getMeta,
	isFunc,
	MalType,
	MalError,
	cloneExp,
	isSeq,
	isList,
	isSymbolFor,
	MalSeq,
	getEvaluated,
	getType,
	isNode,
	symbolFor,
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
		exp: NonReactive<MalNode>
		selectedExp: NonReactive<MalNode>[]
		activeExp: NonReactive<MalNode> | null
		editingExp: NonReactive<MalNode> | null
	},
	callbacks: {
		updateExp: (exp: NonReactive<MalNode>) => void
		setActiveExp: (exp: NonReactive<MalNode> | null) => any
		setSelectedExp: (exp: NonReactive<MalNode>[]) => void
	}
) {
	AppScope.def('expand-selected', () => {
		if (!data.activeExp) {
			return false
		}

		const expanded = expandExp(data.activeExp.value)
		if (expanded === undefined) {
			return false
		}

		replaceExp(data.activeExp.value, expanded)

		return true
	})

	AppScope.def('insert-item', (exp: MalVal) => {
		let activeExp = data.exp.value
		if (data.activeExp) {
			activeExp = data.activeExp.value
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

			newExp = L(S(fnName), ...initialParams)
		} else if (type === MalType.List) {
			newExp = exp as MalSeq
		} else {
			throw new MalError('Invalid argument')
		}

		reconstructTree(newExp)

		// Insert
		const newActiveExp = cloneExp(activeExp)
		newActiveExp.push(newExp)

		replaceExp(activeExp, newActiveExp)

		return generateExpAbsPath(newExp)
	})

	AppScope.def('replace-item', (path: MalVal, replaced: MalVal) => {
		if (typeof path !== 'string') {
			throw new Error('Path should be string')
		}

		const original = getExpByPath(data.exp.value, path)

		if (!isNode(original)) {
			throw new MalError('The original should be node')
		}

		replaceExp(original, replaced)

		return true
	})

	AppScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(toSketchCode(code)) as MalNode
				const nonReactiveExp = nonReactive(exp)
				callbacks.updateExp(nonReactiveExp)
				callbacks.setActiveExp(null)
				data.editingExp = nonReactiveExp
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

		const [outer] = getUIOuterInfo(data.activeExp.value)
		if (outer && outer !== data.exp?.value) {
			callbacks.setActiveExp(nonReactive(outer))
		}
		return true
	})

	AppScope.def('wrap-selected', (wrapper: MalVal) => {
		if (!data.activeExp) {
			throw new MalError('No selection')
		}
		if (!isList(wrapper)) {
			throw new MalError(`${printExp(wrapper)} is not a list`)
		}

		const exp = data.activeExp.value
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

		replaceExp(data.activeExp.value, newExp)

		return true
	})

	AppScope.def('transform-selected', (xform: MalVal) => {
		for (const {value: exp} of data.selectedExp) {
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

		const code = printExp(data.activeExp.value)

		navigator.clipboard.writeText(code)

		return true
	})

	AppScope.def('paste-from-clipboard', () => {
		let outer: MalSeq, index: number

		if (!data.activeExp) {
			;[outer, index] = [
				data.exp.value as MalSeq,
				(data.exp.value as MalSeq).length - 1,
			]
		} else {
			const [_outer, _index] = getUIOuterInfo(data.activeExp.value)

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

			callbacks.setActiveExp(isNode(exp) ? nonReactive(exp) : null)
		})

		return null
	})

	AppScope.def('delete-selected', () => {
		for (const _exp of data.selectedExp) {
			const exp = getUIAnnotationExp(_exp.value)
			deleteExp(exp)
		}

		callbacks.setSelectedExp([])

		return true
	})

	AppScope.def('group-selected', () => {
		if (data.selectedExp.length === 0) {
			return false
		}

		const [first, ...rest] = data.selectedExp.map(e => e.value)

		for (const exp of rest) {
			deleteExp(getUIAnnotationExp(exp))
		}

		const group = L(symbolFor('g'), {}, first, ...rest)

		replaceExp(first, group)

		callbacks.setActiveExp(nonReactive(group))

		return true
	})
}
