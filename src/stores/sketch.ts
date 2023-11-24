import {pausableWatch} from '@vueuse/core'
import {defineStore} from 'pinia'
import {
	computed,
	readonly,
	Ref,
	ref,
	ref as shallowRef,
	toRaw,
	watch,
} from 'vue'

import {
	Expr,
	ExprColl,
	ExprList,
	generateExpAbsPath,
	getExpByPath,
	getRangeOfExpr,
	isColl,
	isList,
	markParent,
	parse,
	printer,
	printExpr,
	replaceExpr,
	TextRange,
} from '@/glisp'
import ViewScope from '@/scopes/view'

const preText = '(sketch;__\n'
const postText = ';__\n)'

export const useSketchStore = defineStore('sketch', () => {
	const code = ref(`(style (fill "crimson")
  (circle [0 0] 100))`)

	const expr = shallowRef(
		parse(preText + code.value + postText)
	) as Ref<ExprList>

	const evaluated = computed(() => {
		return ViewScope.eval(toRaw(expr.value))
	})

	const selectedExprs = shallowRef([]) as Ref<ExprColl[]>
	const activeExpr = computed({
		get() {
			return selectedExprs.value.length === 0 ? null : selectedExprs.value[0]
		},
		set(target: ExprColl | null) {
			if (target) {
				selectedExprs.value =
					toRaw(target) !== toRaw(expr.value) ? [target] : []
			} else {
				selectedExprs.value = []
			}
		},
	})
	const hoveringExpr = shallowRef(null) as Ref<ExprColl | null>

	// Error
	const hasParseError = shallowRef(false)
	const hasEvalError = computed(() => evaluated.value === undefined)
	const hasRenderError = shallowRef(false)
	const hasError = computed(
		() => hasParseError.value || hasEvalError.value || hasRenderError.value
	)

	// Selection range
	const activeRange = computed(() => {
		return activeExpr.value ? getRange(activeExpr.value) : null
	})

	const hoveringRange = computed(() => {
		return hoveringExpr.value ? getRange(hoveringExpr.value) : null
	})

	watch(expr.value, expr => {
		if (activeExpr.value) {
			const path = generateExpAbsPath(activeExpr.value)
			const newActiveExpr = getExpByPath(expr, path)
			if (isColl(newActiveExpr)) {
				activeExpr.value = newActiveExpr
			}
		}
	})

	function getRange(target: ExprColl): TextRange | null {
		const range = getRangeOfExpr(toRaw(target), toRaw(expr.value))
		if (range) {
			return [range[0] - preText.length, range[1] - preText.length]
		} else {
			return null
		}
	}

	// Update code
	const codeWatcher = pausableWatch(code, () => {
		try {
			const parsed = parse(preText + code.value + postText)
			if (!isList(parsed)) {
				throw new Error('Not a list')
			}

			exprWatcher.pause()
			expr.value = parsed
			exprWatcher.resume()

			hasParseError.value = false
		} catch (e) {
			printer.error(e)
			hasParseError.value = true
		}
	})

	const exprWatcher = pausableWatch(expr, () => {
		const newCode = printExpr(expr.value).slice(
			preText.length,
			-postText.length
		)

		codeWatcher.pause()
		code.value = newCode
		codeWatcher.resume()
	})

	function replace(parent: ExprColl, original: Expr, replacement: Expr) {
		const newExpr = replaceExpr(
			toRaw(expr.value),
			toRaw(parent),
			toRaw(original),
			toRaw(replacement)
		)
		if (!isList(newExpr)) {
			throw new Error('Invalid replacement')
		}
		markParent(newExpr)
		expr.value = newExpr
	}

	return {
		expr: readonly(expr),
		evaluated,
		code,

		selectedExprs,
		activeExpr,
		hoveringExpr,

		hasParseError,
		hasEvalError,
		hasRenderError,
		hasError,

		activeRange,
		hoveringRange,
		getRange,

		// Modificatoin
		replace,
	}
})
