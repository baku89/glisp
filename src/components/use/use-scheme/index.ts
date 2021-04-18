import chroma from 'chroma-js'
import _ from 'lodash'
import {reactive, ref, watch, watchEffect} from 'vue'

interface Base16 {
	scheme: string
	author: string
	base00: string
	base01: string
	base02: string
	base03: string
	base04: string
	base05: string
	base06: string
	base07: string
	base08: string
	base09: string
	base0A: string
	base0B: string
	base0C: string
	base0D: string
	base0E: string
	base0F: string
}

type StaticColors = Exclude<Base16, 'scheme' | 'author'> & {
	frame: string // border, selection
}

type Colors = StaticColors & {
	accent: string
}

function base16ToStaticColors(scheme: Base16): [string, StaticColors] {
	const c = _.fromPairs(
		_.toPairs(scheme)
			.filter(([k]) => k.startsWith('base'))
			.map(([k, v]) => [k, chroma(v).css()])
	)

	const cRGB = _.fromPairs(
		_.toPairs(c).map(([k, v]) => {
			return [k + '-rgb', v.replace('rgb(', '').replace(')', '')]
		})
	)

	return [
		scheme.scheme,
		{
			frame: chroma(c.base05).alpha(0.2).css(),
			...c,
			...cRGB,
		} as StaticColors,
	]
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Base16List = require('./base16.yml') as Base16[]

const Presets = Object.fromEntries(Base16List.map(base16ToStaticColors))

export default function useScheme() {
	const initialPreset = 'Nord'

	const colors: Colors = reactive({
		...Presets[initialPreset],
		accent: Presets[initialPreset].base07,
	})

	const basePreset = ref(initialPreset)
	const baseAccentName = ref('07')

	const presetNames = _.keys(Presets)

	watch(basePreset, name => {
		if (!(name in Presets)) {
			return
		}

		for (const c in colors) {
			;(colors as any)[c] = (Presets[name] as any)[c]
		}

		colors.accent = (colors as any)['base' + baseAccentName.value]
	})

	watch(baseAccentName, name => {
		if (!(colors as any)['base' + name]) {
			return
		}

		colors.accent = (colors as any)['base' + name]
	})

	// Set css variables to body
	watchEffect(() => {
		for (const [name, color] of _.toPairs(colors)) {
			document.body.style.setProperty(`--${name}`, color)
		}
	})

	return {
		basePreset,
		baseAccentName,
		presetNames,
	}
}
