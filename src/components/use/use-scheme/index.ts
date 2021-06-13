import {useLocalStorage} from '@vueuse/core'
import chroma from 'chroma-js'
import _ from 'lodash'
import {computed, provide, reactive, watch, watchEffect} from 'vue'

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

type StaticColors = Exclude<Base16, 'scheme' | 'author'>

type Colors = StaticColors & {
	accent: string
}

function base16ToStaticColors(scheme: Base16): [string, StaticColors] {
	const c = _.fromPairs(
		_.toPairs(scheme)
			.filter(([k]) => k.startsWith('base'))
			.map(([k, v]) => [k, chroma(v).rgb().join(',')])
	)

	return [scheme.scheme, (c as any) as StaticColors]
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Base16List = require('./base16.yml') as Base16[]

const Presets = Object.fromEntries(Base16List.map(base16ToStaticColors))

export default function useScheme() {
	const basePreset = useLocalStorage('uiBasePreset', 'Nord')
	const baseAccentName = useLocalStorage('uiBaseAccentName', '07')

	const colors: Colors = reactive({
		...Presets[basePreset.value],
		accent: '0,0,0',
	})

	const presetNames = _.keys(Presets)

	watch(
		basePreset,
		name => {
			if (!(name in Presets)) {
				return
			}

			for (const c in colors) {
				;(colors as any)[c] = (Presets[name] as any)[c]
			}

			colors.accent = (colors as any)['base' + baseAccentName.value]
		},
		{immediate: true}
	)

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

	const colorsHex = computed(() =>
		_.mapValues(colors, c => chroma(`rgb(${c})`).hex())
	)

	provide('scheme', colorsHex)

	return {
		basePreset,
		baseAccentName,
		presetNames,
	}
}
