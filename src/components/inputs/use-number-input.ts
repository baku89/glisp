import {useMagicKeys} from '@vueuse/core'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'
import {computed, Ref, ref, SetupContext, watch} from 'vue'

import {unsignedMod} from '@/utils'

const VERTICAL_ARROW_KEYS = new Set(['up', 'down'])

export default function useNumber(
	value: Ref<number>,
	precision: Ref<number>,
	startValue: Ref<number>,
	tweaking: Ref<boolean>,
	pos: Ref<vec2>,
	dragEl: Ref<null | HTMLElement>,
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

	function onConfirm(e: Event) {
		const str = (e.target as HTMLInputElement).value
		const num = parseFloat(str)
		const val = isNaN(num) ? str : num
		context.emit('update:modelValue', val)
	}

	function onBlur(e: Event) {
		if (modifiedByKeyboard) {
			modifiedByKeyboard = false
			onConfirm(e)
		}
	}

	function onKeydown(e: KeyboardEvent) {
		modifiedByKeyboard = true
		const key = keycode(e)

		if (key === 'enter') {
			onConfirm(e)
		} else if (VERTICAL_ARROW_KEYS.has(key)) {
			e.preventDefault()

			let inc = 1
			if (e.altKey) {
				inc = 0.1
			} else if (e.shiftKey) {
				inc = 10
			}

			switch (key) {
				case 'up':
					context.emit('update:modelValue', value.value + inc)
					break
				case 'down':
					context.emit('update:modelValue', value.value - inc)
					break
			}
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
	}
}
