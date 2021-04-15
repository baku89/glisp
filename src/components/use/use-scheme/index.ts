import chroma from 'chroma-js'
import _ from 'lodash'
import {computed, ref, watchEffect} from 'vue'

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

interface Scheme {
	name: string
	colors: Exclude<Base16, 'scheme' | 'author'> & {
		// Named colors

		// Grayish colors
		background: string
		input: string // bg for input
		button: string // buton
		comment: string
		textcolor: string
		highlight: string

		// With alpha
		frame: string // border, selection
		translucent: string // translucent panel

		// Syntax highlights
		error: string
		constant: string
		string: string
		keyword: string
		function: string
	}
}

function base16ToScheme(scheme: Base16): Scheme {
	const c = Object.fromEntries(
		_.toPairs(scheme).map(([k, v]) => [k, k.startsWith('base') ? '#' + v : v])
	) as Base16

	return {
		name: scheme.scheme,
		colors: {
			background: c.base00,
			input: c.base01,
			button: c.base02,
			comment: c.base03,
			textcolor: c.base05,
			highlight: c.base0C,

			frame: chroma(c.base05).alpha(0.1).css(),
			translucent: chroma(c.base00).alpha(0.9).css(),

			error: c.base08,
			constant: c.base09,
			string: c.base0B,
			keyword: c.base0C,
			function: c.base0E,

			...c,
		},
	}
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Base16List = require('./base16.yml') as Base16[]

const SchemeList = [...Base16List.map(base16ToScheme)]

export default function useScheme() {
	const name = ref('Atlas')

	const schemeList = ref(SchemeList.map(sch => sch.name))

	const scheme = computed(
		() => SchemeList.find(sch => sch.name === name.value) || SchemeList[0]
	)

	// Set css variables to body
	watchEffect(() => {
		for (const [name, color] of _.toPairs(scheme.value.colors)) {
			document.body.style.setProperty(`--${name}`, color)
		}
	})

	return {
		name,
		schemeList,
	}
}
