import chroma from 'chroma-js'
import {Ref, ref, watch} from 'vue'

export type HSV = {h: number; s: number; v: number}
export type HSVA = HSV & {a: number}
export type RGB = {r: number; g: number; b: number}
export type RGBA = RGB & {a: number}

export function color2rgba(value: string, useAlpha: boolean): RGBA | null {
	const dict: RGBA = {r: 1, g: 1, b: 1, a: 1}

	if (!chroma.valid(value)) {
		return null
	}

	const c = chroma(value)

	const [r, g, b] = c.rgb()
	dict.r = r / 255
	dict.g = g / 255
	dict.b = b / 255

	if (useAlpha) {
		dict.a = c.alpha()
	}

	return dict
}

export function rgba2color(dict: RGBA, useAlpha: boolean): string {
	const c = chroma(
		dict.r * 255 ?? 0,
		dict.g * 255 ?? 0,
		dict.b * 255 ?? 0
	).alpha(useAlpha ? dict.a : 1)
	return c.hex()
}

export function hsv2rgb({h, s, v}: HSV): RGB {
	const [r, g, b] = chroma.hsv(h * 360, s, v).rgba()
	return {r: r / 255, g: g / 255, b: b / 255}
}

function equalColor(x: RGB, y: RGB) {
	return x.r === y.r && x.g === y.g && x.b === y.b
}

export function hsv2color({h, s, v}: HSV) {
	return chroma.hsv(h * 360, s, v).hex()
}

export default function useHSV(modelValue: Ref<RGBA | RGB>) {
	const hsv = ref<HSV>({h: 0, s: 1, v: 1})

	// Update hsv
	watch(
		() => modelValue.value,
		() => {
			if (equalColor(modelValue.value, hsv2rgb(hsv.value))) {
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

	return {
		hsv,
	}
}
