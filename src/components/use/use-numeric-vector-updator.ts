import {computed, Ref} from 'vue'

import {
	cloneExp,
	getEvaluated,
	isVector,
	MalSeq,
	MalSymbol,
	MalVal,
} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

/**
 * Refs and event handles for MalInputVec2, Rect2d, Mat2d
 */
export default function useNumericVectorUpdator(
	exp: Ref<MalSeq | MalSymbol>,
	emit: (event: 'input', value: MalVal) => void
) {
	const isValueSeparated = computed(() => isVector(exp.value))

	const nonReactiveValues = computed(() => {
		if (!isValueSeparated.value) {
			return []
		} else {
			return Array.from(exp.value as MalSeq)
		}
	})

	const evaluated = computed(() => getEvaluated(exp.value) as number[])

	function onInputElement(i: number, v: MalVal) {
		if (!isValueSeparated.value) {
			return
		}

		const newExp = cloneExp(exp.value as MalSeq)
		newExp[i] = v
		emit('input', newExp)
	}

	function onInputEvaluatedElement(i: number, v: number) {
		const value = cloneExp(exp.value as MalSeq)
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
