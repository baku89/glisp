declare module 'vue-click-outside' {
	import {DirectiveFunction} from 'vue'
	const VueClickOutside: DirectiveFunction

	export default VueClickOutside
}

declare module 'seedrandom' {
	export default function(initialSeed: any): () => number
}

declare module 'dateformat' {
	export default function(format: string): string
}

declare module 'bezier-js' {
	interface Point {
		x: number
		y: number
	}

	export default class Bezier {
		constructor(points: Point[])

		points: Point[]

		offset(d: number): Bezier[]
		split(t1: number, t2?: number): Bezier
		length(): number
		get(t: number): Point
	}
}
