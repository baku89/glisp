/**
 * What goes between a canvas and everything else: SVG. A selection is written as what
 * it comes to, with the code it comes from in its metadata, so that anywhere else gets a
 * drawing and a canvas gets the program back. An SVG from elsewhere becomes bindings.
 */

import { type AST, type Env, lit, parse, print, toAst } from '@glisp/lang'
import { copiedRows } from '@glisp/tweeq/rowsClipboard'
import Color from 'colorjs.io'
import { bounds } from 'pave/path/metrics'
import { toD } from 'pave/path/svg'

import { cornersOf, LINE_CAPS, LINE_JOINS, NO_PAINT, type Paint, type Path, type RectValue, styleOf, toHex } from './graphics'
import { type GridKind, gridStep } from './grid'
import { paintedIn } from './scene'

const NAMESPACE = 'https://glisp.app/canvas'
const STROKE_WIDTH = 1.5
const MARGIN = 2

const escaped = (text: string): string =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A color, or null for what is not one to CSS, as `none` is not. */
const colorIn = (text: string): Color | null => {
	try {
		return new Color(text)
	} catch {
		return null
	}
}

/**
 * The attribute of a color, and of how see-through it is, where there is that to say. Not
 * everything that reads an SVG reads a color with its alpha in it, but they all read these.
 */
function colorAttributes(name: string, text: string): string {
	const color = colorIn(text)
	const alpha = color?.alpha ?? 1
	if (color === null || alpha >= 1) return ` ${name}="${escaped(text)}"`
	color.alpha = 1
	return ` ${name}="${toHex(color)}" ${name}-opacity="${Number(alpha.toFixed(3))}"`
}

const unescaped = (text: string): string =>
	text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')

const GRID_COLOR = '#999999'
const DOT_RADIUS = 0.75

/** A grid, as it is at full size, over the area drawn. Its lines are where it has them on the canvas. */
function gridIn(id: string, kind: GridKind, x: number, y: number, width: number, height: number): string[] {
	if (kind === 'none') return []
	const step = gridStep(1)
	const mark =
		kind === 'dots'
			? `<circle cx="${step / 2}" cy="${step / 2}" r="${DOT_RADIUS}" fill="${GRID_COLOR}" stroke="none"/>`
			: `<path d="M ${step / 2} 0 V ${step} M 0 ${step / 2} H ${step}" stroke="${GRID_COLOR}" stroke-width="${DOT_RADIUS}"/>`
	return [
		`  <pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="translate(${-step / 2} ${-step / 2})">${mark}</pattern>`,
		`  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id})" stroke="none"/>`,
	]
}

/**
 * The rows at `paths` as an SVG, or null if nothing in them is drawn. With an `area`, it is that
 * much of them: what is at all within it, and it is what the SVG shows, whatever goes past it.
 */
export function svgOfRows(
	root: AST,
	env: Env,
	paths: readonly string[],
	area?: RectValue
): string | null {
	const [[fromX, fromY], [toX, toY]] = area
		? cornersOf(area)
		: [
				[-Infinity, -Infinity],
				[Infinity, Infinity],
			]
	const isAsked = (row: string) => paths.some(path => row === path || row.startsWith(`${path}/`))
	const painted = paintedIn(root, env).filter(({ row }) => isAsked(row))
	const shapes = painted.filter(({ draw, value }) => {
		if (draw !== 'path') return false
		const [[l, t], [r, b]] = bounds(value as Path)
		return l <= toX && r >= fromX && t <= toY && b >= fromY
	})
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
	const [x, y] = area ? area.origin : [left - MARGIN, top - MARGIN]
	const [width, height] = area ? area.size : [right - left + MARGIN * 2, bottom - top + MARGIN * 2]

	const shown = new Set(shapes)
	const drawn = painted.flatMap(shape => {
		const { row, draw, value, paint } = shape
		const id = row.split('/').at(-1)!.replace(/^binding:/, '')
		// As far as what is drawn goes, which is all it has to be behind.
		if (draw === 'background') {
			return value === 'none' ? [] : [`  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escaped(String(value))}"/>`]
		}
		if (draw === 'grid') return gridIn(escaped(id), value as GridKind, x, y, width, height)
		if (!shown.has(shape)) return []
		const attributes = paint
			? `${colorAttributes('fill', paint.fill)}${colorAttributes('stroke', paint.stroke)} stroke-width="${paint.width}"${lineAttributes(paint)}`
			: ''
		return [`  <path id="${escaped(id)}" d="${toD(value as Path)}"${attributes}/>`]
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

/** A color with its alpha in it, being as see-through as `opacity` says on top of what it is. */
function withOpacity(text: string, opacity: string | undefined): string {
	const color = colorIn(text)
	const by = Number.parseFloat(opacity ?? '') / (opacity?.trim().endsWith('%') ? 100 : 1)
	if (color === null || !Number.isFinite(by) || by >= 1) return text
	color.alpha = (color.alpha ?? 1) * Math.max(by, 0)
	return toHex(color)
}

/** An expression, in a style if the element says how it is drawn. */
function painted(expression: string, attributes: Record<string, string>): string {
	const {
		fill,
		stroke,
		'fill-opacity': fillOpacity,
		'stroke-opacity': strokeOpacity,
		'stroke-width': width,
		'stroke-linecap': cap,
		'stroke-linejoin': join,
		'stroke-dasharray': dash,
		'stroke-dashoffset': dashOffset,
		'stroke-miterlimit': miterLimit,
	} = paintOf(attributes)
	if (fill === undefined && stroke === undefined) return expression
	const number = (value: string | undefined): AST | undefined => {
		const parsed = Number.parseFloat(value ?? '')
		return Number.isFinite(parsed) ? lit(parsed) : undefined
	}
	const dashes = dash?.split(/[\s,]+/).map(Number.parseFloat)
	return print(
		styleOf(parse(expression), {
			// As an SVG has it: filled in black unless it says, and with no line.
			fill: lit(withOpacity(fill ?? '#000000', fillOpacity)),
			stroke: lit(withOpacity(stroke ?? 'none', strokeOpacity)),
			width: lit(Number.parseFloat(width ?? '1') || 0),
			...(cap !== undefined && (LINE_CAPS as readonly string[]).includes(cap) ? { cap: lit(cap) } : {}),
			...(join !== undefined && (LINE_JOINS as readonly string[]).includes(join) ? { join: lit(join) } : {}),
			...(dashes?.every(Number.isFinite) ? { dash: toAst(dashes, null) } : {}),
			dashOffset: number(dashOffset),
			miterLimit: number(miterLimit),
		})
	)
}

/** What an SVG would have to be told of a line, past what it takes for granted. */
function lineAttributes({ cap, join, dash, dashOffset, miterLimit }: Paint): string {
	const said: Array<[string, unknown, unknown]> = [
		['stroke-linecap', cap, NO_PAINT.cap],
		['stroke-linejoin', join, NO_PAINT.join],
		['stroke-dasharray', dash.join(' '), ''],
		['stroke-dashoffset', dashOffset, NO_PAINT.dashOffset],
		['stroke-miterlimit', miterLimit, NO_PAINT.miterLimit],
	]
	return said.map(([name, value, fallback]) => (value === fallback ? '' : ` ${name}="${value}"`)).join('')
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
	// What comes later in an SVG is in front, and what is in front comes first here.
	return lines.length > 0 ? lines.reverse().join('\n') : null
}
