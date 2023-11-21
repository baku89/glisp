import {Ref} from 'vue'

import {
	applyParamModifier,
	cloneExpr,
	copyDelimiters,
	createList as L,
	deleteExp,
	expandExp,
	Expr,
	ExprColl,
	ExprMap,
	ExprSeq,
	generateExpAbsPath,
	getEvaluated,
	getExpByPath,
	getFnInfo,
	getMapValue,
	getMeta,
	getName,
	getParent,
	GlispError,
	isColl,
	isFunc,
	isList,
	isSeq,
	isSymbol,
	isSymbolFor,
	isVector,
	keywordFor as K,
	markParent,
	printExpr,
	readStr,
	replaceExpr,
	symbolFor as S,
	symbolFor,
} from '@/glisp'
import AppScope from '@/scopes/app'
import ViewScope from '@/scopes/view'

import {toSketchCode} from '../utils'

export default function useAppCommands({
	exp,
	selectedExprs,
	activeExp,
	editingExpr: editingExp,
	updateExpr,
	setActiveExpr,
	setSelectedExp,
}: {
	exp: Ref<ExprColl>
	selectedExprs: Ref<ExprColl[]>
	activeExp: Ref<ExprColl | null>
	editingExpr: Ref<ExprColl | null>
	updateExpr: (exp: ExprColl) => void
	setActiveExpr: (exp: ExprColl | null) => any
	setSelectedExp: (exp: ExprColl[]) => void
}) {
	AppScope.def('expand-selected', () => {
		if (!activeExp.value) {
			return false
		}

		const expanded = expandExp(activeExp)
		if (expanded === undefined) {
			return false
		}

		replaceExpr(activeExp.value, expanded)

		return true
	})

	AppScope.def('insert-item', (item: Expr) => {
		const _activeExp = activeExp.value ?? exp.value

		if (!isSeq(_activeExp)) {
			throw new GlispError('No insertable selection')
		}

		let newExp: ExprSeq

		if (typeof item === 'string' || isSymbol(item)) {
			const fnName = getName(item)
			const fn = ViewScope.var(fnName)
			const meta = getMeta(fn)
			const returnType =
				(getMapValue(meta, 'return/type', 'string') as string) || ''
			const initialParams =
				(getMapValue(meta, 'initial-params', 'vector') as ExprSeq) || null

			if (!isFunc(fn) || !['item', 'path'].includes(returnType)) {
				throw new GlispError(
					`${fnName} is not a function that returns item/path`
				)
			}

			if (!initialParams) {
				throw new GlispError(
					`Function ${fnName} does not have the :initial-params field`
				)
			}

			newExp = L(S(fnName), ...initialParams)
		} else if (isList(item)) {
			newExp = item
		} else {
			throw new GlispError('Invalid argument')
		}

		markParent(newExp)

		// Insert
		const newActiveExp = cloneExpr(_activeExp) as ExprSeq
		newActiveExp.push(newExp)
		copyDelimiters(newActiveExp, activeExp)

		replaceExpr(_activeExp, newActiveExp)

		return generateExpAbsPath(newExp)
	})

	AppScope.def('replace-item', (path: Expr, replaced: Expr) => {
		if (typeof path !== 'string') {
			throw new Error('Path should be string')
		}

		const original = getExpByPath(exp.value, path)

		if (!isColl(original)) {
			throw new GlispError('The original should be node')
		}

		replaceExpr(original, replaced)

		return path
	})

	AppScope.def('select-items', (paths: Expr) => {
		if (isVector(paths)) {
			const items: ExprColl[] = []

			for (const path of paths) {
				if (typeof path !== 'string') {
					return false
				}
				const item = getExpByPath(exp.value, path)
				if (!isColl(item)) {
					return false
				}
				items.push(item)
			}

			setSelectedExp(items)
		}
		return false
	})

	AppScope.def('item-selected?', (path: Expr) => {
		if (typeof path !== 'string') {
			return false
		}

		const item = getExpByPath(exp.value, path)

		if (!isColl(item)) {
			return false
		}

		const index = selectedExprs.value.findIndex(s => s === item)

		return index !== -1
	})

	AppScope.def('toggle-item-selection', (path: Expr) => {
		if (typeof path !== 'string') {
			return false
		}

		const item = getExpByPath(exp.value, path)

		if (!isColl(item)) {
			return false
		}

		const index = selectedExprs.value.indexOf(item)

		const items = [...selectedExprs.value]
		if (index === -1) {
			items.push(item)
		} else {
			items.splice(index, 1)
		}

		setSelectedExp(items)

		return true
	})

	AppScope.def('load-file', (url: Expr) => {
		fetch(url as string).then(async res => {
			if (res.ok) {
				const code = await res.text()
				const expr = readStr(toSketchCode(code)) as ExprColl
				updateExpr(expr)
				setActiveExpr(null)
				editingExp.value = expr
			} else {
				throw new GlispError(`Failed to load from "${url}"`)
			}
		})
		return null
	})

	AppScope.def('select-outer', () => {
		if (!activeExp.value) {
			throw new GlispError('No selection')
		}

		const parent = getParent(activeExp.value)

		if (!parent) {
			return false
		}

		setActiveExpr(parent)

		return true
	})

	AppScope.def('wrap-selected', (wrapper: Expr) => {
		if (!activeExp.value) {
			throw new GlispError('No selection')
		}
		if (!isList(wrapper)) {
			throw new GlispError(`${printExpr(wrapper)} is not a list`)
		}

		const exp = activeExp.value
		let shouldDuplicate = false

		const newExp = L(
			...wrapper.map(e => {
				if (isSymbolFor(e, '%')) {
					const ret = shouldDuplicate ? cloneExpr(exp, true) : exp
					shouldDuplicate = true
					return ret
				} else {
					return e
				}
			})
		)

		markParent(newExp)

		replaceExpr(activeExp.value, newExp)

		return true
	})

	AppScope.def('transform-selected', (xform: Expr) => {
		for (const exp of selectedExprs.value) {
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
				[K('transform')]: xform as Expr,
			} as ExprMap

			const modifier = transformFn(payload)
			let newParams: Expr[] | null

			if (structType) {
				newParams = modifier as ExprSeq
			} else {
				newParams = applyParamModifier(modifier, originalParams)
				if (!newParams) {
					return false
				}
			}

			const newExp = structType ? newParams[0] : L(exp[0], ...newParams)
			copyDelimiters(newExp, exp)

			replaceExpr(exp, newExp)
		}

		return true
	})

	AppScope.def('copy-selected', () => {
		if (!activeExp.value) {
			throw new GlispError('No selection')
		}

		const code = printExpr(activeExp.value)

		navigator.clipboard.writeText(code)

		return true
	})

	AppScope.def('paste-from-clipboard', () => {
		let outer: ExprSeq, index: number

		if (!activeExp.value) {
			;[outer, index] = [
				exp.value as ExprSeq,
				(exp.value as ExprSeq).length - 1,
			]
		} else {
			const [_outer, _index] = getUIOuterInfo(activeExp.value)

			if (!isSeq(_outer)) {
				return false
			}

			;[outer, index] = [_outer, _index]
		}

		const newOuter = cloneExpr(outer) as ExprSeq

		navigator.clipboard.readText().then((str: string) => {
			const exp = readStr(str)

			newOuter.splice(index + 1, 0, exp)
			copyDelimiters(newOuter, outer)

			markParent(newOuter)
			replaceExpr(outer, newOuter)

			setActiveExpr(isColl(exp) ? exp : null)
		})

		return null
	})

	AppScope.def('delete-selected', () => {
		for (const exp of selectedExprs.value) {
			deleteExp(exp)
		}

		setSelectedExp([])

		return true
	})

	AppScope.def('group-selected', () => {
		if (selectedExprs.value.length === 0) {
			return false
		}

		const [first, ...rest] = selectedExprs.value

		for (const exp of rest) {
			deleteExp(exp)
		}

		const group = L(symbolFor('g'), {} as ExprMap, first, ...rest)

		replaceExpr(first, group)

		setActiveExpr(group)

		return true
	})
}
