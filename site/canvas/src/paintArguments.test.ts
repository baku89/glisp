import { buildPrelude, type Env, print } from '@glisp/lang'
import { parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { paintArgument, paintReferringTo, paintSource, paintWritten, withPaintsSwapped, withPaintThrough } from './paintArguments'
import { paintAt } from './scene'

const env: Env = withGraphics(buildPrelude())
const shape = '(path.rect [0 0] [1 1])'

describe('paintArgument', () => {
	const at = (body: string, key: 'fill' | 'stroke') => paintArgument(parse(`{a = ${body}}`), env, 'binding:a', key)

	it('is what it is said by, by name or by place', () => {
		expect(at(`(style ${shape} fill="#ff0000")`, 'fill')).toBe('binding:a/kw:fill')
		expect(at(`(style ${shape} "#ff0000")`, 'fill')).toBe('binding:a/arg1')
	})

	it('is nothing where it is not said, or there is no style', () => {
		expect(at(`(style ${shape} fill="#ff0000")`, 'stroke')).toBeNull()
		expect(at(shape, 'fill')).toBeNull()
	})
})

describe('paintReferringTo', () => {
	const program = `{a = (style ${shape} fill="#ff0000" width=3) b = (style ${shape} fill="#00ff00") c = ${shape}}`
	const refer = (row: string, key: 'fill' | 'stroke' | 'width', target: string) => {
		const next = paintReferringTo(parse(program), env, row, key, target)
		return next === null ? null : next
	}

	it('replaces what it says', () => {
		const next = refer('binding:b', 'fill', 'binding:a/kw:fill')!
		expect(print(next)).toContain('fill=/a/fill')
		expect(paintAt(next, env, 'binding:b')?.fill).toBe('#ff0000')
	})

	it('says what it did not, and keeps the rest', () => {
		const next = refer('binding:b', 'width', 'binding:a/kw:width')!
		expect(print(next)).toContain('fill="#00ff00" width=/a/width')
		expect(paintAt(next, env, 'binding:b')?.width).toBe(3)
	})

	it('has a style come about, if there is none yet', () => {
		const next = refer('binding:c', 'stroke', 'binding:a/kw:fill')!
		expect(paintAt(next, env, 'binding:c')?.stroke).toBe('#ff0000')
	})

	it('does not refer to itself', () => {
		expect(refer('binding:a', 'fill', 'binding:a/kw:fill')).toBeNull()
	})
})

describe('paintSource', () => {
	const source = (body: string, key: 'fill' | 'width') => paintSource(parse(`{b = 1 a = ${body}}`), env, 'binding:a', key)

	it('is only that argument, and not what it is of', () => {
		expect(source(`(style ${shape} fill="#ff0000")`, 'fill')).toBe('"#ff0000"')
		expect(source(`(style ${shape} fill="#ff0000" width=(+ 1 2))`, 'width')).toBe('(+ 1 2)')
	})

	it('is what it comes to, where it is not said', () => {
		expect(source(`(style ${shape} fill="#ff0000")`, 'width')).toBe('1')
	})
})

describe('paintWritten', () => {
	it('is what was written, said before or not', () => {
		const root = parse(`{a = (style ${shape} fill="#ff0000")}`)
		expect(print(paintWritten(root, env, 'binding:a', 'fill', parse('"#0000ff"'))!)).toContain('fill="#0000ff"')
		expect(print(paintWritten(root, env, 'binding:a', 'width', parse('(+ 1 2)'))!)).toContain('width=(+ 1 2)')
	})
})

describe('withPaintThrough', () => {
	const referring = `{a = (style ${shape} fill="#ff0000" width=3) b = (style ${shape} fill=/a/fill width=/a/width)}`

	it('has what it refers to come to it, and goes on referring', () => {
		const next = print(withPaintThrough(parse(referring), env, 'binding:b', { fill: '#0000ff', width: 9 }))
		expect(next).toContain('a = (style (path.rect [0 0] [1 1]) fill="#0000ff" width=9)')
		expect(next).toContain('fill=/a/fill width=/a/width')
	})

	it('writes what is only a value, or not said at all', () => {
		const next = print(withPaintThrough(parse(referring), env, 'binding:a', { fill: '#0000ff', cap: 'round' }))
		expect(next).toContain('a = (style (path.rect [0 0] [1 1]) fill="#0000ff" width=3 cap="round")')
	})
})

describe('withPaintsSwapped', () => {
	const swapped = (body: string, rows = ['binding:a']) => {
		const next = withPaintsSwapped(parse(`{${body}}`), env, rows)
		return (row = 'binding:a') => paintAt(next, env, row)
	}

	it('gives each the color of the other', () => {
		const paint = swapped(`a = (style ${shape} fill="#ff0000" stroke="#0000ff")`)()
		expect(paint?.fill).toBe('#0000ff')
		expect(paint?.stroke).toBe('#ff0000')
	})

	it('takes none along, keeping what else it says of a line', () => {
		const paint = swapped(`a = (style ${shape} fill="#ff0000" width=3 cap="round")`)()
		expect(paint?.fill).toBe('none')
		expect(paint?.stroke).toBe('#ff0000')
		expect(paint?.width).toBe(3)
		expect(paint?.cap).toBe('round')
		const back = swapped(`a = (style ${shape} stroke="#ff0000" width=3)`)()
		expect(back?.fill).toBe('#ff0000')
		expect(back?.stroke).toBe('none')
		expect(back?.width).toBe(3)
	})

	it('gives a line that had no width one to be seen by', () => {
		expect(swapped(`a = (style ${shape} fill="#ff0000" width=0)`)()?.width).toBe(1)
	})

	it('does each of several by itself, and one only once', () => {
		const program = `a = (style ${shape} fill="#ff0000") b = (style ${shape} stroke="#00ff00")`
		const paint = swapped(program, ['binding:a', 'binding:b', 'binding:a'])
		expect(paint('binding:a')?.stroke).toBe('#ff0000')
		expect(paint('binding:b')?.fill).toBe('#00ff00')
	})

	it('leaves what has neither as it is', () => {
		const root = parse(`{a = (style ${shape} fill="none" width=3)}`)
		expect(withPaintsSwapped(root, env, ['binding:a'])).toBe(root)
	})
})
