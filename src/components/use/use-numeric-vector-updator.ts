import {Ref, computed, SetupContext} from 'vue'
import {MalVal, MalSeq, MalSymbol, MalVector} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

/**
 * Refs and event handles for MalInputVec2, Rect2d, Mat2d
 */
export default function useNumericVectorUpdator(
	exp: Ref<MalSeq | MalSymbol>,
	context: SetupContext
) {
	const isValueSeparated = computed(() => MalVector.is(exp.value))

	const nonReactiveValues = computed(() => {
		if (!isValueSeparated.value) {
			return []
		} else {
			return Array.from(exp.value as MalSeq)
		}
	})

	const evaluated = computed(() => exp.value.evaluated as number[])

	function onInputElement(i: number, v: MalVal) {
		if (!isValueSeparated.value) {
			return
		}

		const newExp = exp.value.evaluated as MalSeq
		newExp[i] = v
		context.emit('input', newExp)
	}

	function onInputEvaluatedElement(i: number, v: number) {
		const value = exp.value.evaluated as MalSeq
		value[i] = v
		const newExp = reverseEval(value, exp.value)
		context.emit('input', newExp)
	}

	return {
		nonReactiveValues,
		isValueSeparated,
		evaluated,
		onInputElement,
		onInputEvaluatedElement,
	}
}
