import {useMagicKeys} from '@vueuse/core'
import {pipe} from 'fp-ts/lib/function'
import {chain, isSome, none, Option, some} from 'fp-ts/lib/Option'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'
import _ from 'lodash'
import {computed, Ref, ref, SetupContext, watch} from 'vue'

import useEfficientEmit from '@/components/use/use-efficient-emit'
import {Validator} from '@/lib/fp'
import {unsignedMod} from '@/utils'

const VERTICAL_ARROW_KEYS = new Set(['up', 'down'])

const read: (v: string) => Option<number> = v => {
	const num = parseFloat(v)
	return _.isFinite(num) ? some(num) : none
}

export default function useNumber(
	props: Readonly<{
		modelValue: number
		precision: number
		validator: Validator<number>
	}>,
	startValue: Ref<number>,
	tweaking: Ref<boolean>,
	pos: Ref<vec2>,
	dragEl: Ref<null | HTMLElement>,
	inputEl: Ref<null | HTMLInputElement>,
	context: SetupContext
) {
	const emit = useEfficientEmit(props, context, 'modelValue')

	const displayValue = computed(() => {
		const v = props.modelValue
		const fixed = v.toFixed(props.precision)
		return tweaking.value
			? fixed
			: fixed.replace(/\.?0+$/, '').replace(/^0\./, '.')
	})

	const overlayLabel = computed(() => {
		const delta = props.modelValue - startValue.value
		return (delta > 0 ? '+' : '') + delta.toFixed(props.precision)
	})

	const step = computed(() => {
		const float = props.modelValue.toString().split('.')[1]
		return float !== undefined ? Math.max(Math.pow(10, -float.length), 0.1) : 1
	})

	function update(val: string | number, resetInput: boolean) {
		const ret = _.isNumber(val)
			? props.validator(val)
			: pipe(some(val), chain(read), chain(props.validator))

		if (isSome(ret)) {
			emit(ret.value)
		} else {
			if (resetInput && inputEl.value) inputEl.value.value = displayValue.value
		}
	}

	function onBlur(e: InputEvent) {
		update((e.target as HTMLInputElement).value, true)
	}

	function onKeydown(e: KeyboardEvent) {
		const key = keycode(e)

		if (key === 'enter') {
			update((e.target as HTMLInputElement).value, true)
		} else if (VERTICAL_ARROW_KEYS.has(key)) {
			e.preventDefault()

			const inc = e.altKey ? 0.1 : e.shiftKey ? 10 : 1
			const sign = key === 'up' ? 1 : -1

			update(props.modelValue + inc * sign, true)
		}
	}

	const {shift, alt} = useMagicKeys()

	const tweakSpeedChanged = ref(false)

	const tweakLabelClass = computed(() =>
		shift.value ? 'fast' : alt.value ? 'slow' : ''
	)

	const tweakSpeed = computed(() => {
		if (shift.value) return 10
		if (alt.value) return 0.1
		return 1
	})

	watch(tweakSpeed, () => (tweakSpeedChanged.value = true))

	const labelX = computed(() => unsignedMod(pos.value[0], window.innerWidth))

	const showTweakLabel = computed(() => {
		if (!dragEl.value) return false

		const {left, right} = dragEl.value.getBoundingClientRect()
		return labelX.value < left || right < labelX.value
	})

	return {
		step,
		displayValue,
		overlayLabel,
		onBlur,
		onKeydown,
		tweakSpeedChanged,
		tweakSpeed,
		tweakLabelClass,
		showTweakLabel,
		labelX,
		update,
	}
}
