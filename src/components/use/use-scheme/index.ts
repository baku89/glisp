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
	translucent: string // translucent panel
}

type Colors = StaticColors & {
	highlight: string
}

function base16ToStaticColors(scheme: Base16): [string, StaticColors] {
	const c = Object.fromEntries(
		_.toPairs(scheme).map(([k, v]) => [k, k.startsWith('base') ? '#' + v : v])
	) as Base16

	return [
		scheme.scheme,
		{
			frame: chroma(c.base05).alpha(0.2).css(),
			translucent: chroma(c.base00).alpha(0.9).css(),
			...c,
		},
	]
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Base16List = require('./base16.yml') as Base16[]

const Presets = Object.fromEntries(Base16List.map(base16ToStaticColors))

export default function useScheme() {
	const colors: Colors = reactive({
		...Presets['Atlas'],
		highlight: Presets['Atlas'].base07,
	})

	const basePreset = ref('Atlas')
	const basePresetHighlight = ref('07')

	const presetNames = _.keys(Presets)

	watch(basePreset, name => {
		if (!(name in Presets)) {
			return
		}

		for (const c in colors) {
			;(colors as any)[c] = (Presets[name] as any)[c]
		}

		colors.highlight = (colors as any)['base' + basePresetHighlight.value]
	})

	watch(basePresetHighlight, name => {
		if (!(colors as any)['base' + name]) {
			return
		}

		colors.highlight = (colors as any)['base' + name]
	})

	// Set css variables to body
	watchEffect(() => {
		for (const [name, color] of _.toPairs(colors)) {
			document.body.style.setProperty(`--${name}`, color)
		}
	})

	return {
		basePreset,
		basePresetHighlight,
		presetNames,
	}
}
