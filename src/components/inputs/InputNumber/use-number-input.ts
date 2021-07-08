import {useMagicKeys} from '@vueuse/core'
import {none, some} from 'fp-ts/lib/Option'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'
import _ from 'lodash'
import {computed, Ref, ref, SetupContext, watch} from 'vue'

import useModelLocalDisplay from '@/components/use/use-model-local-display'
import {Validator} from '@/lib/fp'
import {unsignedMod} from '@/utils'

const VERTICAL_ARROW_KEYS = new Set(['up', 'down'])

export default function useNumber(
	props: Readonly<{
		modelValue: number
		precision: number
		validator: Validator<number>
		updateOnBlur: boolean
	}>,
	startValue: Ref<number>,
	tweaking: Ref<boolean>,
	tweakDisabled: Ref<boolean>,
	pos: Ref<vec2>,
	dragEl: Ref<null | HTMLElement>,
	inputEl: Ref<null | HTMLInputElement>,
	emit: SetupContext<['update:modelValue']>['emit']
) {
	const {local, display, displayInvalid} = useModelLocalDisplay({
		props,
		show(v) {
			return tweakDisabled.value ? v.toString() : v.toFixed(props.precision)
		},
		read(v) {
			const num = parseFloat(v)
			return _.isFinite(num) ? some(num) : none
		},
		validate: props.validator,
		emit,
	})

	const overlayLabel = computed(() => {
		const delta = local.value - startValue.value
		return (delta > 0 ? '+' : '') + delta.toFixed(props.precision)
	})

	function onFocus() {
		tweakDisabled.value = true
	}

	function onBlur() {
		tweakDisabled.value = false
		display.confirm()
	}

	function onKeydown(e: KeyboardEvent) {
		const key = keycode(e)

		if (key === 'enter') {
			display.confirm()
		} else if (VERTICAL_ARROW_KEYS.has(key)) {
			e.preventDefault()

			const inc = e.altKey ? 0.1 : e.shiftKey ? 10 : 1
			const sign = key === 'up' ? 1 : -1

			local.set(local.value + inc * sign)
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
		local,
		display,
		displayInvalid,
		overlayLabel,
		onFocus,
		onBlur,
		onKeydown,
		tweakSpeedChanged,
		tweakSpeed,
		tweakLabelClass,
		showTweakLabel,
		labelX,
	}
}
