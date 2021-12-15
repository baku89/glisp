declare module 'download-as-file' {
	export default function downloadAsFile(options: {
		data: string
		filename: string
	}): void
}

declare module 'query-string' {
	export function parse(search: string): Record<string, string>
}

declare module 'raw-loader!*' {
	const text: string
	export default text
}

declare module 'localeval' {
	export default function <T = any>(code: string, scope: Record<string, any>): T
}

declare module 'lines-intersection' {
	export default function (
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		y3: number,
		x3: number
	): [number, number] | null
}
