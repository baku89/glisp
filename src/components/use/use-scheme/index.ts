import chroma from 'chroma-js'
import _ from 'lodash'
import {reactive, ref, watchEffect} from 'vue'

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

type Colors = Exclude<Base16, 'scheme' | 'author'> & {
	frame: string // border, selection
	translucent: string // translucent panel
}

interface Scheme {
	name: string
	colors: Colors
}

function base16ToScheme(scheme: Base16): Scheme {
	const c = Object.fromEntries(
		_.toPairs(scheme).map(([k, v]) => [k, k.startsWith('base') ? '#' + v : v])
	) as Base16

	return {
		name: scheme.scheme,
		colors: {
			frame: chroma(c.base05).alpha(0.2).css(),
			translucent: chroma(c.base00).alpha(0.9).css(),
			...c,
		},
	}
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Base16List = require('./base16.yml') as Base16[]

const SchemeList = [...Base16List.map(base16ToScheme)]

export default function useScheme() {
	const colors = reactive({...SchemeList[0].colors})

	const basePreset = ref('Atlas')

	const presets = ref(SchemeList.map(sch => sch.name))

	function applyPreset(name: string) {
		const index = presets.value.indexOf(name)

		if (index === -1) {
			return
		}

		basePreset.value = name

		for (const c in colors) {
			console.log(c)
			;(colors as any)[c] = (SchemeList[index].colors as any)[c]
		}
	}

	// Set css variables to body
	watchEffect(() => {
		for (const [name, color] of _.toPairs(colors)) {
			document.body.style.setProperty(`--${name}`, color)
		}
	})

	return {
		basePreset,
		applyPreset,
		presets,
	}
}
