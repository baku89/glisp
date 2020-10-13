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
		(color: MalString, value: MalNumber = MalNumber.create(1)) =>
			MalString.create(chroma(color.value).brighten(value.value).hex()),
	],
	[
		'color/darken',
		(color: MalString, value: MalNumber = MalNumber.create(1)) =>
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
] as [string, MalCallableValue][]

const Exp = MalList.fromSeq(
	MalSymbol.create('do'),
	...Exports.map(([sym, body]) =>
		MalList.fromSeq(
			MalSymbol.create('def'),
			MalSymbol.create(sym),
			MalFn.create(body)
		)
	)
)
;(globalThis as any)['glisp_library'] = Exp
