import chroma from 'chroma-js'
import {Ref, ref, SetupContext, watch} from 'vue'

import {ColorDict} from './InputColorPicker.vue'

export function toRGBDict({h, s, v}: ColorDict): ColorDict {
	const [r, g, b] = chroma.hsv(h * 360, s, v).rgb()
	return {r: r / 255, g: g / 255, b: b / 255}
}

function equalColor(x: ColorDict, y: ColorDict) {
	return x.r === y.r && x.g === y.g && x.b === y.b
}

export function toCSSColor({h, s, v}: ColorDict) {
	return chroma.hsv(h * 360, s, v).css()
}

export default function useHSV(
	modelValue: Ref<ColorDict>,
	context: SetupContext<'update:modelValue'[]>
) {
	const hsv = ref<ColorDict>({h: 0, s: 1, v: 1})

	// Update hsv
	watch(
		() => modelValue.value,
		() => {
			if (equalColor(modelValue.value, toRGBDict(hsv.value))) {
				return
			}

			const {r, g, b} = modelValue.value
			const [h, s, v] = chroma(r * 255, g * 255, b * 255).hsv()

			hsv.value = {
				h: isNaN(h) ? hsv.value.h : h / 360,
				s,
				v,
			}
		},
		{immediate: true}
	)

	function update(newHSV: ColorDict) {
		hsv.value = newHSV
		const newDict = toRGBDict(newHSV)
		context.emit('update:modelValue', newDict)
	}

	return {
		hsv,
		update,
	}
}
