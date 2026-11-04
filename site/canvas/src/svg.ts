/**
 * What goes between a canvas and everything else: SVG. A selection is written as what
 * it comes to, with the code it comes from in its metadata, so that anywhere else gets a
 * drawing and a canvas gets the program back. An SVG from elsewhere becomes bindings.
 */

import { type AST, type Env } from '@glisp/lang'
import { copiedRows } from '@glisp/tweeq/rowsClipboard'
import { bounds } from 'pave/path/metrics'
import { toD } from 'pave/path/svg'

import { type Path } from './graphics'
import { sceneOf } from './scene'

const NAMESPACE = 'https://glisp.app/canvas'
const STROKE_WIDTH = 1.5
const MARGIN = 2

const escaped = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const unescaped = (text: string): string =>
	text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')

/** The rows at `paths` as an SVG, or null if nothing in them is drawn. */
export function svgOfRows(root: AST, env: Env, paths: readonly string[]): string | null {
	const shapes = sceneOf(root, env).filter(
		({ row, draw }) => draw === 'path' && paths.some(path => row === path || row.startsWith(`${path}/`))
	)
	if (shapes.length === 0) return null

	let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
	for (const { value } of shapes) {
		const [[l, t], [r, b]] = bounds(value as Path)
		left = Math.min(left, l)
		top = Math.min(top, t)
		right = Math.max(right, r)
		bottom = Math.max(bottom, b)
	}
	if (!Number.isFinite(left)) return null
	const [x, y] = [left - MARGIN, top - MARGIN]
	const [width, height] = [right - left + MARGIN * 2, bottom - top + MARGIN * 2]

	const drawn = shapes.map(({ row, value, paint }) => {
		const id = row.split('/').at(-1)!.replace(/^binding:/, '')
		const painted = paint
			? ` fill="${escaped(paint.fill)}" stroke="${escaped(paint.stroke)}" stroke-width="${paint.width}"`
			: ''
		return `  <path id="${escaped(id)}" d="${toD(value as Path)}"${painted}/>`
	})
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" fill="none" stroke="black" stroke-width="${STROKE_WIDTH}">`,
		`  <metadata><glisp xmlns="${NAMESPACE}">${escaped(copiedRows(root, env, paths))}</glisp></metadata>`,
		...drawn,
		'</svg>',
	].join('\n')
}

const attributesOf = (tag: string): Record<string, string> =>
	Object.fromEntries(
		[...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(([, name, a, b]) => [
			name,
			unescaped(a ?? b ?? ''),
		])
	)

const numberIn = (attributes: Record<string, string>, name: string): number => {
	const value = Number.parseFloat(attributes[name] ?? '0')
	return Number.isFinite(value) ? value : 0
}

const pointsIn = (attributes: Record<string, string>): string[] => {
	const numbers = (attributes['points'] ?? '').match(/-?[\d.]+(?:e-?\d+)?/gi)?.map(Number) ?? []
	return Array.from({ length: Math.floor(numbers.length / 2) }, (_, i) =>
		`[${numbers[i * 2]} ${numbers[i * 2 + 1]}]`
	)
}

/** An element of an SVG as an expression, and what to call it. */
function bindingOf(element: string, attributes: Record<string, string>): readonly [string, string] | null {
	const n = (name: string) => numberIn(attributes, name)
	switch (element) {
		case 'rect':
			return ['rect', `(path.rect [${n('x')} ${n('y')}] [${n('width')} ${n('height')}])`]
		case 'circle':
			return ['circle', `(path.circle [${n('cx')} ${n('cy')}] ${n('r')})`]
		case 'ellipse':
			return ['ellipse', `(path.ellipse [${n('cx')} ${n('cy')}] [${n('rx')} ${n('ry')}])`]
		case 'line':
			return ['line', `(path.line [${n('x1')} ${n('y1')}] [${n('x2')} ${n('y2')}])`]
		case 'polyline':
			return ['polyline', `(path.polyline ${pointsIn(attributes).join(' ')})`]
		case 'polygon':
			return ['polygon', `(path.polygon ${pointsIn(attributes).join(' ')})`]
		case 'path':
			return attributes['d'] ? ['path', `(path.d "${attributes['d'].replace(/\s+/g, ' ').trim()}")`] : null
		default:
			return null
	}
}

/** What is said of how something is drawn, on itself or in its `style`. */
function paintOf(attributes: Record<string, string>): Record<string, string> {
	const declared = Object.fromEntries(
		(attributes['style'] ?? '').split(';').flatMap(declaration => {
			const [name, value] = declaration.split(':').map(part => part.trim())
			return name && value ? [[name, value]] : []
		})
	)
	return { ...attributes, ...declared }
}

/** An expression, in a style if the element says how it is drawn. */
function painted(expression: string, attributes: Record<string, string>): string {
	const { fill, stroke, 'stroke-width': width } = paintOf(attributes)
	if (fill === undefined && stroke === undefined) return expression
	// As an SVG has it: filled in black unless it says, and with no line.
	return `(style ${expression} "${fill ?? '#000000'}" "${stroke ?? 'none'}" ${Number.parseFloat(width ?? '1') || 0})`
}

const isIdentifier = (name: string): boolean => /^[A-Za-z_][\w-]*$/.test(name)

/**
 * What an SVG on the clipboard is as bindings, or null if it is not one. The code in it,
 * if it came from a canvas, and otherwise a binding to each shape. Shapes in what is
 * only there to be used, such as `defs`, are left out.
 */
export function bindingsOfSvg(text: string): string | null {
	if (!/<svg[\s>]/i.test(text)) return null
	const code = /<glisp[^>]*>([\s\S]*?)<\/glisp>/.exec(text)?.[1]
	if (code !== undefined) return unescaped(code)

	const shown = text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<(defs|clipPath|mask|symbol|pattern|marker)\b[\s\S]*?<\/\1>/gi, '')
	const counts = new Map<string, number>()
	const lines = [...shown.matchAll(/<(rect|circle|ellipse|line|polyline|polygon|path)\b([^>]*)>/gi)].flatMap(
		([, element, rest]) => {
			const attributes = attributesOf(rest!)
			const binding = bindingOf(element!.toLowerCase(), attributes)
			if (binding === null) return []
			const [kind, shape] = binding
			const expression = painted(shape, attributes)
			const id = attributes['id']
			if (id !== undefined && isIdentifier(id)) return [`${id} = ${expression}`]
			const count = (counts.get(kind) ?? 0) + 1
			counts.set(kind, count)
			return [`${kind}${count} = ${expression}`]
		}
	)
	return lines.length > 0 ? lines.join('\n') : null
}
