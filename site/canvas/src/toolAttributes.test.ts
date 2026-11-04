import { buildPrelude, type Env, LetAST, parse, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { NO_PAINT, withGraphics } from './graphics'
import { drawn, drawnFrom, paintAt, penned, pencilled, SHAPE_ATTRIBUTES, sceneOf, withPaint } from './scene'
import {
	ATTRIBUTES_OF_TOOL,
	FIRST_SOURCE,
	loadedSource,
	PAINT_ROW,
	paintOfAttributes,
	paintOfLine,
	shapeAttributesOf,
	sourceOfAttributes,
	withAttribute,
	withPaintDrawn,
	withPaintTaken,
} from './toolAttributes'

const env: Env = withGraphics(buildPrelude())
const first = parse(FIRST_SOURCE) as LetAST
const blank = parse('{[]}') as LetAST
const RED = { ...NO_PAINT, fill: '#ff0000' }
const source = (ast: LetAST, name: string) =>
	print(ast.bindings.find(([other]) => other === name)![1])

describe('what tools share', () => {
	it('starts as a drawing has always started', () => {
		expect(shapeAttributesOf(first, env)).toEqual(SHAPE_ATTRIBUTES)
		expect(paintOfAttributes(first, env)).toEqual(NO_PAINT)
	})

	it('has a paint that is read as it is written, and comes back from being kept', () => {
		const next = withPaint(first, env, PAINT_ROW, { fill: '#ff0000', width: 3 }) as LetAST
		expect(paintOfAttributes(next, env)).toMatchObject({ fill: '#ff0000', width: 3 })
		const kept = parse(loadedSource(sourceOfAttributes(next))) as LetAST
		expect(paintOfAttributes(kept, env)).toMatchObject({ fill: '#ff0000', width: 3 })
	})

	it('has none of a paint once there is nothing to it', () => {
		const painted = withPaintTaken(first, env, RED)
		expect(paintOfAttributes(withPaintTaken(painted, env, NO_PAINT), env)).toEqual(NO_PAINT)
	})

	it('changes one number by name, and adds it if it is from before there was one', () => {
		const next = withAttribute(first, 'sides', 7)
		expect(shapeAttributesOf(next, env)).toEqual({ ...SHAPE_ATTRIBUTES, sides: 7 })
		const old = parse('{[paint = (path.line [0 0] [1 0])]}') as LetAST
		expect(shapeAttributesOf(old, env)).toEqual(SHAPE_ATTRIBUTES)
		expect(shapeAttributesOf(withAttribute(old, 'sides', 7), env).sides).toBe(7)
	})

	it('goes back to its first numbers for what is not one', () => {
		const odd = parse('{sides = "many" [paint = (path.line [0 0] [1 0])]}') as LetAST
		expect(shapeAttributesOf(odd, env).sides).toBe(SHAPE_ATTRIBUTES.sides)
	})

	it('starts over if what was kept cannot be this', () => {
		for (const kept of [null, '', '(((', '1', '{a = 1}', '{a = 1 [a]}']) {
			expect(loadedSource(kept)).toBe(FIRST_SOURCE)
		}
	})

	it('only says of a tool what a shape takes', () => {
		for (const attributes of Object.values(ATTRIBUTES_OF_TOOL)) {
			for (const { name } of attributes) expect(SHAPE_ATTRIBUTES).toHaveProperty(name)
		}
	})
})

describe('a tool makes a shape from them', () => {
	const shape = { ...SHAPE_ATTRIBUTES, sides: 7, starInner: 0.5, corner: 0.1, fanSpread: 30, spiralTurns: 2, exponent: 4 }
	const at = (tool: Parameters<typeof drawn>[2]) =>
		source(drawn(blank, 'a', tool, [0, 0], [100, 0], false, 1, false, false, shape), 'a')

	it('saying of it what is theirs', () => {
		expect(at('ngon')).toBe('(path.ngon [0 0] 100 7)')
		expect(at('star')).toBe('(path.star [0 0] 100 50 7)')
		expect(at('fan')).toBe('(path.fan [0 0] 50 100 -30 30)')
		expect(at('spiral')).toBe('(path.spiral [0 0] 0 100 2)')
	})

	it('as it always has, without being told', () => {
		const plain = drawn(blank, 'a', 'ngon', [0, 0], [100, 0], false, 1)
		expect(source(plain, 'a')).toBe('(path.ngon [0 0] 100 5)')
	})

	it('and a copy of the paint, so that changing it later leaves that as it is', () => {
		const ast = withPaintDrawn(drawn(blank, 'a', 'rect', [0, 0], [10, 10], false, 1), env, 'a', RED)
		expect(source(ast, 'a')).toBe('(style (path.rect [0 0] [10 10]) fill="#ff0000")')
		expect(paintAt(ast, env, 'binding:a')?.fill).toBe('#ff0000')
	})

	it('and leaves it plain with no paint', () => {
		const plain = drawn(blank, 'a', 'rect', [0, 0], [10, 10], false, 1)
		expect(source(withPaintDrawn(plain, env, 'a', NO_PAINT), 'a')).toBe('(path.rect [0 0] [10 10])')
	})

	it('still referring to what it snapped to', () => {
		const base = parse('{p = [5 5] [p]}') as LetAST
		const snap = { at: [5, 5] as [number, number], target: 'binding:p', kind: 'anchor' } as never
		const refers = drawnFrom(base, env, 'a', 'ngon', snap, [20, 5], false, 1)
		const painted = withPaintDrawn(refers, env, 'a', RED)
		expect(sceneOf(painted, env).find(s => s.row === 'binding:a')?.paint?.fill).toBe('#ff0000')
		expect(source(refers, 'a')).toMatch(/^\(path\.ngon p /)
		expect(source(painted, 'a')).toMatch(/^\(style \(path\.ngon p /)
	})

	it('a pencil has a fill only if it is told to', () => {
		const paint = { ...NO_PAINT, fill: '#ff0000', stroke: '#0000ff', width: 3 }
		const drawnLine = pencilled(blank, [[0, 0], [10, 0], [20, 5]], 1, 1)!
		const at = `binding:${drawnLine.name}`
		const line = withPaintDrawn(drawnLine.ast, env, drawnLine.name, paintOfLine(paint, false))
		expect(paintAt(line, env, at)).toMatchObject({ fill: 'none', stroke: '#0000ff', width: 3 })
		const filled = withPaintDrawn(drawnLine.ast, env, drawnLine.name, paintOfLine(paint, true))
		expect(paintAt(filled, env, at)?.fill).toBe('#ff0000')
		const plain = withPaintDrawn(drawnLine.ast, env, drawnLine.name, paintOfLine(RED, false))
		expect(source(plain, drawnLine.name)).toMatch(/^\(path\.d /)
	})

	it('has a yes or no to say, as well as a number', () => {
		expect(shapeAttributesOf(first, env).pencilFill).toBe(false)
		const next = withAttribute(first, 'pencilFill', true)
		expect(shapeAttributesOf(next, env).pencilFill).toBe(true)
		const kept = parse(loadedSource(sourceOfAttributes(next))) as LetAST
		expect(shapeAttributesOf(kept, env).pencilFill).toBe(true)
		const odd = parse('{pencilFill = 1 [paint = (path.line [0 0] [1 0])]}') as LetAST
		expect(shapeAttributesOf(odd, env).pencilFill).toBe(false)
	})

	it('a pencil is simpler for being smoother', () => {
		const wobble = Array.from({ length: 80 }, (_, i): [number, number] => [i * 4, Math.sin(i / 2) * 3])
		const commands = (tolerance: number) =>
			source(pencilled(blank, wobble, tolerance, 1)!.ast, 'pencil1').split(/[CL]/).length
		expect(commands(8)).toBeLessThan(commands(0.5))
	})

	it('a pen goes by the same', () => {
		const anchors = [{ at: [0, 0] }, { at: [10, 0] }, { at: [5, 10] }] as const
		const paintedPen = (closed: boolean) => {
			const pen = penned(blank, env, anchors as never, closed)
			const inked = withPaintDrawn(pen.ast, env, pen.name, paintOfLine(RED, closed))
			return paintAt(inked, env, `binding:${pen.name}`)
		}
		expect(paintedPen(false)?.fill).toBe('none')
		expect(paintedPen(true)?.fill).toBe('#ff0000')
	})
})
