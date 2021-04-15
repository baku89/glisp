import {readStr} from '@/mal'
import printExp from '@/mal/printer'
import {
	MalBoolean,
	MalColl,
	MalError,
	MalList,
	MalMap,
	MalString,
	MalSymbol,
	MalVal,
} from '@/mal/types'
import {
	deleteExp,
	getExpByPath,
	getUIAnnotationExp,
	getUIParent,
	replaceExp,
} from '@/mal/utils'
import AppScope from '@/scopes/app'

import {toSketchCode} from '../utils'
// import {expandExp} from '@/mal/expand'

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
	// AppScope.defn('expand-selected', () => {
	// 	if (!data.activeExp) {
	// 		return MalBoolean.from(false)
	// 	}

	// 	const expanded = expandExp(data.activeExp)
	// 	if (expanded === undefined) {
	// 		return MalBoolean.from(false)
	// 	}

	// 	replaceExp(data.activeExp, expanded)

	// 	return MalBoolean.from(true)
	// })

	// AppScope.defn('insert-item', (exp: MalVal) => {
	// 	let activeExp = data.exp
	// 	if (data.activeExp) {
	// 		activeExp = data.activeExp
	// 	} else {
	// 		activeExp = data.exp
	// 	}

	// 	const type = exp.type

	// 	if (!isMalSeq(activeExp)) {
	// 		throw new MalError('No insertable selection')
	// 	}

	// 	let newExp: MalSeq

	// 	if (MalString.is(exp) || MalSymbol.is(exp)) {
	// 		const fnName = exp.value
	// 		const fn = ViewScope.var(exp.value)
	// 		const meta = fn.meta
	// 		const returnType =
	// 			getExpByPath(meta, 'return/type', MalType.String)?.value ||
	// 			''
	// 		const initialParams = getExpByPath(
	// 			meta,
	// 			'initial-params',
	// 			MalType.Vector
	// 		)?.value

	// 		if (!MalFunc.is(fn) || !['item', 'path'].includes(returnType)) {
	// 			throw new MalError(`${fnName} is not a function that returns item/path`)
	// 		}

	// 		if (!initialParams) {
	// 			throw new MalError(
	// 				`Function ${fnName} does not have the :initial-params field`
	// 			)
	// 		}

	// 		newExp = MalList.from(MalSymbol.from(fnName), ...initialParams)
	// 	} else if (MalList.is(exp)) {
	// 		newExp = exp
	// 	} else {
	// 		throw new MalError('Invalid argument')
	// 	}

	// 	// Insert
	// 	const newActiveExp = activeExp.clone()
	// 	newActiveExp.push(newExp)
	// 	copyDelimiters(newActiveExp, activeExp)

	// 	replaceExp(activeExp, newActiveExp)

	// 	return MalString.from(generateExpAbsPath(newExp))
	// })

	AppScope.defn('replace-item', (path: MalVal, replaced: MalVal) => {
		if (!MalString.is(path)) {
			throw new Error('Path should be string')
		}

		const original = getExpByPath(data.exp, path.value)

		if (original) {
			replaceExp(original, replaced)
		}

		return path
	})

	// AppScope.defn('select-items', (paths: MalVal) => {
	// 	if (MalVector.is(paths)) {
	// 		const items: MalColl[] = []

	// 		for (const path of paths) {
	// 			if (typeof path !== 'string') {
	// 				return MalBoolean.from(false)
	// 			}
	// 			const item = getExpByPath(data.exp, path)
	// 			if (!isMalColl(item)) {
	// 				return MalBoolean.from(false)
	// 			}
	// 			items.push(item)
	// 		}

	// 		callbacks.setSelectedExp(items)
	// 	}
	// 	return MalBoolean.from(true)
	// })

	// AppScope.defn('item-selected?', (path: MalVal) => {
	// 	if (MalString.is(path)) {
	// 		return MalBoolean.from(false)
	// 	}

	// 	const item = getExpByPath(data.exp, path.value)

	// 	if (!isMalColl(item)) {
	// 		return MalBoolean.from(false)
	// 	}

	// 	const index = data.selectedExp.findIndex(s => s === item)

	// 	return MalBoolean.from(index !== -1)
	// })

	// AppScope.defn('toggle-item-selection', (path: MalVal) => {
	// 	if (MalString.is(path)) {
	// 		return MalBoolean.from(false)
	// 	}

	// 	const item = getExpByPath(data.exp, path.value)

	// 	if (!isMalColl(item)) {
	// 		return MalBoolean.from(false)
	// 	}

	// 	const index = data.selectedExp.findIndex(s => s === item)

	// 	const items = [...data.selectedExp]
	// 	if (index === -1) {
	// 		items.push(item)
	// 	} else {
	// 		items.splice(index, 1)
	// 	}

	// 	callbacks.setSelectedExp(items)

	// 	return MalBoolean.from(true)
	// })

	AppScope.defn('load-file', (url: MalVal) => {
		fetch(url.value as string).then(async res => {
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

		return MalBoolean.from(true)
	})

	AppScope.defn('select-outer', () => {
		if (!data.activeExp) {
			throw new MalError('No selection')
		}

		const parent = getUIParent(data.activeExp)
		if (parent && parent?.ref !== data.exp) {
			callbacks.setActiveExp(parent.ref)
		}
		return MalBoolean.from(true)
	})

	AppScope.defn('wrap-selected', (wrapper: MalVal) => {
		if (!data.activeExp) {
			throw new MalError('No selection')
		}
		if (!MalList.is(wrapper)) {
			throw new MalError(`${printExp(wrapper)} is not a list`)
		}

		const exp = data.activeExp
		let shouldDuplicate = false

		const newExp = MalList.from(
			...wrapper.value.map(e => {
				if (MalSymbol.isFor(e, '%')) {
					const ret = shouldDuplicate ? exp.clone() : exp
					shouldDuplicate = true
					return ret
				} else {
					return e
				}
			})
		)

		replaceExp(data.activeExp, newExp)

		return MalBoolean.from(true)
	})

	// AppScope.defn('transform-selected', (xform: MalVal) => {
	// 	for (const exp of data.selectedExp) {
	// 		if (!isMalSeq(exp)) {
	// 			continue
	// 		}

	// 		const fnInfo = getFnInfo(exp)

	// 		if (!fnInfo) {
	// 			return MalBoolean.from(false)
	// 		}

	// 		const {meta, structType} = fnInfo
	// 		const transformFn = getExpByPath(meta, 'transform')

	// 		if (!MalFunc.is(transformFn)) {
	// 			return MalBoolean.from(false)
	// 		}

	// 		const originalParams = structType ? [exp] : exp.value.slice(1)
	// 		const payload = MalMap.from({
	// 			params:  MalVector.from(...originalParams.map(p => p.evaluated)),
	// 			transform: xform,
	// 		})

	// 		const modifier = transformFn.value(payload)
	// 		let newParams: MalVal[] | null

	// 		if (structType) {
	// 			newParams = modifier as MalSeq
	// 		} else {
	// 			newParams = applyParamModifier(modifier, originalParams)
	// 			if (!newParams) {
	// 				return MalBoolean.from(false)
	// 			}
	// 		}

	// 		const newExp = structType
	// 			? newParams[0]
	// 			: MalList.from(exp[0], ...newParams)
	// 		copyDelimiters(newExp, exp)

	// 		replaceExp(exp, newExp)
	// 	}

	// 	return MalBoolean.from(true)
	// })

	// AppScope.defn('copy-selected', () => {
	// 	if (!data.activeExp) {
	// 		throw new MalError('No selection')
	// 	}

	// 	const code = printExp(data.activeExp)

	// 	navigator.clipboard.writeText(code)

	// 	return MalBoolean.from(true)
	// })

	// AppScope.defn('paste-from-clipboard', () => {
	// 	let outer: MalSeq, index: number

	// 	if (!data.activeExp) {
	// 		;[outer, index] = [data.exp as MalSeq, (data.exp as MalSeq).length - 1]
	// 	} else {
	// 		const [_outer, _index] = getUIParent(data.activeExp)

	// 		if (!isMalSeq(_outer)) {
	// 			return MalBoolean.from(false)
	// 		}

	// 		;[outer, index] = [_outer, _index]
	// 	}

	// 	const newOuter = outer.clone()

	// 	navigator.clipboard.readText().then((str: string) => {
	// 		const exp = readStr(str)

	// 		newOuter.value.splice(index + 1, 0, exp)
	// 		copyDelimiters(newOuter, outer)

	// 		replaceExp(outer, newOuter)

	// 		callbacks.setActiveExp(isMalColl(exp) ? exp : undefined)
	// 	})

	// 	return MalBoolean.from(true)
	// })

	AppScope.defn('delete-selected', () => {
		for (const _exp of data.selectedExp) {
			const exp = getUIAnnotationExp(_exp)
			deleteExp(exp)
		}

		callbacks.setSelectedExp([])

		return MalBoolean.from(true)
	})

	AppScope.defn('group-selected', () => {
		if (data.selectedExp.length === 0) {
			return MalBoolean.from(false)
		}

		const [first, ...rest] = data.selectedExp

		for (const exp of rest) {
			deleteExp(getUIAnnotationExp(exp))
		}

		const group = MalList.from(
			MalSymbol.from('g'),
			MalMap.from(),
			first,
			...rest
		)

		replaceExp(first, group)

		callbacks.setActiveExp(group)

		return MalBoolean.from(true)
	})
}
