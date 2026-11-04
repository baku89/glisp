/** What a shape looks like as a tool, and as the function that makes it. */
export const SHAPE_ICONS = {
	circle: 'ph:circle',
	ellipse: 'mdi:ellipse-outline',
	rect: 'ph:rectangle',
	square: 'ph:square',
	ngon: 'ph:pentagon',
	star: 'ph:star',
	roundRect: 'stroke:M7 6h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z',
	superellipse: 'stroke:M12 4C18.5 4 20 5.5 20 12S18.5 20 12 20 4 18.5 4 12 5.5 4 12 4z',
	capsule: 'ph:pill',
	fan: 'stroke:M2.36 8.51A15 15 0 0 1 21.64 8.51L15.86 15.4A6 6 0 0 0 8.14 15.4Z',
	spiral: 'ph:spiral',
	clothoid: 'stroke:M3 20C10 20 17 19 20 13 22 8 18 4 14 6 10 8 11 13 15 13',
} as const

const FUNCTION_ICONS: Readonly<Record<string, string>> = {
	...Object.fromEntries(Object.entries(SHAPE_ICONS).map(([name, icon]) => [`path.${name}`, icon])),
	'path.ellipseFromFoci': SHAPE_ICONS.ellipse,
	'path.d': 'ph:path',
	'path.line': 'ph:line-segment',
	'path.polyline': 'ph:line-segments',
	'path.polygon': 'ph:polygon',
	'path.arc': 'stroke:M4 17A9 9 0 0 1 20 17',
	'path.cubic': 'ph:bezier-curve',
	'path.transform': 'ph:bounding-box',
	style: 'ph:paint-brush',
	background: 'ph:paint-bucket',
	'mat2d.translate': 'ph:arrows-out-cardinal',
	'mat2d.rotate': 'ph:arrow-clockwise',
	'mat2d.scale': 'ph:arrows-out',
	'mat2d.mul': 'mdi:matrix',
	'color.rgb': 'ph:palette',
	'color.hsl': 'ph:palette',
	'color.gray': 'ph:circle-half',
	'color.alpha': 'mdi:opacity',
	'color.mix': 'ph:intersect',
	'color.brighten': 'ph:sun',
	'color.darken': 'ph:moon',
	'color.invert': 'mdi:invert-colors',
}

/** The icon of a function, as its head is written, if it has one here. */
export const iconOfFunction = (fn: string): string | null => FUNCTION_ICONS[fn] ?? null
