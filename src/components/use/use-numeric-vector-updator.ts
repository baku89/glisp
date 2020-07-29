import {Ref, computed, SetupContext} from '@vue/composition-api'
import {MalVal, getEvaluated, MalSeq, MalSymbol, isVector} from '@/mal/types'
import {reverseEval} from '@/mal/utils'
import {NonReactive, nonReactive} from '@/utils'

/**
 * Refs and event handles for MalInputVec2, Rect2d, Mat2d
 */
export default function useNumericVectorUpdator(
	exp: Ref<NonReactive<MalSeq | MalSymbol>>,
	context: SetupContext
) {
	const isValueSeparated = computed(() => isVector(exp.value.value))

	const nonReactiveValues = computed(() => {
		if (!isValueSeparated.value) {
			return []
		} else {
			return Array.from(exp.value.value as MalSeq).map(nonReactive)
		}
	})

	const evaluated = computed(() => getEvaluated(exp.value.value) as number[])

	function onInputElement(i: number, v: NonReactive<MalVal>) {
		if (!isValueSeparated.value) {
			return
		}

		const newExp = [...(exp.value.value as MalSeq)]
		newExp[i] = v.value
		context.emit('input', nonReactive(newExp))
	}

	function onInputEvaluatedElement(i: number, v: number) {
		const value = [...evaluated.value]
		value[i] = v
		const newExp = reverseEval(value, exp.value.value)
		context.emit('input', nonReactive(newExp))
	}

	return {
		nonReactiveValues,
		isValueSeparated,
		evaluated,
		onInputElement,
		onInputEvaluatedElement,
	}
}
