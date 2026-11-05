/**
 * What goes between a canvas and everything else: SVG. A selection, or a whole program as a
 * file, is written as what it comes to, with the code it comes from in its metadata, so that
 * anywhere else gets a drawing and a canvas gets the program back. An SVG from elsewhere
 * becomes bindings.
 */

import { type AST, buildPrelude, type Env, LetAST, lex, lit, lookupBareName, parse, print, SymAST, toAst, VecAST } from '@glisp/lang'
import { readProgram, sourceOfProgram } from '@glisp/tweeq/programSource'
import { copiedRows } from '@glisp/tweeq/rowsClipboard'
import Color from 'colorjs.io'
import { bounds } from 'pave/path/metrics'
import { toD } from 'pave/path/svg'

import { type AxesValue, cornersOf, type GraphPaperValue, LINE_CAPS, LINE_JOINS, NO_PAINT, type Paint, type Path, type RectValue, styleOf, toHex, withGraphics } from './graphics'
import { paintedIn } from './scene'

const NAMESPACE = 'https://glisp.app/canvas'
/** What already has a name, which an element from elsewhere is not to take from it. */
const NAMED = withGraphics(buildPrelude())
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

/**
 * A graph paper, as it is at full size, over the area drawn: `step` apart, adaptive or not, as
 * a file has no zoom to go by. Its lines are where it has them on the canvas.
 */
function graphPaperIn(id: string, graphPaper: GraphPaperValue, x: number, y: number, width: number, height: number): string[] {
	const { step } = graphPaper
	const mark =
		graphPaper.kind === 'dots'
			? `<circle cx="${step / 2}" cy="${step / 2}" r="${graphPaper.width}"${colorAttributes('fill', graphPaper.color)} stroke="none"/>`
			: `<path d="M ${step / 2} 0 V ${step} M 0 ${step / 2} H ${step}"${colorAttributes('stroke', graphPaper.color)} stroke-width="${graphPaper.width}"/>`
	const [originX, originY] = graphPaper.origin
	return [
		`  <pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="translate(${originX - step / 2} ${originY - step / 2})">${mark}</pattern>`,
		`  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${id})" stroke="none"/>`,
	]
}

/** Axes, over the area drawn. */
const axesIn = ({ origin: [originX, originY], color, width: line }: AxesValue, x: number, y: number, width: number, height: number): string =>
	`  <path d="M ${originX} ${y} V ${y + height} M ${x} ${originY} H ${x + width}"${colorAttributes('stroke', color)} stroke-width="${line}"/>`

const metadataOf = (code: string): string =>
	`  <metadata><glisp xmlns="${NAMESPACE}">${escaped(code)}</glisp></metadata>`

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
	return svgWith(copiedRows(root, env, paths), root, env, paths, area)
}

/**
 * A program as a file: all it draws, with all of its code in it, drawn or not. A program
 * that draws nothing still has to be kept, so it is an SVG with nothing to see.
 */
export function svgOfProgram(root: LetAST, env: Env): string {
	const code = sourceOfProgram(root)
	const rows = paintedIn(root, env).map(({ row }) => row)
	return (
		svgWith(code, root, env, rows) ??
		['<svg xmlns="http://www.w3.org/2000/svg">', metadataOf(code), '</svg>'].join('\n')
	)
}

/**
 * What is in a file, as source. It is `whole` if the file is a program as `svgOfProgram` wrote it,
 * which saving can go back to: its code has a vector of what is drawn. Only some rows of one, an
 * SVG from elsewhere, or source from before, are read but are not that, as what they are would
 * be lost. Null if nothing in it can be read.
 */
export function programInFile(text: string): { readonly source: string; readonly whole: boolean } | null {
	if (!/<svg[\s>]/i.test(text)) return { source: text, whole: false }
	const code = bindingsOfSvg(text)
	if (code === null) return null
	const reading = readProgram(code)
	if (!('ast' in reading)) return null
	const { bindings, body } = reading.ast
	// Bindings on their own are in the order of what is in front, as a program's vector is.
	const held = body ?? new VecAST(bindings.map(([name]) => new SymAST(name)))
	return { source: print(new LetAST(bindings, held)), whole: body !== null }
}

function svgWith(
	code: string,
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
		// As far as what is drawn goes, which is all there is of what goes on and on.
		if (draw === 'solid') {
			return [`  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${escaped(String(value))}" stroke="none"/>`]
		}
		if (draw === 'graphPaper') return graphPaperIn(escaped(id), value as GraphPaperValue, x, y, width, height)
		if (draw === 'axes') return [axesIn(value as AxesValue, x, y, width, height)]
		if (!shown.has(shape)) return []
		const attributes = paint
			? `${colorAttributes('fill', paint.fill)}${colorAttributes('stroke', paint.stroke)} stroke-width="${paint.width}"${lineAttributes(paint)}`
			: ''
		return [`  <path id="${escaped(id)}" d="${toD(value as Path)}"${attributes}/>`]
	})
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" fill="none" stroke="black" stroke-width="${STROKE_WIDTH}">`,
		metadataOf(code),
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
	// As tersely as it can be written, where `1.5.5` is two of them, and `1-2` is too.
	const numbers = (attributes['points'] ?? '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
	return Array.from({ length: Math.floor(numbers.length / 2) }, (_, i) =>
		`[${numbers[i * 2]} ${numbers[i * 2 + 1]}]`
	)
}

/** An element of an SVG as an expression, and what to call it. */
function bindingOf(element: string, attributes: Record<string, string>): readonly [string, string] | null {
	const n = (name: string) => numberIn(attributes, name)
	switch (element) {
		case 'rect': {
			// Either says it of both, and as far as a side goes. One radius is as near as it comes to two.
			const radius = Math.min(n('rx') || n('ry'), n('width') / 2, n('height') / 2)
			return radius > 0
				? ['rect', `(path.roundRect [${n('x')} ${n('y')}] [${n('width')} ${n('height')}] ${radius})`]
				: ['rect', `(path.rect [${n('x')} ${n('y')}] [${n('width')} ${n('height')}])`]
		}
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

type Declarations = Record<string, string>

/** What `style` says, as an attribute or in a rule. */
const declarationsIn = (text: string): Declarations =>
	Object.fromEntries(
		text.split(';').flatMap(declaration => {
			const at = declaration.indexOf(':')
			const name = declaration.slice(0, at).trim().toLowerCase()
			const value = declaration.slice(at + 1).replace(/!important/i, '').trim()
			return at > 0 && value ? [[name, value]] : []
		})
	)

/** What goes down to what is inside of something, unless that says otherwise. */
const INHERITED = [
	'color',
	'fill',
	'fill-opacity',
	'stroke',
	'stroke-opacity',
	'stroke-width',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-miterlimit',
	'visibility',
] as const

/** What can be said of how something is drawn. Only `opacity` and `display` do not go down. */
const SAID = new Set<string>([...INHERITED, 'opacity', 'display'])

interface Rule {
	readonly tag: string | null
	readonly id: string | null
	readonly classes: readonly string[]
	readonly weight: number
	readonly said: Declarations
}

/**
 * The rules of the `style` elements of an SVG. Of a selector, only what it says of the element
 * itself is gone by, and not what that is in, which is as far as this needs to go.
 */
function rulesIn(text: string): Rule[] {
	const css = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
		.map(([, content]) => content!.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))
		.join('\n')
	return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) =>
		selectors!.split(',').flatMap((selector): Rule[] => {
			const last = selector.trim().split(/[\s>+~]+/).at(-1) ?? ''
			if (last === '' || /[:[@]/.test(last)) return []
			const tag = /^[a-z][\w-]*/i.exec(last)?.[0]?.toLowerCase() ?? null
			const id = /#([\w-]+)/.exec(last)?.[1] ?? null
			const classes = [...last.matchAll(/\.([\w-]+)/g)].map(([, name]) => name!)
			const weight = (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0)
			return [{ tag, id, classes, weight, said: declarationsIn(body!) }]
		})
	).sort((a, b) => a.weight - b.weight)
}

/** The first color of each gradient, as near as a flat color comes to one. */
function gradientColorsIn(text: string): Map<string, string> {
	const stops = new Map<string, string>()
	const refers = new Map<string, string>()
	for (const [, open, body] of text.matchAll(/<((?:linear|radial)Gradient\b[^>]*?)(?:\/>|>([\s\S]*?)<\/(?:linear|radial)Gradient>)/gi)) {
		const attributes = attributesOf(open!)
		const id = attributes['id']
		if (id === undefined) continue
		const href = attributes['href'] ?? attributes['xlink:href']
		if (href?.startsWith('#')) refers.set(id, href.slice(1))
		const stop = /<stop\b([^>]*)>/i.exec(body ?? '')?.[1]
		if (stop === undefined) continue
		const said = attributesOf(stop)
		const declared = { ...said, ...declarationsIn(said['style'] ?? '') }
		const color = declared['stop-color'] ?? '#000000'
		stops.set(id, withOpacity(color, fractionIn(declared['stop-opacity'])))
	}
	for (const [id, to] of refers) {
		const color = stops.get(to)
		if (!stops.has(id) && color !== undefined) stops.set(id, color)
	}
	return stops
}

/** How much of something an opacity leaves of it, all of it if that does not say. */
function fractionIn(opacity: string | undefined): number {
	const by = Number.parseFloat(opacity ?? '') / (opacity?.trim().endsWith('%') ? 100 : 1)
	return Number.isFinite(by) ? Math.min(Math.max(by, 0), 1) : 1
}

/** A color with its alpha in it, being as see-through as `by` says on top of what it is. */
function withOpacity(text: string, by: number): string {
	const color = colorIn(text)
	if (color === null || by >= 1) return text
	color.alpha = (color.alpha ?? 1) * by
	return toHex(color)
}

/** What a paint comes to as a color: `currentColor` is `color`, and a gradient its first color. */
function colorOf(paint: string, current: string, gradients: ReadonlyMap<string, string>): string {
	if (/^currentcolor$/i.test(paint)) return current
	const [, id, fallback] = /^url\(\s*["']?#([^"')\s]+)["']?\s*\)\s*(.*)$/i.exec(paint) ?? []
	if (id === undefined) return paint
	return gradients.get(id) ?? (fallback === '' || fallback === undefined ? 'none' : fallback)
}

/** An expression, in a style with how it is drawn, as an SVG takes it where it does not say. */
function painted(expression: string, said: Declarations, opacity: number, gradients: ReadonlyMap<string, string>): string {
	const {
		color,
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
	} = said
	const current = color ?? '#000000'
	const number = (value: string | undefined): AST | undefined => {
		const parsed = Number.parseFloat(value ?? '')
		return Number.isFinite(parsed) ? lit(parsed) : undefined
	}
	const dashes = dash?.split(/[\s,]+/).map(Number.parseFloat)
	const styled = styleOf(parse(expression), {
		// As an SVG has it: filled in black unless it says, and with no line.
		fill: lit(withOpacity(colorOf(fill ?? '#000000', current, gradients), fractionIn(fillOpacity) * opacity)),
		stroke: lit(withOpacity(colorOf(stroke ?? 'none', current, gradients), fractionIn(strokeOpacity) * opacity)),
		width: lit(Number.parseFloat(width ?? '1') || 0),
		...(cap !== undefined && (LINE_CAPS as readonly string[]).includes(cap) ? { cap: lit(cap) } : {}),
		...(join !== undefined && (LINE_JOINS as readonly string[]).includes(join) ? { join: lit(join) } : {}),
		...(dashes?.every(Number.isFinite) ? { dash: toAst(dashes, null) } : {}),
		dashOffset: number(dashOffset),
		miterLimit: number(miterLimit),
	})
	// With nothing to say, as where it is neither filled nor has a line, it is what it is.
	return styled.kwargs ? print(styled) : expression
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

/** Whether what an element is called can be what it is called here, with what it would hide. */
function isFreeName(name: string, taken: ReadonlySet<string>): boolean {
	if (!/^[A-Za-z_][\w-]*$/.test(name) || taken.has(name) || lookupBareName(name, NAMED) !== null) return false
	const [token, end] = lex(name)
	return token?.kind === 'identifier' && token.text === name && end?.kind === 'eof'
}

/**
 * What an SVG on the clipboard is as bindings, or null if it is not one. The code in it,
 * if it came from a canvas, and otherwise a binding to each shape. Shapes in what is
 * only there to be used, such as `defs`, are left out.
 */
export function bindingsOfSvg(text: string): string | null {
	if (!/<svg[\s>]/i.test(text)) return null
	const code = /<glisp[^>]*>([\s\S]*?)<\/glisp>/.exec(text)?.[1]
	if (code !== undefined) return unescaped(code)

	const visible = text.replace(/<!--[\s\S]*?-->/g, '')
	const rules = rulesIn(visible)
	const gradients = gradientColorsIn(visible)
	const shown = visible
		.replace(/<style\b[\s\S]*?<\/style>/gi, '')
		.replace(/<(defs|clipPath|mask|symbol|pattern|marker)\b[\s\S]*?<\/\1>/gi, '')

	/** What is said of an element by the lowest to the highest: attributes, rules, its `style`. */
	const saidOf = (tag: string, attributes: Record<string, string>): Declarations => {
		const classes = (attributes['class'] ?? '').split(/\s+/)
		const matching = rules.filter(
			rule =>
				(rule.tag === null || rule.tag === tag) &&
				(rule.id === null || rule.id === attributes['id']) &&
				rule.classes.every(name => classes.includes(name))
		)
		const all: Declarations = {
			...attributes,
			...Object.assign({}, ...matching.map(({ said }) => said)),
			...declarationsIn(attributes['style'] ?? ''),
		}
		return Object.fromEntries(
			Object.entries(all).filter(([name, value]) => SAID.has(name) && value.toLowerCase() !== 'inherit')
		)
	}

	interface Open {
		readonly tag: string
		readonly said: Declarations
		readonly opacity: number
		readonly gone: boolean
	}
	const inside: Open[] = []
	const counts = new Map<string, number>()
	const names = new Set([...shown.matchAll(/\bid\s*=\s*["']([^"']*)["']/g)].map(([, id]) => id!))
	const used = new Set<string>()
	const lines: string[] = []
	for (const [, closing, name, rest, selfClosed] of shown.matchAll(/<(\/?)([A-Za-z][\w:-]*)\b([^>]*?)(\/?)>/g)) {
		const tag = name!.toLowerCase()
		if (closing) {
			const at = inside.map(open => open.tag).lastIndexOf(tag)
			if (at >= 0) inside.length = at
			continue
		}
		const attributes = attributesOf(rest!)
		const around = inside.at(-1)
		const own = saidOf(tag, attributes)
		const down = Object.fromEntries(
			INHERITED.flatMap(key => {
				const value = own[key] ?? around?.said[key]
				return value === undefined ? [] : [[key, value]]
			})
		)
		const opacity = (around?.opacity ?? 1) * fractionIn(own['opacity'])
		const gone = (around?.gone ?? false) || own['display'] === 'none'
		if (!selfClosed) inside.push({ tag, said: down, opacity, gone })
		if (gone || down['visibility'] === 'hidden' || down['visibility'] === 'collapse') continue

		const binding = bindingOf(tag, attributes)
		if (binding === null) continue
		const [kind, shape] = binding
		const expression = painted(shape, down, opacity, gradients)
		const id = attributes['id']
		if (id !== undefined && isFreeName(id, used)) {
			used.add(id)
			lines.push(`${id} = ${expression}`)
			continue
		}
		// Past what anything else here is called, whichever of them comes first.
		let count = counts.get(kind) ?? 0
		do count++
		while (!isFreeName(`${kind}${count}`, used) || names.has(`${kind}${count}`))
		counts.set(kind, count)
		used.add(`${kind}${count}`)
		lines.push(`${kind}${count} = ${expression}`)
	}
	// What comes later in an SVG is in front, and what is in front comes first here.
	return lines.length > 0 ? lines.reverse().join('\n') : null
}
