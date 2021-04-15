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
	const textcolor = scheme.base05
	const background = scheme.base00

	const base16: Partial<Base16> = {...scheme}
	delete base16.scheme
	delete base16.author

	return {
		name: scheme.scheme,
		colors: {
			background: background,
			input: scheme.base01,
			button: scheme.base02,
			comment: scheme.base03,
			textcolor: textcolor,

			frame: chroma(textcolor).alpha(0.1).css(),
			translucent: chroma(background).alpha(0.9).css(),

			error: scheme.base08,
			constant: scheme.base09,
			string: scheme.base0B,
			keyword: scheme.base0C,
			function: scheme.base0E,

			...scheme,
		},
	}
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Base16List = require('./base16.yml') as Base16[]

const SchemeList = [...Base16List.map(base16ToScheme)]

export default function useScheme() {
	const name = ref('Default Light')

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
	}
}
