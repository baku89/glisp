import { buildPrelude, check, type Env, evaluate, parse, print, type TypedHostFn } from '@glisp/lang'
import { filtersFor, wrappedAt } from '@glisp/tweeq/filters'
import { isAngleInput, isSizeInput, isTranslatable, numberOptionsAt, summaryOf, viewOf } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'
import { toD } from 'pave/path/svg'
import { describe, expect, it } from 'vitest'

import { type PathValue, withGraphics } from './graphics'
import { changed, gripAt, gripOfRows, innerPathsOf, pathOfRow, rowsInside } from './scene'

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

describe('what is copied by a matrix', () => {
	const pieces = (src: string): number =>
		(evaluate(parse(src), env).value as PathValue).path.curves.length
	const span = (src: string): readonly [number, number] => {
		const [[left], [right]] = bounds((evaluate(parse(src), env).value as PathValue).path)
		return [left, right]
	}
	const BY = '[1 0 0 1 20 0]'

	it('has one for each number of times in the range, the ends included', () => {
		expect(pieces(`(path.replicate ${RECT} ${BY} 0 3)`)).toBe(4)
		expect(pieces(`(path.replicate ${RECT} ${BY} 2 2)`)).toBe(1)
	})

	it('starts where it says, and leaves the path out if 0 is not in the range', () => {
		expect(span(`(path.replicate ${RECT} ${BY} 0 3)`)).toEqual([0, 70])
		expect(span(`(path.replicate ${RECT} ${BY} 1 3)`)).toEqual([20, 70])
	})

	it('goes back by the inverse below 0', () => {
		expect(span(`(path.replicate ${RECT} ${BY} -2 1)`)).toEqual([-40, 30])
		expect(span(`(path.replicate ${RECT} ${BY} -2 -1)`)).toEqual([-40, -10])
	})

	it('is the same range whichever end comes first', () => {
		expect(span(`(path.replicate ${RECT} ${BY} 3 1)`)).toEqual([20, 70])
	})

	it('applies the matrix to what it has come to, each time', () => {
		expect(span(`(path.replicate ${RECT} [2 0 0 2 0 0] 2 2)`)).toEqual([0, 40])
	})

	it('leaves out going back by what cannot be undone', () => {
		expect(pieces(`(path.replicate ${RECT} [0 0 0 0 0 0] -2 1)`)).toBe(2)
	})

	it('stops somewhere', () => {
		expect(pieces(`(path.replicate ${RECT} ${BY} 0 1000000)`)).toBe(1001)
	})

	it('starts as a matrix that can be read, a little to the right', () => {
		const filter = filtersFor([evaluate(parse(RECT), env).value], env).find(({ name }) => name === 'path.replicate')!
		const next = wrappedAt(parse(`{c = ${RECT}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('(mat2d.trs [50 0]) 0 3')
		expect(check(next, env).filter(({ level }) => level === 'error')).toEqual([])
	})

	it('has what it starts as be what it would fall back to', () => {
		const { value } = evaluate(parse('(mat2d.trs [50 0])'), env)
		expect(value).toEqual([1, 0, 0, 1, 50, 0])
		expect(span(`(path.replicate ${RECT} () 0 1)`)).toEqual([0, 60])
	})

	it('is held at the next copy when it is written as a call, too', () => {
		const held = grip(`(path.replicate ${RECT} (mat2d.trs [20 0]) 0 3)`)
		const center = held.handles.find(({ kind, stays }) => kind === 'translate' && !stays)!
		expect(center.at).toEqual([25, 5])
		expect(center.to([35, 15], [25, 5])).toEqual([{ route: [1, 0], value: [30, 10] }])
	})

	it('says what is left unsaid of the call, in order', () => {
		const { value } = evaluate(parse('(mat2d.trs [10 20] 90 [2 2])'), env)
		const [a, b, c, d, tx, ty] = value as number[]
		expect([a, d, tx, ty].map(n => Math.round(n * 1e6) / 1e6)).toEqual([0, 0, 10, 20])
		expect([b, c].map(n => Math.round(n * 1e6) / 1e6)).toEqual([2, -2])
		const held = grip(`(path.replicate ${RECT} (mat2d.trs [0 0]) 0 3)`)
		const corner = held.handles.find(({ kind }) => kind === 'point')!
		expect(corner.to(corner.at!, corner.at!).map(({ route }) => route)).toEqual([[1, 1], [1, 2]])
	})

	it('is held at the next copy, and pulling that says where it goes', () => {
		const held = grip(`(path.replicate ${RECT} ${BY} 0 3)`)
		const center = held.handles.find(({ kind }) => kind === 'translate')!
		expect(center.at).toEqual([25, 5])
		expect(center.to([35, 15], [25, 5])).toEqual([{ route: [1], value: [1, 0, 0, 1, 30, 10] }])
	})

	it('goes by what a matrix is, rather than its six numbers', () => {
		const by = filtersFor([evaluate(parse(RECT), env).value], env)
			.find(({ name }) => name === 'path.replicate')!.fn.paramTypes[1]!
		expect(summaryOf(by)).toBe('Transform')
		expect(by.meta?.get('icon')).toBeDefined()
	})

	it('has each part of a matrix taken hold of as what it is', () => {
		const { paramTypes } = evaluate(parse('mat2d.trs'), env).value as TypedHostFn
		expect(isTranslatable(paramTypes[0]!)).toBe(true)
		expect(isAngleInput(paramTypes[1]!)).toBe(true)
		expect(isSizeInput(paramTypes[2]!)).toBe(true)
		expect(paramTypes[2]!.default).toEqual([1, 1])
	})

	it('shows what it copies, and moves that rather than the matrix', () => {
		const held = grip(`(path.replicate ${RECT} ${BY} 0 3)`)
		expect(held.sources).toHaveLength(1)
		expect(held.handles.length).toBeGreaterThan(0)
		expect(held.move?.([5, 5])?.[0]?.route[0]).toBe(0)
	})
})

describe('what a matrix goes around', () => {
	const applied = (src: string, [x, y]: readonly [number, number]) => {
		const m = evaluate(parse(src), env).value as number[]
		return [m[0]! * x + m[2]! * y + m[4]!, m[1]! * x + m[3]! * y + m[5]!].map(n => Number(n.toFixed(6)) + 0)
	}
	const handles = (src: string) => grip(src).handles

	it('leaves its pivot where it is, but for how far it moves', () => {
		expect(applied('(mat2d.trs [10 0] 90 [2 2] [100 100])', [100, 100])).toEqual([110, 100])
		expect(applied('(mat2d.trs [0 0] 90 [1 1] [100 100])', [110, 100])).toEqual([100, 110])
	})

	it('is the origin until it is said', () => {
		expect(evaluate(parse('(mat2d.trs [10 0] 90 [2 2] [0 0])'), env).value).toEqual(
			evaluate(parse('(mat2d.trs [10 0] 90 [2 2])'), env).value
		)
		expect(handles('(mat2d.trs [10 0])').find(h => h.name === 'pivot')!.at).toEqual([0, 0])
	})

	it('can be taken hold of, saying what comes before it', () => {
		const root = parse('{c = (mat2d.trs [10 0])}')
		const pivot = gripAt(root, env, 'binding:c')!.handles.find(h => h.name === 'pivot')!
		const { ast: next } = changed(root, env, 'binding:c', pivot.to([30, 40], [0, 0]))
		expect(print(next!)).toContain('(mat2d.trs [10 0] 0 [1 1] [30 40])')
	})

	it('stays where it is while the rest is at the next copy', () => {
		const copies = handles('(path.replicate (path.rect [100 100] [20 20]) (mat2d.trs [30 0] 0 [1 1] [50 50]) 0 3)')
		expect(copies.find(h => h.name === 'pivot')!.at).toEqual([50, 50])
		expect(copies.at(-1)!.at).toEqual([140, 110])
	})
})
