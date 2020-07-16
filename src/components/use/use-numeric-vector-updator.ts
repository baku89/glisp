import {Ref, computed, SetupContext} from '@vue/composition-api'
import {MalVal, isVector, getEvaluated, MalSeq} from '@/mal/types'
import {reverseEval} from '@/mal/utils'

/**
 * Refs and event handles for MalInputVec2, Rect2d, Mat2d
 */
export default function useNumericVectorUpdator(
	exp: Ref<MalVal>,
	context: SetupContext
) {
	const isValueSeparated = computed(() => isVector(exp.value))

	const evaluated = computed(() => {
		return getEvaluated(exp.value) as number[]
	})

	function onInputElement(i: number, v: MalVal) {
		const value = [...(exp.value as MalSeq)]
		value[i] = v
		context.emit('input', value)
	}

	function onInputEvaluatedElement(i: number, v: number) {
		const value = [...evaluated.value]
		value[i] = v
		const newExp = reverseEval(value, exp.value)
		context.emit('input', newExp)
	}

	return {isValueSeparated, evaluated, onInputElement, onInputEvaluatedElement}
}
