import {useMagicKeys} from '@vueuse/core'
import {pipe} from 'fp-ts/lib/function'
import {
	chain,
	fromNullableK,
	isSome,
	none,
	Option,
	some,
} from 'fp-ts/lib/Option'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'
import _ from 'lodash'
import {computed, Ref, ref, SetupContext, watch} from 'vue'

import {unsignedMod} from '@/utils'

const VERTICAL_ARROW_KEYS = new Set(['up', 'down'])

export default function useNumber(
	value: Ref<number>,
	precision: Ref<number>,
	validator: Ref<(v: number) => number | null>,
	startValue: Ref<number>,
	tweaking: Ref<boolean>,
	pos: Ref<vec2>,
	dragEl: Ref<null | HTMLElement>,
	inputEl: Ref<null | HTMLInputElement>,
	context: SetupContext
) {
	let modifiedByKeyboard = false

	const displayValue = computed(() => {
		const v = value.value
		const fixed = v.toFixed(precision.value)
		return tweaking.value
			? fixed
			: fixed.replace(/\.?0+$/, '').replace(/^0\./, '.')
	})

	const overlayLabel = computed(() => {
		const delta = value.value - startValue.value
		return (delta > 0 ? '+' : '') + delta.toFixed(precision.value)
	})

	const step = computed(() => {
		const float = value.value.toString().split('.')[1]
		return float !== undefined ? Math.max(Math.pow(10, -float.length), 0.1) : 1
	})

	const read: (v: string) => Option<number> = v => {
		const num = parseFloat(v)
		return _.isFinite(num) ? some(num) : none
	}
	const validate = computed(() => fromNullableK(validator.value))

	function update(val: string | number, resetInput: boolean) {
		const ret = _.isNumber(val)
			? validate.value(val)
			: pipe(some(val), chain(read), chain(validate.value))

		if (isSome(ret)) {
			context.emit('update:modelValue', ret.value)
		} else {
			if (resetInput && inputEl.value) inputEl.value.value = displayValue.value
		}
	}

	function onBlur(e: InputEvent) {
		if (modifiedByKeyboard) {
			modifiedByKeyboard = false
			update((e.target as HTMLInputElement).value, true)
		}
	}

	function onKeydown(e: KeyboardEvent) {
		modifiedByKeyboard = true
		const key = keycode(e)

		if (key === 'enter') {
			update((e.target as HTMLInputElement).value, true)
		} else if (VERTICAL_ARROW_KEYS.has(key)) {
			e.preventDefault()

			const inc = e.altKey ? 0.1 : e.shiftKey ? 10 : 1
			const sign = key === 'up' ? 1 : -1

			update(value.value + inc * sign, true)
		}
	}

	const {shift, alt} = useMagicKeys()
	watch([shift, alt], () => (tweakSpeedChanged.value = true))

	const tweakSpeedChanged = ref(false)

	const tweakLabelClass = computed(() =>
		shift.value ? 'fast' : alt.value ? 'slow' : ''
	)

	const tweakSpeed = computed(() => {
		if (shift.value) return 10
		if (alt.value) return 0.1
		return 1
	})
	const labelX = computed(() => unsignedMod(pos.value[0], window.innerWidth))

	const showTweakLabel = computed(() => {
		if (!dragEl.value) return false

		const {left, right} = dragEl.value.getBoundingClientRect()
		return labelX.value < left || right < labelX.value
	})

	watch(
		() => tweaking,
		() => {
			if (tweaking.value === false) {
				modifiedByKeyboard = false
			}
		}
	)

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
