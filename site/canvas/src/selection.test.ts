import { buildPrelude, type Env, type TypeValue } from '@glisp/lang'
import { parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { actionTypesOver, copyableType, drawingType, exportableType, groupType, numberType, pathType, rectType, rowType, selectedOf, slotTypes, valueTextOf } from './selection'

const env: Env = withGraphics(buildPrelude())
const root = parse(`{
	a = (path.rect [0 0] [10 10])
	b = (style (path.rect [0 0] [10 10]))
	g = {c = (path.rect [0 0] [10 10])}
	n = 1
}`)
const one = (name: string) => selectedOf(root, env, [`binding:${name}`])[0]!
const rows = ['a', 'b', 'g', 'n'].map(one)
const source = { rows: () => rows, at: () => null, from: () => null }
const actionTypes = actionTypesOver(source)

describe('a hole no selection filled', () => {
	const input = (type: TypeValue) => actionTypes.input!({ name: 'x', type })!

	it('asks for a row by what it is', () => {
		expect(input(pathType)).toMatchObject({ placeholder: 'Select path' })
		expect(input(rowType)).toMatchObject({ placeholder: 'Select' })
	})

	it('says what row is in it by name', () => {
		const pick = input(pathType)
		expect('label' in pick && pick.label(one('a'))).toBe('a')
	})

	it('has a number typed in', () => {
		expect(input(numberType)).toEqual({ field: { type: 'number' }, initial: 100 })
	})

	it('cannot be asked for with no row of it there', () => {
		const none = actionTypesOver({ ...source, rows: () => [one('n')] })
		expect(none.input!({ name: 'x', type: pathType })).toBeNull()
	})
})

describe('what can be exported', () => {
	const areas = parse(`{
		page = (rect.new [0 0] [100 100])
		a = (path.rect [0 0] [10 10])
		g = {c = (path.rect [0 0] [10 10])}
		fit = (path.bounds a)
		n = 1
	}`)
	const of = (name: string) => selectedOf(areas, env, [`binding:${name}`])[0]!

	it('is what is drawn, and an area', () => {
		for (const name of ['page', 'a', 'g', 'fit']) {
			expect(actionTypes.fits(of(name), exportableType)).toBe(true)
		}
		expect(actionTypes.fits(of('n'), exportableType)).toBe(false)
	})

	it('has a path not be an area, however it looks, until it is asked for one', () => {
		expect(actionTypes.fits(of('a'), rectType)).toBe(false)
		expect(actionTypes.fits(of('page'), rectType)).toBe(true)
		expect(actionTypes.fits(of('fit'), rectType)).toBe(true)
		expect(actionTypes.narrower(pathType, rectType)).toBe(false)
		expect(actionTypes.narrower(rectType, pathType)).toBe(false)
	})

	it('has an area and a path narrower than what takes either', () => {
		expect(actionTypes.narrower(pathType, exportableType)).toBe(true)
		expect(actionTypes.narrower(rectType, exportableType)).toBe(true)
		expect(actionTypes.narrower(exportableType, pathType)).toBe(false)
	})

	it('has an area copied as a view box says it', () => {
		expect(valueTextOf(of('page'), env)).toBe('0 0 100 100')
	})
})

describe('copying a value', () => {
	const rich = parse(`{
		a = (path.rect [0 0] [10 10])
		b = (style (path.rect [0 0] [10 10]))
		n = 1.5
		m = (+ 1 2)
		s = "hi"
		t = (++ "a" "b")
		c = (color.mix "#ff0000" "#0000ff" 0.5)
		v = [1 2]
		r = {x: 1}
		g = {c = 1}
		f = (=> (x: number): number x)
	}`)
	const of = (name: string) => selectedOf(rich, env, [`binding:${name}`])[0]!
	const text = (name: string) => valueTextOf(of(name), env)

	it('has a path as its data', () => {
		expect(text('a')).toMatch(/^M /)
		expect(text('b')).toMatch(/^M /)
	})

	it('has a number as what it comes to', () => {
		expect(text('n')).toBe('1.5')
		expect(text('m')).toBe('3')
	})

	it('has a string as its text, and a color as its code', () => {
		expect(text('s')).toBe('hi')
		expect(text('t')).toBe('ab')
		expect(text('c')).toMatch(/^#[0-9a-f]{6}$/)
	})

	it('has what holds values as they are written', () => {
		expect(text('v')).toBe('[1 2]')
		expect(text('r')).toBe('{x: 1}')
	})

	it('takes only what has a text', () => {
		for (const name of ['a', 'n', 's', 'c', 'v']) {
			expect(actionTypes.fits(of(name), copyableType)).toBe(true)
		}
		for (const name of ['g', 'f']) {
			expect(actionTypes.fits(of(name), copyableType)).toBe(false)
			expect(text(name)).toBeNull()
		}
	})

	it('asks for one by what it takes', () => {
		expect(actionTypes.input!({ name: 'x', type: copyableType })).toMatchObject({
			placeholder: 'Select value',
		})
	})

	it('is not offered as an expression too, for what is only a value', () => {
		expect(actionTypes.fits(of('n'), slotTypes.copy)).toBe(false)
		expect(actionTypes.fits(of('m'), slotTypes.copy)).toBe(true)
	})
})

describe('what a slot command applies to', () => {
	it('goes by what is written, whatever it comes to', () => {
		expect(actionTypes.fits(one('a'), slotTypes.step)).toBe(true)
		expect(actionTypes.fits(one('n'), slotTypes.step)).toBe(false)
	})

	it('has a row to point at', () => {
		expect(actionTypes.input!({ name: 'x', type: slotTypes.step })).toMatchObject({
			placeholder: 'Select expression',
		})
	})

	it('is not within a row, as it applies to arguments as well', () => {
		expect(actionTypes.narrower(slotTypes.step, rowType)).toBe(false)
		expect(actionTypes.narrower(slotTypes.step, slotTypes.all)).toBe(false)
	})
})

describe('a row', () => {
	const inside = selectedOf(root, env, ['binding:a/arg0'])[0]!

	it('is one of its own, and not an argument of one', () => {
		expect(actionTypes.fits(one('a'), rowType)).toBe(true)
		expect(actionTypes.fits(inside, rowType)).toBe(false)
	})

	it('is the only thing that is a drawing, or a group', () => {
		expect(actionTypes.fits(one('g'), drawingType)).toBe(true)
		expect(actionTypes.fits(inside, drawingType)).toBe(false)
	})

	it('still has what can be done to an argument', () => {
		expect(actionTypes.fits(inside, slotTypes.pin)).toBe(true)
		expect(actionTypes.fits(inside, copyableType)).toBe(true)
	})
})

describe('what is selected, to an action', () => {
	it('is a path, drawn as it may be', () => {
		expect(actionTypes.fits(one('a'), pathType)).toBe(true)
		expect(actionTypes.fits(one('b'), pathType)).toBe(true)
		expect(actionTypes.fits(one('g'), pathType)).toBe(false)
	})

	it('is a group, if it is a block with nothing to return', () => {
		expect(actionTypes.fits(one('g'), groupType)).toBe(true)
		expect(actionTypes.fits(one('a'), groupType)).toBe(false)
		expect(actionTypes.fits(one('n'), groupType)).toBe(false)
	})

})

describe('how particular a type is', () => {
	it('has a drawing between a path or a group and a row', () => {
		expect(actionTypes.narrower(pathType, drawingType)).toBe(true)
		expect(actionTypes.narrower(groupType, drawingType)).toBe(true)
		expect(actionTypes.narrower(drawingType, pathType)).toBe(false)
		expect(actionTypes.narrower(drawingType, rowType)).toBe(true)
		expect(actionTypes.narrower(pathType, rowType)).toBe(true)
		expect(actionTypes.narrower(rowType, drawingType)).toBe(false)
	})

	it('has a number not be a drawing', () => {
		expect(actionTypes.fits(one('n'), drawingType)).toBe(false)
		expect(actionTypes.fits(one('g'), drawingType)).toBe(true)
	})
})
