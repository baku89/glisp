import { buildPrelude, type Env, evaluate, parse, print } from '@glisp/lang'
import { filtersFor, wrappedAt } from '@glisp/tweeq/filters'
import { numberOptionsAt, viewOf } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'
import { toD } from 'pave/path/svg'
import { describe, expect, it } from 'vitest'

import { type PathValue, withGraphics } from './graphics'
import { gripAt, gripOfRows, innerPathsOf, pathOfRow, rowsInside } from './scene'

const env: Env = withGraphics(buildPrelude())
const grip = (src: string) => gripAt(parse(`{c = ${src}}`), env, 'binding:c')!
const RECT = '(path.rect [0 0] [10 10])'
const CIRCLE = '(path.circle [50 50] 5)'

describe('what a path is made from', () => {
	it('shows under an offset, a transform and bounds', () => {
		expect(grip(`(path.offset ${RECT} 5)`).sources).toHaveLength(1)
		expect(grip(`(path.transform ${RECT} [1 0 0 1 5 5])`).sources).toHaveLength(1)
		expect(grip(`(path.bounds ${RECT})`).sources).toHaveLength(1)
	})

	it('shows both of what is blended', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).sources).toHaveLength(2)
	})

	it('shows through a style', () => {
		expect(grip(`(style (path.offset ${RECT} 5))`).sources).toHaveLength(1)
	})

	it('is nothing for a path that is made from nothing', () => {
		expect(grip(RECT).sources).toBeUndefined()
	})
})

describe('how an offset goes around corners', () => {
	const area = (src: string): number => {
		const { value } = evaluate(parse(src), env)
		const [[left, top], [right, bottom]] = bounds((value as PathValue).path)
		return (right - left) * (bottom - top)
	}
	const pathOf = (src: string): string =>
		toD((evaluate(parse(src), env).value as PathValue).path)

	it('is mitered until it says otherwise', () => {
		expect(pathOf(`(path.offset ${RECT} 5)`)).toBe(pathOf(`(path.offset ${RECT} 5 join="miter")`))
	})

	it('can be round or beveled', () => {
		const miter = pathOf(`(path.offset ${RECT} 5)`)
		expect(pathOf(`(path.offset ${RECT} 5 join="round")`)).not.toBe(miter)
		expect(pathOf(`(path.offset ${RECT} 5 join="bevel")`)).not.toBe(miter)
	})

	it('has a stroke end by its cap', () => {
		const line = '(path.line [0 0] [10 0])'
		expect(area(`(path.offsetStroke ${line} 4 cap="square")`)).toBeGreaterThan(
			area(`(path.offsetStroke ${line} 4 cap="butt")`)
		)
	})

	it('has a stroke go half of its width to each side, by its handle', () => {
		const [handle] = grip(`(path.offsetStroke ${RECT} 8)`).handles
		expect(handle!.at).toEqual([14, 5])
		expect(handle!.to([20, 5], [14, 5])).toEqual([{ route: [1], value: 20 }])
	})
})

describe('what is around a path', () => {
	it('moves what it is around', () => {
		const changes = grip(`(path.offset ${RECT} 5)`).move!([3, 4])
		expect(changes).toEqual([{ route: [0, 0], value: [3, 4] }])
	})

	it('moves both of what it blends', () => {
		const routes = grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).move!([1, 1]).map(({ route }) => route[0])
		expect(routes).toEqual([0, 1])
	})

	it('says the ratio of a blend or a mix goes from 0 to 1, for it to be a slider', () => {
		for (const src of [`(path.blend ${RECT} ${CIRCLE} 0.5)`, '(color.mix "#ff0000" "#0000ff" 0.5)']) {
			const slot = viewOf(parse(src), env).slots.at(-1)!
			expect(numberOptionsAt(slot)).toMatchObject({ min: 0, max: 1 })
		}
	})

	it('has percent be a type a program can say, as a number that says what it means', () => {
		const { value, diagnostics } = evaluate(parse('(: 0.25 percent)'), env)
		expect(value).toBe(0.25)
		expect(diagnostics).toEqual([])
	})

	it('has percent be shown as one, while it is from 0 to 1', () => {
		const slot = viewOf(parse(`(path.blend ${RECT} ${CIRCLE} 0.5)`), env).slots.at(-1)!
		expect(numberOptionsAt(slot)).toMatchObject({ min: 0, max: 1, scale: 100, suffix: '%' })
	})

	it('has the ratio of a blend go finely, as a number from 0 to 1', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).handles[0]!.fine).toBe(true)
	})

	it('has the ratio of a blend go along the line, and an offset not', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).handles[0]!.along).toBe(true)
		expect(grip(`(path.offset ${RECT} 5)`).handles[0]!.along).toBeUndefined()
	})

	it('pulls the distance of an offset', () => {
		const [handle] = grip(`(path.offset ${RECT} 5)`).handles
		expect(handle!.at).toEqual([15, 5])
		expect(handle!.to([30, 5], [15, 5])).toEqual([{ route: [1], value: 20 }])
	})
})

describe('going into a path', () => {
	const root = parse(`{
		c = (path.offset ${RECT} 5)
		s = (style (path.offset ${RECT} 5))
		b = (path.blend ${RECT} ${CIRCLE} 0.5)
		n = (path.offset (path.transform ${RECT} [1 0 0 1 0 0]) 5)
		p = ${RECT}
	}`)
	const into = (row: string) => innerPathsOf(root, env, `binding:${row}`)

	it('is to what it is made from', () => {
		expect(into('c')).toEqual(['binding:c/arg0'])
	})

	it('is past a style', () => {
		expect(into('s')).toEqual(['binding:s/arg0/arg0'])
	})

	it('is to either of two', () => {
		expect(into('b')).toEqual(['binding:b/arg0', 'binding:b/arg1'])
	})

	it('goes as far as there is', () => {
		expect(into('n')).toEqual(['binding:n/arg0'])
		expect(innerPathsOf(root, env, 'binding:n/arg0')).toEqual(['binding:n/arg0/arg0'])
		expect(innerPathsOf(root, env, 'binding:n/arg0/arg0')).toEqual([])
	})

	it('has nowhere to go in a path made from numbers', () => {
		expect(into('p')).toEqual([])
	})

	it('finds the path of a row inside', () => {
		expect(pathOfRow(root, env, 'binding:c/arg0')).not.toBeNull()
		expect(pathOfRow(root, env, 'binding:c/arg1')).toBeNull()
	})
})

describe('a double click on what is made from several', () => {
	const root = parse(`{c = (path.blend ${RECT} ${CIRCLE} 0.5)}`)
	const [c, inA, inB] = ['binding:c', 'binding:c/arg0', 'binding:c/arg1']

	it('selects all that it is made from', () => {
		expect(rowsInside(root, env, c, [])).toEqual([inA, inB])
		expect(rowsInside(root, env, c, [c])).toEqual([inA, inB])
	})

	it('goes through a style', () => {
		const styled = parse(`{c = (style (path.blend ${RECT} ${CIRCLE} 0.5) fill="#ddd")}`)
		expect(rowsInside(styled, env, c, [c])).toEqual(['binding:c/arg0/arg0', 'binding:c/arg0/arg1'])
	})

	it('narrows them down to the one that it was on', () => {
		expect(rowsInside(root, env, inA, [inA, inB])).toEqual([inA])
	})

	it('has nowhere to go from a path made from nothing', () => {
		expect(rowsInside(root, env, inA, [inA])).toEqual([])
	})

	it('goes on from what is selected inside of it', () => {
		const nested = parse(`{c = (path.offset (path.blend ${RECT} ${CIRCLE} 0.5) 5)}`)
		expect(rowsInside(nested, env, c, ['binding:c/arg0'])).toEqual([
			'binding:c/arg0/arg0',
			'binding:c/arg0/arg1',
		])
	})
})

describe('the handles of several rows', () => {
	const root = parse(`{a = ${RECT} b = ${CIRCLE} m = (path.transform ${RECT} [1 0 0 1 5 5]) g = {n = ${RECT}}}`)
	const rows = ['binding:a', 'binding:b']

	it('are those of all of them, each saying whose', () => {
		const both = gripOfRows(root, env, rows)!
		const a = gripAt(root, env, rows[0]!)!
		const b = gripAt(root, env, rows[1]!)!
		expect(both.grip.handles).toHaveLength(a.handles.length + b.handles.length)
		expect(both.rowOf).toEqual([...a.handles.map(() => rows[0]), ...b.handles.map(() => rows[1])])
		expect(both.grip.move).toBeUndefined()
	})

	it('are as they are of one', () => {
		const one = gripOfRows(root, env, ['binding:a'])!
		expect(one.grip.handles).toHaveLength(gripAt(root, env, 'binding:a')!.handles.length)
		expect(one.grip.move).toBeDefined()
	})

	it('are nothing with nothing selected', () => {
		expect(gripOfRows(root, env, [])).toBeNull()
	})
})

describe('paths combined', () => {
	const A = '(path.rect [0 0] [10 10])'
	const B = '(path.rect [5 0] [10 10])'
	const C = '(path.rect [10 0] [10 10])'
	const size = (src: string): [number, number] => {
		const { value, diagnostics } = evaluate(parse(src), env)
		expect(diagnostics).toEqual([])
		const [[left, top], [right, bottom]] = bounds((value as PathValue).path)
		return [right - left, bottom - top]
	}

	it('unites them', () => {
		expect(size(`(path.unite ${A} ${B})`)).toEqual([15, 10])
	})

	it('takes more than two', () => {
		expect(size(`(path.unite ${A} ${B} ${C})`)).toEqual([20, 10])
	})

	it('subtracts from the first, by the order they are in', () => {
		const leftOf = (src: string): number =>
			bounds((evaluate(parse(src), env).value as PathValue).path)[0][0]
		expect(size(`(path.subtract ${A} ${B})`)).toEqual([5, 10])
		expect(leftOf(`(path.subtract ${A} ${B})`)).toBe(0)
		expect(leftOf(`(path.subtract ${B} ${A})`)).toBe(10)
	})

	it('intersects them', () => {
		expect(size(`(path.intersect ${A} ${B})`)).toEqual([5, 10])
	})

	it('excludes where they overlap', () => {
		expect(size(`(path.exclude ${A} ${B})`)).toEqual([15, 10])
	})

	it('shows all that goes in, and moves all of it', () => {
		const combined = grip(`(path.unite ${A} ${B} ${C})`)
		expect(combined.sources).toHaveLength(3)
		expect(combined.move!([1, 1]).map(({ route }) => route[0])).toEqual([0, 1, 2])
	})

	it('can be gone into, to any of them', () => {
		const root = parse(`{u = (path.unite ${A} ${B} ${C})}`)
		expect(innerPathsOf(root, env, 'binding:u')).toEqual([
			'binding:u/arg0',
			'binding:u/arg1',
			'binding:u/arg2',
		])
	})
})

describe('what else goes around a path', () => {
	const Q = '(path.rect [0 0] [40 20])'
	const ofFilter = (src: string) => evaluate(parse(src), env)
	const FILTERS = [
		`(path.roundCorners ${Q} 5)`,
		`(path.chamfer ${Q} 5)`,
		`(path.mirror ${Q} [40 0] [40 20])`,
		`(path.reflect ${Q} [40 0] [40 20])`,
		`(path.zigzag ${Q} 2 10)`,
		`(path.wave ${Q} 2 10)`,
		`(path.twirl ${Q} [20 10] 30 90)`,
		`(path.bulge ${Q} [20 10] 30 0.5)`,
		`(path.dash ${Q} [5 5])`,
		`(path.subdivide ${Q} 2)`,
		`(path.flatten ${Q} 1)`,
		`(path.reverse ${Q})`,
		`(path.convexHull ${Q})`,
	]

	it.each(FILTERS)('%s comes to a path, without a problem', src => {
		const { value, diagnostics } = ofFilter(src)
		expect(diagnostics).toEqual([])
		expect(toD((value as PathValue).path)).toMatch(/^M/)
	})

	it.each(FILTERS)('%s shows what it is of, and moves it', src => {
		const held = grip(src)
		expect(held.sources).toHaveLength(1)
		expect(held.move!([1, 1])[0]!.route[0]).toBe(0)
	})

	it('has a mirror go both ways, and a reflection only the other', () => {
		const widthOf = (src: string): number => {
			const [[left], [right]] = bounds((ofFilter(src).value as PathValue).path)
			return right - left
		}
		expect(widthOf(`(path.mirror ${Q} [40 0] [40 20])`)).toBe(80)
		expect(widthOf(`(path.reflect ${Q} [40 0] [40 20])`)).toBe(40)
	})

	it('starts a mirror on the side of what it mirrors', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.mirror')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('[40 0] [40 20]')
	})

	it('starts what goes around a center at the middle of it', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.twirl')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('[20 10] 30')
	})

	it.each([
		['path.roundCorners', '10'],
		['path.chamfer', '10'],
		['path.twirl', '90'],
		['path.bulge', '0.5'],
		['path.offset', '10'],
		['path.zigzag', '5 20'],
	])('starts %s at something that shows, and not at nothing', (name, written) => {
		const filter = filtersFor([ofFilter(Q).value], env).find(it => it.name === name)!
		const next = print(wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!)
		expect(next).toContain(`${written})`)
	})

	it('pulls the radius of its corners, from a corner', () => {
		const [handle] = grip(`(path.roundCorners ${Q} 5)`).handles
		expect(handle!.at).toEqual([35, 0])
		expect(handle!.to([30, 0], [35, 0])).toEqual([{ route: [1], value: 10 }])
	})
})
