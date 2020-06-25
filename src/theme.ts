import chroma from 'chroma-js'
import {vec2} from 'gl-matrix'

const TOMORROW = {
	'--currentline': '#efefef',
	'--selection': '#d6d6d6',
	'--foreground': '#4d4d4c',
	'--comment': '#8e908c',
	'--red': '#c82829',
	'--orange': '#f5871f',
	'--yellow': '#eab700',
	'--green': '#718c00',
	'--aqua': '#3e999f',
	'--blue': '#4271ae',
	'--purple': '#8959a8'
}

// const TOMORROW_NIGHT = {
// 	'--currentline': '#282a2e',
// 	'--selection': '#373b41',
// 	'--foreground': '#c5c8c6',
// 	'--comment': '#969896',
// 	'--red': '#cc6666',
// 	'--orange': '#de935f',
// 	'--yellow': '#f0c674',
// 	'--green': '#b5bd68',
// 	'--aqua': '#8abeb7',
// 	'--blue': '#81a2be',
// 	'--purple': '#b294bb'
// }

const TOMORROW_NIGHT_BRIGHT = {
	'--background': '#000000',
	'--currentline': '#2a2a2a',
	'--selection': '#424242',
	'--foreground': '#eaeaea',
	'--comment': '#969896',
	'--red': '#d54e53',
	'--orange': '#e78c45',
	'--yellow': '#e7c547',
	'--green': '#b9ca4a',
	'--aqua': '#70c0b1',
	'--blue': '#7aa6da',
	'--purple': '#c397d8'
}

// const TOMORROW_NIGHT_EIGHTIES = {
// 	'--background': '#2d2d2d',
// 	'--currentline': '#393939',
// 	'--selection': '#515151',
// 	'--foreground': '#cccccc',
// 	'--comment': '#999999',
// 	'--red': '#f2777a',
// 	'--orange': '#f99157',
// 	'--yellow': '#ffcc66',
// 	'--green': '#99cc99',
// 	'--aqua': '#66cccc',
// 	'--blue': '#6699cc',
// 	'--purple': '#cc99cc'
// }

export interface Theme {
	dark: boolean
	colors: {
		[k: string]: string
	}
}

export function isValidColorString(str: string) {
	return chroma.valid(str)
}

export function computeTheme(background: string): Theme {
	function fit(
		value: number,
		min0: number,
		max0: number,
		min1: number,
		max1: number
	) {
		const t = (value - min0) / (max0 - min0)
		const lerped = min1 + (max1 - min1) * t
		return Math.max(
			Math.min(min1, max1),
			Math.min(Math.max(min1, max1), lerped)
		)
	}

	let bg = chroma(background)
	const [, s, v] = bg.hsv()
	const dark = bg.get('lab.l') < 55
	const colors = dark ? TOMORROW_NIGHT_BRIGHT : TOMORROW

	const border = chroma(dark ? 'white' : 'black')
		.alpha(0.1)
		.css()
	const guide = chroma(dark ? 'white' : 'black')
		.alpha(fit(s, 0, 1, 0.3, 0.9))
		.css()

	// .alpha(fit(s, 0, 1, 0.2, 0.4))
	// .css()

	const t = fit(vec2.dist([0, 1], [s, v]), 0, 0.4, 1, 0.2)
	const activeRange = chroma
		.mix(dark ? colors['--blue'] : 'white', colors['--yellow'], t, 'hsv')
		.alpha(fit(s, 0, 1, 0.2, 0.4))
		.css()

	// If the bg is too saturated, set the translucent to grayish color
	{
		const dist = Math.sqrt(Math.pow(1 - s, 2) + Math.pow(1 - v, 2))
		const t = fit(dist, 0, 0.5, 2, 0) * (dark ? -1 : 1)

		if (t !== 0) {
			bg = bg.brighten(t)
		}
	}

	// Grayish theme
	let comment: chroma.Color | string = chroma(colors['--comment'])
	let foreground: chroma.Color | string = chroma(colors['--foreground'])
	let purple: chroma.Color | string = chroma(colors['--purple'])
	let orange: chroma.Color | string = chroma(colors['--orange'])
	const yellow: chroma.Color | string = chroma(colors['--yellow'])

	{
		const c = chroma.contrast('#8a8a8a', bg)
		const t = fit(c, 0, 2, 1, 0)
		const signed = t * (dark ? -1 : 1)
		if (t !== 0) {
			comment = comment.darken(signed * 3)
			foreground = foreground.darken(signed * 2)
			purple = purple.saturate(Math.abs(signed * 2)).darken(signed)
			orange = chroma.mix(orange.saturate(t), yellow.darken(signed * 4), t)
		}
	}
	comment = comment.css()
	foreground = foreground.css()
	purple = purple.css()
	orange = orange.css()

	// Compute highlighting color
	let highlight: string, hover: string
	if (chroma.contrast(colors['--blue'], bg) < 2.5) {
		highlight = colors['--yellow']
		hover = colors['--yellow']
	} else {
		highlight = colors['--blue']
		hover = colors['--aqua']
	}

	// Set translucent
	const translucent = bg.alpha(0.8).css()

	return {
		dark,
		colors: {
			...colors,

			// For UI
			'--comment': comment,
			'--foreground': foreground,
			'--purple': purple,
			'--orange': orange,

			'--background': background,
			'--border': border,
			'--guide': guide,
			'--translucent': translucent,
			'--highlight': highlight,
			'--hover': hover,
			'--warning': colors['--red'],
			'--active-range': activeRange,

			// For syntax highlighting
			'--syntax-keyword': colors['--aqua'],
			'--syntax-comment': comment,
			'--syntax-constant': orange,
			'--syntax-string': colors['--green'],
			'--syntax-function': purple
		}
	}
}
