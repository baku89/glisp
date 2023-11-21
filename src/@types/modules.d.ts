declare module 'vue-click-outside' {
	import {DirectiveFunction} from 'vue'
	const VueClickOutside: DirectiveFunction

	export default VueClickOutside
}

declare module 'seedrandom' {
	export default function (initialSeed: any): () => number
}

declare module 'dateformat' {
	export default function (format: string): string
}

declare module 'sprintf-js' {
	export function vsprintf(format: string, args: any[]): string
}

declare module 'resize-sensor' {
	export default class ResizeSensor {
		constructor(el: HTMLElement, callback: () => any)
		public detach(): any
	}
}

declare module 'vue-markdown' {
	export const VueMarkdown: any
	export default VueMarkdown
}

declare module 'vue-color' {
	export const Chrome: any
}

declare module 'vue-popperjs' {
	const Popper: any
	export default Popper
}

declare module 'canvas2svg' {
	export default class Canvas2Svg extends CanvasRenderingContext2D {
		constructor(width: number, height: number)
		public getSerializedSvg(flag: boolean): string
	}
}

declare module 'hull.js' {
	export default function hull(
		points: [number, number][],
		concavity?: number
	): [number, number][]
}

declare module 'voronoi' {
	export interface BBox {
		xl: number
		xr: number
		yt: number
		yb: number
	}

	export interface Vertex {
		x: number
		y: number
	}

	export interface Site extends Vertex {
		voronoiId: number
	}

	export interface Edge {
		va: Vertex
		vb: Vertex
	}

	export interface Cell {
		closedMe: boolean
		halfedges: {
			site: Vertex
			edge: Edge
		}[]
		site: Site
	}

	export interface Diagram {
		cells: Cell[]
		edges: Edge[]
	}

	export default class Voronoi {
		public compute(sites: Vertex[], bbox: BBox): Diagram
	}
}

declare module 'delaunator' {
	export default class Delaunator {
		public triangles: number[]
		static from(points: [number, number][]): Delaunator
	}
}

declare module 'css-color-names' {
	const csscolor: {[name: string]: string}
	export default csscolor
}

declare module 'splitpanes' {
	export const Splitpanes: any
	export const Pane: any
}

declare module 'gif.js' {
	export default class GIF {
		constructor(options: any)

		public addFrame(image: HTMLImageElement, options: any): void
		public on(type: string, callback: (blob: Blob) => any): void
		public render(): void
	}
}
