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

function base16ToScheme(s: Base16): Scheme {
	const base16: Partial<Base16> = {...s}
	delete base16.scheme
	delete base16.author

	return {
		name: s.scheme,
		colors: {
			background: s.base00,
			input: s.base01,
			button: s.base02,
			comment: s.base03,
			textcolor: s.base05,
			highlight: s.base0C,

			frame: chroma(s.base05).alpha(0.1).css(),
			translucent: chroma(s.base00).alpha(0.9).css(),

			error: s.base08,
			constant: s.base09,
			string: s.base0B,
			keyword: s.base0C,
			function: s.base0E,

			...s,
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
