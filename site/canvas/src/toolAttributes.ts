/**
 * What a tool makes things from, which goes for every tool that has a use for it. It is one
 * record, by name, so a color stays when the tool changes, and a tool only says which of its
 * names it shows. It is a let-block of its own, kept with the app and not with the program:
 * choosing a color is not an edit to the drawing, and what is drawn has a copy of the values.
 */

import { type AST, type Env, evaluate, LetAST, lit, parse, print, readByName } from '@glisp/lang'
import { layersOf } from '@glisp/tweeq/structure'

import { NO_PAINT, type Paint } from './graphics'
import { paintAt, SHAPE_ATTRIBUTES, type ShapeAttributes, withPaint } from './scene'

/** The row of it that says how what is drawn is painted. */
export const PAINT_ROW = 'binding:paint'

export const FIRST_SOURCE = `{${Object.entries(SHAPE_ATTRIBUTES)
	.map(([name, value]) => `${name} = ${JSON.stringify(value)}`)
	.join(' ')} [paint = (path.line [0 0] [1 0])]}`

/** One of a tool's own, for what edits it. */
export interface AttributeOfTool {
	readonly name: keyof ShapeAttributes
	readonly label: string
	readonly min?: number
	readonly max?: number
	readonly step?: number
}

const SIDES: AttributeOfTool = { name: 'sides', label: 'Sides', min: 3, step: 1 }

/** What a tool has of its own, besides how what it draws is painted. */
export const ATTRIBUTES_OF_TOOL: Readonly<Record<string, readonly AttributeOfTool[]>> = {
	spray: [
		{ name: 'sprayMinRadius', label: 'Smallest', min: 0, step: 0.5 },
		{ name: 'sprayMaxRadius', label: 'Largest', min: 0, step: 0.5 },
		{ name: 'sprayJitter', label: 'Scatter', min: 0, step: 1 },
		{ name: 'fill2', label: 'Second Color' },
	],
	triangleStrip: [{ name: 'fill2', label: 'Second Color' }],
	dubins: [{ name: 'dubinsRadius', label: 'Turning Radius', min: 0.1, step: 1 }],
	pencil: [
		{ name: 'smoothness', label: 'Smoothness', min: 0.1, step: 0.1 },
		{ name: 'pencilFill', label: 'Fill' },
	],
	ngon: [SIDES],
	star: [SIDES, { name: 'starInner', label: 'Inner', min: 0, max: 1, step: 0.01 }],
	roundRect: [{ name: 'corner', label: 'Corner', min: 0, max: 0.5, step: 0.01 }],
	superellipse: [{ name: 'exponent', label: 'Exponent', min: 0.1, step: 0.1 }],
	capsule: [{ name: 'capsuleRadius', label: 'Radius', min: 0, step: 0.01 }],
	fan: [
		{ name: 'fanInner', label: 'Inner', min: 0, max: 1, step: 0.01 },
		{ name: 'fanSpread', label: 'Spread', min: 0, max: 180, step: 1 },
	],
	spiral: [{ name: 'spiralTurns', label: 'Turns', min: 0, step: 0.1 }],
	clothoid: [{ name: 'clothoidTurn', label: 'Turn', step: 0.1 }],
}

/** What was kept, if it can still be what this is, or else what it is at first. */
export function loadedSource(kept: string | null | undefined): string {
	if (!kept) return FIRST_SOURCE
	try {
		const ast = parse(kept)
		return ast.kind === 'let' && ast.body?.kind === 'vec' && layersOf(ast).includes('paint')
			? kept
			: FIRST_SOURCE
	} catch {
		return FIRST_SOURCE
	}
}

export const sourceOfAttributes = (root: LetAST): string => print(root)

/** The tool's own numbers, each as it is said, or as it is at first where it does not fit. */
export function shapeAttributesOf(root: LetAST, env: Env): ShapeAttributes {
	const said = new Map(root.bindings)
	return Object.fromEntries(
		Object.entries(SHAPE_ATTRIBUTES).map(([name, first]) => {
			const ast = said.get(name)
			const value = ast && evaluate(readByName(ast), env).value
			const fits = typeof value === typeof first && (typeof value !== 'number' || Number.isFinite(value))
			return [name, fits ? value : first]
		})
	) as ShapeAttributes
}

export const paintOfAttributes = (root: LetAST, env: Env): Paint =>
	paintAt(root, env, PAINT_ROW) ?? NO_PAINT

export function withAttribute(root: LetAST, name: keyof ShapeAttributes, value: number | boolean | string): LetAST {
	const has = root.bindings.some(([other]) => other === name)
	return new LetAST(
		has
			? root.bindings.map(([other, ast]): [string, AST] => [other, other === name ? lit(value) : ast])
			: [...root.bindings, [name, lit(value)]],
		root.body
	)
}

/** How a line is painted as it is drawn, which only has a fill if it is to be filled. */
export const paintOfLine = (paint: Paint, filled: boolean): Paint =>
	filled ? paint : { ...paint, fill: NO_PAINT.fill }

/** With what is drawn from here on painted as `paint`, all of it. */
export function withPaintTaken(root: LetAST, env: Env, paint: Paint): LetAST {
	const next = withPaint(root, env, PAINT_ROW, paint)
	return next.kind === 'let' ? next : root
}

/** `root`, with the row that was just drawn as `name` having a copy of `paint`. */
export function withPaintDrawn(root: LetAST, env: Env, name: string, paint: Paint): LetAST {
	const next = withPaint(root, env, `binding:${name}`, paint)
	return next.kind === 'let' ? next : root
}
