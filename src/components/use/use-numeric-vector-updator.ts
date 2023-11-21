import {computed, Ref} from 'vue'

import {
	cloneExpr,
	getEvaluated,
	isVector,
	ExprSeq,
	ExprSymbol,
	Expr,
} from '@/glisp/types'
import {reverseEval} from '@/glisp/utils'

/**
 * Refs and event handles for ExprInputVec2, Rect2d, Mat2d
 */
export default function useNumericVectorUpdator(
	exp: Ref<ExprSeq | ExprSymbol>,
	emit: (event: 'input', value: Expr) => void
) {
	const isValueSeparated = computed(() => isVector(exp.value))

	const nonReactiveValues = computed(() => {
		if (!isValueSeparated.value) {
			return []
		} else {
			return Array.from(exp.value as ExprSeq)
		}
	})

	const evaluated = computed(() => getEvaluated(exp.value) as number[])

	function onInputElement(i: number, v: Expr) {
		if (!isValueSeparated.value) {
			return
		}

		const newExp = cloneExpr(exp.value as ExprSeq)
		newExp[i] = v
		emit('input', newExp)
	}

	function onInputEvaluatedElement(i: number, v: number) {
		const value = cloneExpr(exp.value as ExprSeq)
		value[i] = v
		const newExp = reverseEval(value, exp.value)
		emit('input', newExp)
	}

	return {
		nonReactiveValues,
		isValueSeparated,
		evaluated,
		onInputElement,
		onInputEvaluatedElement,
	}
}
