import chroma from 'chroma-js'
import {Ref} from 'vue'

import useSurjective from '@/components/use/use-surjective'

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

export function rgb2hsv({r, g, b}: RGB): HSV {
	const [h, s, v] = chroma.rgb(r * 255, g * 255, b * 255).hsv()
	return {h: isNaN(h) ? 0 : h / 360, s, v}
}

export function hsv2rgb({h, s, v}: HSV): RGB {
	const [r, g, b] = chroma.hsv(h * 360, s, v).rgba()
	return {r: r / 255, g: g / 255, b: b / 255}
}

export function equalColor(x: RGB, y: RGB) {
	return x.r === y.r && x.g === y.g && x.b === y.b
}

export function hsv2color({h, s, v}: HSV) {
	return chroma.hsv(h * 360, s, v).hex()
}

export default function useHSV(rgb: Ref<RGBA | RGB>) {
	const state = useSurjective(rgb, rgb2hsv, hsv2rgb, equalColor)

	return {
		hsv: state.y,
		hsv2rgb: state.inverse,
	}
}
