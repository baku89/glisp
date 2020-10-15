import chroma from 'chroma-js'
import {computed, Ref} from 'vue'

interface SchemeData {
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Schemes = require('./schemes.yml') as SchemeData[]

const SchemaNameToChroma = new Map(
	Schemes.map(sch => [sch.scheme, chroma(sch.base00)])
)
const SchemaNameToColors = Object.fromEntries(
	Schemes.map(sch => [sch.scheme, sch])
)

export default function useTheme(background: Ref<string>) {
	return {
		cssStyle: computed(() => {
			const bg = background.value

			if (!chroma.valid(bg)) {
				return {}
			}

			let minDistance = Infinity
			let schemeName: string | null = null

			for (const [name, themeColor] of SchemaNameToChroma) {
				const d = chroma.distance(bg, themeColor, 'hsv')
				if (d < minDistance) {
					minDistance = d
					schemeName = name
				}
			}

			if (!schemeName) {
				throw new Error()
			}
			const scheme = SchemaNameToColors[schemeName]

			const input = chroma.mix(scheme.base00, scheme.base01, 0.4)

			return {
				'--selection': scheme.base01,
				'--currentline': scheme.base01,
				'--bwbase': scheme.base07,
				'--syntax-constant': scheme.base09,
				'--syntax-string': scheme.base0B,

				'--comment': scheme.base03,
				'--label': scheme.base04,
				'--foreground': scheme.base05,
				'--input': input.hex(),
				'--button': scheme.base03,

				'--app-background': background,
				'--background': scheme.base00,
				'--border': scheme.base01,
				'--guide': scheme.base0D,
				'--opaque': 'red',
				'--translucent': scheme.base00,
				'--highlight': scheme.base0D,
				'--hover': scheme.base0D,
				'--warning': scheme.base08,
				'--active-range': scheme.base0D,
			}
		}),
	}
}
