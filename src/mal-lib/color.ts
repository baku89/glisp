import chroma from 'chroma-js'
import {
	MalSymbol,
	MalList,
	MalF,
	MalFunc,
	MalString,
	MalNumber,
} from '@/mal/types'

const Exports = [
	[
		'color/mix',
		(
			color1: MalString,
			color2: MalString,
			ratio: MalNumber,
			mode = MalString.create('lrgb')
		) =>
			MalString.create(
				chroma
					.mix(color1.value, color2.value, ratio.value, mode.value as any)
					.css()
			),
	],
	[
		'color/brighten',
		(color: MalString, value = MalNumber.create(1)) =>
			MalString.create(chroma(color.value).brighten(value.value).hex()),
	],
	[
		'color/darken',
		(color: MalString, value = MalNumber.create(1)) =>
			MalString.create(chroma(color.value).darken(value.value).hex()),
	],
	[
		'color/invert',
		(color: MalString, mode = MalString.create('rgb')) => {
			const c = chroma(color.value)
			const a = c.alpha()
			if (mode.value === 'hsl') {
				const [h, s, l] = c.hsl()
				return MalString.create(
					chroma((h + 180) % 360, 1 - s, 1 - l, 'hsl').hex()
				)
			} else {
				const [r, g, b] = c.rgb()
				return MalString.create(chroma([255 - r, 255 - g, 255 - b, a]).hex())
			}
		},
	],
] as [string, any][]

const Exp = MalList.create(
	MalSymbol.create('do'),
	...Exports.map(([sym, body]) =>
		MalList.create(
			MalSymbol.create('def'),
			MalSymbol.create(sym),
			MalFunc.create(body as MalF)
		)
	)
)
;(globalThis as any)['glisp_library'] = Exp
