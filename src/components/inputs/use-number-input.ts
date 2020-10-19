import {Ref, computed, SetupContext} from 'vue'
import keycode from 'keycode'

const VERTICAL_ARROW_KEYS = new Set(['up', 'down'])

export default function useNumber(
	value: Ref<number>,
	startValue: Ref<number>,
	tweaking: Ref<boolean>,
	context: SetupContext
) {
	const displayValue = computed(() => {
		const v = value.value
		return tweaking.value ? v.toFixed(1) : v.toFixed(2).replace(/\.?[0]+$/, '')
	})

	const overlayLabel = computed(() => {
		const delta = value.value - startValue.value
		return (delta > 0 ? '+' : '') + delta.toFixed(1)
	})

	const step = computed(() => {
		const float = value.value.toString().split('.')[1]
		return float !== undefined ? Math.max(Math.pow(10, -float.length), 0.1) : 1
	})

	function onConfirm(e: Event) {
		const str = (e.target as HTMLInputElement).value
		const num = parseFloat(str)
		const val = isNaN(num) ? str : num
		update(val)
	}

	function onBlur(e: Event) {
		onConfirm(e)
	}

	function onKeydown(e: KeyboardEvent) {
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
					update(value.value + inc)
					break
				case 'down':
					update(value.value - inc)
					break
			}
		}
	}

	function update(val: number | string) {
		context.emit('update:modelValue', val)
	}
	return {
		step,
		displayValue,
		overlayLabel,
		onBlur,
		onKeydown,
		update,
	}
}
