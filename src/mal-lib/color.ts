import chroma from 'chroma-js'
import {symbolFor as S, createList as L, MalVal} from '@/mal/types'

const Exports = [
	[
		'color/mix',
		function (color1: string, color2: string, ratio: number, mode = 'lrgb') {
			return chroma.mix(color1, color2, ratio, mode as any).css()
		},
	],
	[
		'color/brighten',
		function (color: 'string', value = 1) {
			return chroma(color)
				.brighten(value as number)
				.css()
		},
	],
	[
		'color/darken',
		function (color: 'string', value = 1) {
			return chroma(color)
				.darken(value as number)
				.css()
		},
	],
] as [string, MalVal][]

const Exp = L(
	S('do'),
	...Exports.map(([sym, body]) => L(S('def'), S(sym), body))
)
;(globalThis as any)['glisp_library'] = Exp
