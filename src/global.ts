import {scope} from './ast'

export const Global = scope({
	'+': (...xs: number[]) => xs.reduce((a, b) => a + b, 0),
	'*': (...xs: number[]) => xs.reduce((a, b) => a * b, 1),
	π: Math.PI,
	τ: Math.PI * 2,
	'°': (x: number) => (x * Math.PI) / 180,
	...Math,
})

export const GlobalEnv = {ast: Global}
