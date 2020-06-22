import chroma from 'chroma-js'

window.chroma = chroma

export const BRIGHT_COLORS = {
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

export const DARK_COLORS = {
	'--currentline': '#282a2e',
	'--selection': '#373b41',
	'--foreground': '#c5c8c6',
	'--comment': '#969896',
	'--red': '#cc6666',
	'--orange': '#de935f',
	'--yellow': '#f0c674',
	'--green': '#b5bd68',
	'--aqua': '#8abeb7',
	'--blue': '#81a2be',
	'--purple': '#b294bb'
}

export interface Theme {
	dark: boolean
	colors: {
		[k: string]: string
	}
}

export function isValidColorString(str: string) {
	try {
		chroma(str)
	} catch (_) {
		return false
	}
	return true
}

function withOpacity(color: chroma.Color, opacity: number) {
	const rgba = color.rgba()
	rgba[3] = opacity
	return `rgba(${rgba.join(',')})`
}

export function computeTheme(background: string): Theme {
	const bg = chroma(background)
	const dark = bg.get('lab.l') < 60
	const colors = dark ? DARK_COLORS : BRIGHT_COLORS

	const border = withOpacity(chroma(dark ? 'white' : 'black'), 0.2)
	const translucent = withOpacity(bg, 0.8)

	return {
		dark,
		colors: {
			...colors,
			'--background': background,
			'--border': border,
			'--translucent': translucent
		}
	}
}
