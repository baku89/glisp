import chroma from 'chroma-js'
import {
	MalSymbol,
	MalList,
	MalString,
	MalNumber,
	MalCallableValue,
	MalFn,
} from '@/mal/types'

const Exports = [
	[
		'color/mix',
		(
			color1: MalString,
			color2: MalString,
			ratio: MalNumber,
			mode = MalString.from('lrgb')
		) =>
			MalString.from(
				chroma
					.mix(color1.value, color2.value, ratio.value, mode.value as any)
					.css()
			),
	],
	[
		'color/brighten',
		(color: MalString, value: MalNumber = MalNumber.from(1)) =>
			MalString.from(chroma(color.value).brighten(value.value).hex()),
	],
	[
		'color/darken',
		(color: MalString, value: MalNumber = MalNumber.from(1)) =>
			MalString.from(chroma(color.value).darken(value.value).hex()),
	],
	[
		'color/invert',
		(color: MalString, mode = MalString.from('rgb')) => {
			const c = chroma(color.value)
			const a = c.alpha()
			if (mode.value === 'hsl') {
				const [h, s, l] = c.hsl()
				return MalString.from(
					chroma((h + 180) % 360, 1 - s, 1 - l, 'hsl').hex()
				)
			} else {
				const [r, g, b] = c.rgb()
				return MalString.from(chroma([255 - r, 255 - g, 255 - b, a]).hex())
			}
		},
	],
] as [string, MalCallableValue][]

const Exp = MalList.of(
	MalSymbol.from('do'),
	...Exports.map(([sym, body]) =>
		MalList.of(MalSymbol.from('def'), MalSymbol.from(sym), MalFn.from(body))
	)
)
;(globalThis as any)['glisp_library'] = Exp
