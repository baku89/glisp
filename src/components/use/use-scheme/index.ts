import chroma from 'chroma-js'
import {computed, ref, watch, shallowRef, watchEffect} from 'vue'

interface SchemeBase16 {
	scheme: string
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

interface SchemeGogh {
	name: string
	foreground: string
	background: string
	cursorColor: string
	black: string
	red: string
	green: string
	yellow: string
	blue: string
	purple: string
	cyan: string
	white: string
	brightBlack: string
	brightRed: string
	brightGreen: string
	brightYellow: string
	brightBlue: string
	brightPurple: string
	brightCyan: string
	brightWhite: string
}

interface Scheme {
	name: string
	chroma: chroma.Color
	cssStyle: {
		// Grayish colors
		background: string
		input: string // bg for input
		button: string // buton
		comment: string
		textcolor: string

		// ALpha
		frame: string // border, selection
		translucent: string // translucent panel

		// Syntax colors
		error: string
		constant: string
		string: string
		keyword: string
		function: string
	}
	colors: {hue: number; css: string}[]
}

function base16ToScheme(scheme: SchemeBase16): Scheme {
	const textcolor = scheme.base05
	const background = scheme.base00

	return {
		name: scheme.scheme,
		chroma: chroma(background),
		cssStyle: {
			background: background,
			input: scheme.base01,
			button: scheme.base03,
			comment: scheme.base03,
			textcolor: textcolor,

			frame: chroma(textcolor).alpha(0.1).css(),
			translucent: chroma(background).alpha(0.9).css(),

			error: scheme.base08,
			constant: scheme.base09,
			string: scheme.base0B,
			keyword: scheme.base0C,
			function: scheme.base0E,
		},

		colors: [
			scheme.base08,
			scheme.base09,
			scheme.base0A,
			scheme.base0B,
			scheme.base0C,
			scheme.base0D,
			scheme.base0E,
			scheme.base0F,
		].map(c => {
			const hue = chroma(c).hsl()[0]
			return {
				hue: isNaN(hue) ? 240 : hue,
				css: c,
			}
		}),
	}
}

function goghToScheme(scheme: SchemeGogh): Scheme {
	const background = chroma(scheme.background)
	const textcolor = chroma(scheme.foreground)

	const darkColors = [
		scheme.red,
		scheme.yellow,
		scheme.green,
		scheme.cyan,
		scheme.blue,
		scheme.purple,
	]

	// const brightColors = [
	// 	scheme.brightRed,
	// 	scheme.brightYellow,
	// 	scheme.brightGreen,
	// 	scheme.brightCyan,
	// 	scheme.brightBlue,
	// 	scheme.brightPurple,
	// ]

	// const colors = darkColors.map((dark, i) => {
	// 	const bright = brightColors[i]

	// 	return chroma.contrast(dark, background) >
	// 		chroma.contrast(bright, background)
	// 		? dark
	// 		: bright
	// })

	return {
		name: scheme.name,
		chroma: background,
		cssStyle: {
			background: background.css(),
			input: chroma.mix(background, textcolor, 0.1).css(),
			button: chroma.mix(background, textcolor, 0.2).css(),
			comment: chroma.mix(background, textcolor, 0.5).css(),
			textcolor: textcolor.css(),

			frame: textcolor.alpha(0.1).css(),
			translucent: background.alpha(0.9).css(),

			error: scheme.red,
			constant: chroma.mix(scheme.red, scheme.yellow, 0.5).css(),
			string: scheme.green,
			keyword: scheme.cyan,
			function: scheme.purple,
		},

		colors: darkColors.map(c => {
			const hue = chroma(c).hsl()[0]
			return {
				hue: isNaN(hue) ? 240 : hue,
				css: c,
			}
		}),
	}
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SchemeBase16List = require('./base16.yml') as SchemeBase16[]

// eslint-disable-next-line @typescript-eslint/no-var-requires
const SchemeGoghList = require('./gogh.json') as SchemeGogh[]

const SchemeList = [
	...SchemeBase16List.map(base16ToScheme),
	...SchemeGoghList.map(goghToScheme),
]

function findMax<T>(
	array: IterableIterator<T> | T[],
	predicate: (element: T) => number
): T {
	let maxScore = -Infinity
	let maxElement: T | undefined

	for (const element of array) {
		const score = predicate(element)
		if (maxScore <= score) {
			maxScore = score
			maxElement = element
		}
	}

	if (maxElement === undefined) {
		throw new Error('Cannot find max')
	}

	return maxElement
}

function angleBetween(target: number, source: number) {
	function mod(a: number, n: number) {
		return ((a % n) + n) % n
	}

	const ret = target - source
	return Math.abs(mod(ret + 180, 360) - 180)
}

export default function useScheme() {
	const background = ref('#f8f8f8')

	const backgroundChroma = shallowRef(chroma(background.value))

	watchEffect(() => {
		if (!chroma.valid(background.value)) return
		backgroundChroma.value = chroma(background.value)
	})

	const currentScheme = computed(() => {
		const bg = backgroundChroma.value

		// Find The nearest
		return findMax(SchemeList, sch => {
			return -chroma.distance(bg, sch.chroma)
		})
	})

	const name = computed(() => currentScheme.value.name)

	const colors = computed(() => {
		// Generate Dynamic Color
		let appBgHue = backgroundChroma.value.hsl()[0]
		if (isNaN(appBgHue)) appBgHue = 240

		const colors = currentScheme.value.colors

		const highlight = findMax(colors, color => {
			return -angleBetween(appBgHue, color.hue)
		}).css

		const guide = findMax(colors, color => {
			return angleBetween(appBgHue, color.hue)
		}).css

		return {
			...currentScheme.value.cssStyle,
			highlight: highlight,
			guide: guide,
		}
	})

	const cssStyle = computed(() => {
		return {
			'--app-background': backgroundChroma.value.css(),
			...Object.fromEntries(
				Object.entries(colors.value).map(([name, value]) => [
					`--${name}`,
					value,
				])
			),
		}
	})

	// Set css variables to body
	watchEffect(() => {
		for (const [name, color] of Object.entries(colors.value)) {
			document.body.style.setProperty(`--${name}`, color)
		}
	})

	return {
		name,
		background,
		colors,
	}
}
