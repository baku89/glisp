import AppScope from '@/scopes/app'
import {NonReactive, nonReactive} from '@/utils'
import {
	MalVal,
	MalNode,
	expandExp,
	symbolFor as S,
	createList as L,
	getName,
	getMeta,
	isFunc,
	MalType,
	MalError,
	cloneExp,
	isSeq,
	getOuter,
	isList,
	isSymbolFor,
	MalSeq
} from '@/mal/types'
import {getMapValue} from '@/mal/utils'
import {readStr} from '@/mal'
import {toSketchCode} from './utils'
import printExp from '@/mal/printer'
import ViewScope from '@/scopes/view'

export default function useAppCommands(
	data: {
		exp: NonReactive<MalVal>
		selectedExp: NonReactive<MalNode> | null
		editingExp: NonReactive<MalNode> | null
	},
	callbacks: {
		updateExp: (exp: NonReactive<MalVal>) => void
		setSelectedExp: (exp: NonReactive<MalNode> | null) => any
		updateSelectedExp: (val: NonReactive<MalVal>) => any
	}
) {
	AppScope.def('expand-selected', () => {
		if (data.selectedExp) {
			const expanded = expandExp(data.selectedExp.value)
			if (expanded !== undefined) {
				callbacks.updateSelectedExp(nonReactive(expanded))
			}
		}
		return null
	})

	AppScope.def('group-selected', () => {
		if (!data.selectedExp) {
			return null
		}

		const exp = data.selectedExp.value
		const newExp = L(S('g'), {}, exp)
		callbacks.updateSelectedExp(nonReactive(newExp))

		return null
	})

	AppScope.def('insert-item', (name: MalVal) => {
		const fnName = getName(name)
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

		if (data.selectedExp && isSeq(data.selectedExp.value)) {
			const newExp = cloneExp(data.selectedExp.value)
			newExp.push(L(S(fnName), ...initialParams))

			callbacks.updateSelectedExp(nonReactive(newExp))
		}

		return null
	})

	AppScope.def('load-file', (url: MalVal) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const exp = readStr(toSketchCode(code)) as MalNode
				const nonReactiveExp = nonReactive(exp)
				callbacks.updateExp(nonReactiveExp)
				callbacks.setSelectedExp(null)
				data.editingExp = nonReactiveExp
			} else {
				throw new MalError(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	AppScope.def('select-outer', () => {
		const outer = getOuter(data.selectedExp?.value)
		if (outer && outer !== data.exp?.value) {
			callbacks.setSelectedExp(nonReactive(outer))
		}
		return null
	})

	AppScope.def('wrap-selected', (wrapper: MalVal) => {
		if (!data.selectedExp) {
			throw new MalError('No selection')
		}
		if (!isList(wrapper)) {
			throw new MalError(`${printExp(wrapper)} is not a list`)
		}

		const selected = data.selectedExp.value
		let shouldDuplicate = false

		const newSelectedExp = L(
			...wrapper.map(e => {
				if (isSymbolFor(e, '%')) {
					const ret = shouldDuplicate ? cloneExp(selected, true) : selected
					shouldDuplicate = true
					return ret
				} else {
					return e
				}
			})
		)

		callbacks.updateSelectedExp(nonReactive(newSelectedExp))

		return true
	})
}
