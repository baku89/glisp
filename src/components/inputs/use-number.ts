import {Ref, computed, SetupContext} from '@vue/composition-api'
import keycode from 'keycode'

const VERTICAL_ARROW_KEYS = new Set(['up', 'down'])

export function useAutoStep(
	value: Ref<number>,
	validator: Ref<undefined | ((v: number) => number | null)>,
	tweaking: Ref<boolean>,
	context: SetupContext
) {
	const displayValue = computed(() => {
		const v = value.value
		return tweaking.value ? v.toFixed(1) : v.toFixed(2).replace(/\.?[0]+$/, '')
	})

	function onInput(e: InputEvent) {
		const str = (e.target as HTMLInputElement).value
		const val: number | null = parseFloat(str)
		update(val)
	}

	function onBlur(e: InputEvent) {
		const el = e.target as HTMLInputElement
		el.value = displayValue.value
	}

	function onKeydown(e: KeyboardEvent) {
		const key = keycode(e)

		if (VERTICAL_ARROW_KEYS.has(key)) {
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

	function update(val: number) {
		if (!isFinite(val)) {
			return
		}

		if (validator.value) {
			const validatedVal = validator.value(val)
			if (
				typeof validatedVal !== 'number' ||
				isNaN(validatedVal) ||
				!isFinite(validatedVal)
			) {
				return
			}
			val = validatedVal
		}

		context.emit('input', val)
	}
	return {
		step: computed(() => {
			const float = value.value.toString().split('.')[1]
			return float !== undefined
				? Math.max(Math.pow(10, -float.length), 0.1)
				: 1
		}),
		displayValue,
		onInput,
		onBlur,
		onKeydown,
		update,
	}
}
