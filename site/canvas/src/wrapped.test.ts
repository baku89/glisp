import { type AST, buildPrelude, check, type Env, evaluate, LetAST, print, Session, type TypedHostFn } from '@glisp/lang'
import { parse } from './program.testing'
import { filtersFor, wrappedAt } from '@glisp/tweeq/filters'
import { withSlotCommand } from '@glisp/tweeq/rowsClipboard'
import { isAngleInput, isSizeInput, isTranslatable, numberOptionsAt, referenceAt, summaryOf, viewOf } from '@glisp/tweeq/structure'
import { bounds } from 'pave/path/metrics'
import { toD } from 'pave/path/svg'
import { describe, expect, it } from 'vitest'

import { BOX_ANSWERS, type PathValue, withGraphics } from './graphics'
import { boundsOfRows, boxHandlesOf, changed, gripAt, gripOfRows, innerPathsOf, linked, pathOfRow, rowsInside, sceneOf, snapPointsOf, withPaint } from './scene'

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

	it('has the ratio of a blend go along the line, and an offset as well', () => {
		expect(grip(`(path.blend ${RECT} ${CIRCLE} 0.5)`).handles[0]!.along).toBe(true)
		expect(grip(`(path.offset ${RECT} 5)`).handles[0]!.along).toBe(true)
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
		`(path.mirror ${Q} (line.fromPoints [40 0] [40 20]))`,
		`(path.reflect ${Q} (line.fromPoints [40 0] [40 20]))`,
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
		expect(widthOf(`(path.mirror ${Q} (line.fromPoints [40 0] [40 20]))`)).toBe(80)
		expect(widthOf(`(path.reflect ${Q} (line.fromPoints [40 0] [40 20]))`)).toBe(40)
	})

	it('starts a mirror on the side of what it mirrors', () => {
		const filter = filtersFor([ofFilter(Q).value], env).find(({ name }) => name === 'path.mirror')!
		const next = wrappedAt(parse(`{c = ${Q}}`), env, 'binding:c', filter)!
		expect(print(next)).toContain('(line.fromPoints [40 0] [40 20])')
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

describe('changing only how a path is painted', () => {
	it('leaves the path as it was, not worked out again', () => {
		const session = new Session(env)
		const painted = (fill: string) =>
			session.setAst(
				new LetAST(
					(parse(`{u = (style (path.unite ${RECT} ${CIRCLE}) fill="${fill}")}`) as LetAST).bindings,
					null
				)
			)
		painted('#ff0000')
		const before = pathOfRow(session.ast(), session.env, 'binding:u')
		painted('#00ff00')
		expect(before).not.toBeNull()
		expect(pathOfRow(session.ast(), session.env, 'binding:u')!.path).toBe(before!.path)
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

describe('painting what refers to the corners of what is also painted', () => {
	/** Two polygons, and a line from a corner of one to a corner of the other. */
	const joined = (): AST => {
		const root = parse(
			'{a = (path.ngon [0 0] 50 5 10) b = (path.ngon [200 0] 50 5 70) l = (path.line [60 0] [140 0])}'
		)
		const snaps = snapPointsOf(root, env, sceneOf(root, env))
		const corner = (row: string) => snaps.find(({ code }) => code?.of === row)!
		return linked(linked(root, env, 'binding:l', 0, corner('binding:a'))!, env, 'binding:l', 1, corner('binding:b'))!
	}
	const drawnOf = (root: AST, row: string) => toD(pathOfRow(root, env, row)!.path)
	const errors = (root: AST) => check(root, env).filter(({ level }) => level === 'error')
	const painted = (root: AST, rows: readonly string[], stroke: string): AST =>
		rows.reduce((program, row) => withPaint(program, env, row, { stroke }), root)
	const ROWS = ['binding:a', 'binding:b', 'binding:l']

	it('keeps the line where it is, in whichever order they are painted', () => {
		const root = joined()
		for (const rows of [ROWS, [...ROWS].reverse(), ['binding:l'], ['binding:a']]) {
			const next = painted(root, rows, '#000000')
			expect(errors(next)).toEqual([])
			expect(drawnOf(next, 'binding:l')).toBe(drawnOf(root, 'binding:l'))
		}
	})

	it('comes back to what was written once it is no longer painted', () => {
		const root = joined()
		expect(print(painted(painted(root, ROWS, '#000000'), ROWS, 'none'))).toBe(print(root))
	})

	it('has the line follow what is moved, as before', () => {
		const next = painted(joined(), ROWS, '#000000')
		const moved = changed(next, env, 'binding:a', gripAt(next, env, 'binding:a')!.move!([10, 0])).ast!
		expect(drawnOf(moved, 'binding:l')).not.toBe(drawnOf(next, 'binding:l'))
		expect(errors(moved)).toEqual([])
	})
})

describe('putting a filter around what is referred to', () => {
	it('leaves what refers to its center where it was', () => {
		const root = parse('{a = (path.circle [10 0] 5) p = (path.circle ./a/center 2)}')
		const filter = filtersFor([evaluate(parse('(path.circle [0 0] 1)'), env).value], env).find(({ name }) => name === 'path.offset')!
		const next = wrappedAt(root, env, 'binding:a', filter)!
		expect(check(next, env).filter(({ level }) => level === 'error')).toEqual([])
		expect(toD(pathOfRow(next, env, 'binding:p')!.path)).toBe(toD(pathOfRow(root, env, 'binding:p')!.path))
	})
})

describe('what wants a path, of what has a style', () => {
	const STYLED = '(style (path.circle [0 0] 5) fill="#ff0000")'
	const errors = (root: AST) => check(root, env).filter(({ level }) => level === 'error')
	const picked = (src: string, source: string, target: string) => {
		const next = referenceAt(parse(src), env, source, target)!
		expect(errors(next)).toEqual([])
		return print(next)
	}

	it('refers to the path in it when one is picked', () => {
		expect(picked(`{a = ${STYLED} o = (path.offset ${RECT} 5)}`, 'binding:o/arg0', 'binding:a')).toContain(
			'o = (path.offset /a/path 5)'
		)
	})

	it('finds it however a style is given it', () => {
		const given = '(style fill="#ff0000" path=(path.circle [0 0] 5))'
		expect(picked(`{a = ${given} o = (path.offset ${RECT} 5)}`, 'binding:o/arg0', 'binding:a')).toContain(
			'o = (path.offset /a/path 5)'
		)
	})

	it('still refers by name to a path with no style, or where any value will do', () => {
		expect(picked(`{a = ${RECT} o = (path.offset ${RECT} 5)}`, 'binding:o/arg0', 'binding:a')).toContain(
			'o = (path.offset a 5)'
		)
		expect(picked(`{a = ${STYLED} o = 0}`, 'binding:o', 'binding:a')).toContain('o = a')
	})

	it('goes no further in than a style, to what only happens to fit', () => {
		const next = referenceAt(parse(`{a = ${CIRCLE} p = (path.circle [0 0] 1)}`), env, 'binding:p/arg0', 'binding:a')!
		expect(print(next)).toContain('p = (path.circle a 1)')
	})

	describe('once what is referred to by name is given one', () => {
		const SRC = `{a = ${RECT} o = (path.offset a 5) u = (path.unite ${CIRCLE} a) same = a}`
		const styled = () => withPaint(parse(SRC), env, 'binding:a', { fill: '#ff0000' })

		it('goes to the path in it, drawing as it did', () => {
			const next = styled()
			expect(print(next)).toContain('o = (path.offset /a/path 5)')
			expect(print(next)).toContain('/a/path)')
			expect(errors(next)).toEqual([])
			for (const row of ['binding:o', 'binding:u']) {
				expect(toD(pathOfRow(next, env, row)!.path)).toBe(toD(pathOfRow(parse(SRC), env, row)!.path))
			}
		})

		it('leaves a name where it can be what it is', () => {
			expect(print(styled())).toContain('same = a')
		})

		it('is by name again when the style is gone', () => {
			expect(print(withPaint(styled(), env, 'binding:a', { fill: 'none' }))).toBe(print(parse(SRC)))
		})

		it('can still be taken hold of through the path', () => {
			const next = styled()
			const held = gripAt(next, env, 'binding:o')!
			expect(held.sources).toHaveLength(1)
			const moved = changed(next, env, 'binding:o', held.move!([1, 0])).ast!
			expect(errors(moved)).toEqual([])
			expect(print(moved)).toContain('(path.rect [1 0] [10 10])')
		})
	})

	it('leaves a name to what a filter comes to, which fits as well', () => {
		const root = parse(`{a = ${RECT} o = (path.offset a 5)}`)
		const filter = filtersFor([evaluate(parse(RECT), env).value], env).find(({ name }) => name === 'path.offset')!
		expect(print(wrappedAt(root, env, 'binding:a', filter)!)).toContain('o = (path.offset a 5)')
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

describe('what is moved, where it refers to a place on something else', () => {
	const at = (source: string, move: readonly [number, number]) => {
		const root = parse(`{a = ${source} b = (path.circle [0 0] 20)}`)
		const snap = snapPointsOf(root, env, sceneOf(root, env)).find(({ code }) => code?.of === 'binding:a')!
		const next = linked(root, env, 'binding:b', 0, snap)!
		return { snap, ...changed(next, env, 'binding:b', gripAt(next, env, 'binding:b')!.move!(move as [number, number])) }
	}

	it.each([
		['(path.circle [100 100] 50)', '(path.circle [110 105] 50)'],
		['(path.ellipse [100 100] [50 50] 30)', '(path.ellipse [110 105] [50 50] 30)'],
		['(path.ngon [100 100] 50 5)', '(path.ngon [110 105] 50 5)'],
	])('moves %s with it, and leaves the rest of it as it is', (source, moved) => {
		const { ast, problem } = at(source, [10, 5])
		expect(problem).toBe(null)
		expect(print(ast!)).toContain(`a = ${moved}`)
	})

	it('leaves half as what the middle of a line is', () => {
		const root = parse('{a = (path.line [50 60] [150 90]) b = (path.circle [0 0] 20)}')
		const middle = snapPointsOf(root, env, sceneOf(root, env)).find(({ label, code }) => label === 'middle' && code?.of === 'binding:a')!
		const next = linked(root, env, 'binding:b', 0, middle)!
		const moved = changed(next, env, 'binding:b', gripAt(next, env, 'binding:b')!.move!([10, 5]))
		expect(moved.problem).toBe(null)
		expect(print(moved.ast!)).toContain('@2) (/ (+')
		expect(print(moved.ast!)).toContain('(path.line [50 60] [170 100])')
	})

	it('can refer to the top of a circle, where going round is not exact', () => {
		const root = parse('{a = (path.circle [100 100] 50) b = (path.circle [0 0] 20)}')
		const top = snapPointsOf(root, env, sceneOf(root, env)).find(({ label, code }) => label === 'top' && code?.of === 'binding:a')!
		expect(print(linked(root, env, 'binding:b', 0, top)!)).toContain('(- /a/center/1 /a/radius)')
	})

	it.each([[10, 0], [0, 5], [-7.5, 3.25]] as const)('moves it by %s, %s just as well', (x, y) => {
		expect(at('(path.ellipse [100 100] [50 50] 30)', [x, y]).problem).toBe(null)
	})
})

describe('what is across a line', () => {
	const across = (line: string) => grip(`(path.mirror ${RECT} ${line})`)
	const on = (src: string) => bounds((evaluate(parse(src), env).value as PathValue).path)

	it('takes a line, and has no ends of its own', () => {
		const { paramNames } = evaluate(parse('path.mirror'), env).value as TypedHostFn
		expect(paramNames).toEqual(['path', 'line'])
	})

	it('has the handles of how the line comes about', () => {
		expect(across('(line.fromPoints [10 0] [10 10])').handles.map(({ kind }) => kind)).toEqual(['point', 'point', 'button'])
		expect(across('(line.at [10 0] 90)').handles.map(({ kind }) => kind)).toEqual(['point', 'direction', 'button'])
		expect(across('[[10 0] [0 10]]').handles.map(({ kind }) => kind)).toEqual(['point', 'point', 'button'])
	})

	it('writes to what the line is made of', () => {
		const [start] = across('(line.fromPoints [10 0] [10 10])').handles
		expect(start!.to([20, 0], [10, 0])).toEqual([{ route: [1, 0], value: [20, 0] }])
	})

	it('turns over what a mirror keeps, by a press', () => {
		const flip = across('(line.fromPoints [10 0] [10 10])').handles.find(({ kind }) => kind === 'button')!
		expect(flip.to(flip.at!, flip.at!)).toEqual([
			{ route: [1, 0], value: [10, 10] },
			{ route: [1, 1], value: [10, 0] },
		])
		// The arrow points the way it is mirrored, away from the side that is kept.
		expect(flip.angle).toBe(0)
		const [[, top], [, bottom]] = on(`(path.mirror (path.rect [0 0] [10 2]) (line.fromPoints [10 5] [0 5]))`)
		expect(top).toBeCloseTo(0)
		expect(bottom).toBeCloseTo(10)
		expect(on(`(path.mirror (path.rect [0 0] [10 2]) (line.fromPoints [0 5] [10 5]))`)[0][1]).toBe(Infinity)
	})

	it('has nothing to turn over in a reflection, where both sides are kept', () => {
		const held = grip(`(path.reflect ${RECT} (line.fromPoints [10 0] [10 10]))`)
		expect(held.handles.map(({ kind }) => kind)).toEqual(['point', 'point'])
	})

	it('leaves it as it is, across a line that goes nowhere', () => {
		expect(on(`(path.mirror ${RECT} (line.fromPoints [5 5] [5 5]))`)).toEqual(on(RECT))
	})
})

describe('the box around what is selected', () => {
	const shapesOf = (src: string) => sceneOf(parse(src), env)
	const SRC = '{a = (path.rect [0 0] [10 10]) b = (path.circle [50 50] 10) p = (style (path.rect [100 0] [10 10]) fill="#000000")}'

	it('goes around one, or all of several', () => {
		expect(boundsOfRows(shapesOf(SRC), ['binding:a'])).toEqual([[0, 0], [10, 10]])
		const [[left, top], [right, bottom]] = boundsOfRows(shapesOf(SRC), ['binding:a', 'binding:b'])!
		expect([left, top]).toEqual([0, 0])
		expect(right).toBeCloseTo(60)
		expect(bottom).toBeCloseTo(60)
	})

	it('goes around what has a style, and what is in a group', () => {
		expect(boundsOfRows(shapesOf(SRC), ['binding:p'])).toEqual([[100, 0], [110, 10]])
		const grouped = '{g = {a = (path.rect [0 0] [10 10]) b = (path.rect [20 20] [10 10])}}'
		expect(boundsOfRows(shapesOf(grouped), ['binding:g'])).toEqual([[0, 0], [30, 30]])
	})

	it('is nothing for what has no size to go around', () => {
		expect(boundsOfRows(shapesOf(SRC), [])).toBeNull()
		expect(boundsOfRows(shapesOf('{n = 1 a = (path.rect [0 0] [1 1])}'), ['binding:n'])).toBeNull()
	})
})

describe('what each thing says to the box around it', () => {
	const held = (src: string) => grip(src)
	const dragged = (src: string, way: 'corner' | 'side', to: [number, number], how = {}) => {
		const root = parse(`{c = ${src}}`)
		const g = gripAt(root, env, 'binding:c')!
		const box = boundsOfRows(sceneOf(root, env), ['binding:c'])!
		const handles = boxHandlesOf(box, g.box!)
		const handle = handles.find(({ corner }) => (way === 'corner' ? corner : !corner))!
		const { ast } = changed(root, env, 'binding:c', handle.to(to, handle.at!, how))
		return print(ast!)
	}

	it('is something from all that comes to a path', () => {
		const { members } = evaluate(parse('path'), env).value as { members: Record<string, unknown> }
		const silent = Object.entries(members)
			.filter(([, fn]) => (fn as TypedHostFn).returnType === evaluate(parse('path'), env).value)
			.filter(([, fn]) => !BOX_ANSWERS.has(fn))
			.map(([name]) => name)
		expect(silent).toEqual([])
	})

	it('has the sides only for what can go by a different scale each way', () => {
		const handlesOf = (src: string) => boxHandlesOf([[0, 0], [10, 10]], held(src).box!)
		expect(handlesOf('(path.rect [0 0] [10 10])')).toHaveLength(8)
		expect(handlesOf('(path.ellipse [5 5] [5 5])')).toHaveLength(8)
		expect(handlesOf('(path.d "M0 0 L10 10")')).toHaveLength(8)
		expect(handlesOf('(path.circle [5 5] 5)')).toHaveLength(4)
		expect(handlesOf('(path.ngon [5 5] 5 5)')).toHaveLength(4)
		expect(handlesOf('(path.ellipse [5 5] [5 3] 30)')).toHaveLength(8)
		expect(handlesOf('(path.superellipse [5 5] [5 3] 2)')).toHaveLength(8)
	})

	it('has nothing to say for what comes of something else', () => {
		expect(held('(path.offset (path.rect [0 0] [10 10]) 5)').box).toBeUndefined()
	})

	it('passes through a style, to what is in it', () => {
		const answer = held('(style (path.rect [0 0] [10 10]) fill="#000000")').box!
		expect(answer.even).toBe(false)
		expect(answer.scaled(2, 1, [0, 0])[1]).toEqual({ route: [0, 1], value: [20, 10] })
	})

	it('is scaled from the corner across', () => {
		expect(dragged('(path.rect [0 0] [10 10])', 'corner', [-10, -10])).toContain('(path.rect [-10 -10] [20 20])')
		expect(dragged('(path.d "M0 0 L10 10")', 'corner', [-10, -10])).toContain('M -10,-10 L 10,10')
	})

	it('goes by one scale, for what can only go by that', () => {
		const next = dragged('(path.circle [10 10] 10)', 'corner', [-10, 0])
		expect(next).toContain('(path.circle [5 5] 15)')
	})

	it('goes with an ellipse that is turned, along its axes', () => {
		const root = parse('{c = (path.ellipse [0 0] [20 10] 90)}')
		const answer = gripAt(root, env, 'binding:c')!.box!
		expect(answer.angle).toBe(90)
		const box = boundsOfRows(sceneOf(root, env), ['binding:c'], 90)!
		expect(box[0][0]).toBeCloseTo(-20)
		expect(box[0][1]).toBeCloseTo(-10)
		expect(box[1][0]).toBeCloseTo(20)
		expect(box[1][1]).toBeCloseTo(10)
		// Pulling the side along its own axis, which is down the canvas.
		const side = boxHandlesOf(box, answer).find(({ corner, at }) => !corner && Math.abs(at![1] - 20) < 1e-6)!
		const [center, radius] = side.to([0, 30], side.at!) as { value: number[] }[]
		expect(radius!.value[0]).toBeCloseTo(25)
		expect(radius!.value[1]).toBeCloseTo(10)
		expect(center!.value[0]).toBeCloseTo(0)
		expect(center!.value[1]).toBeCloseTo(5)
	})

	it('goes from the middle, with OPT', () => {
		expect(dragged('(path.rect [0 0] [10 10])', 'corner', [-5, -5], { symmetric: true })).toContain(
			'(path.rect [-5 -5] [20 20])'
		)
	})
})

describe('blending by steps', () => {
	const A = '(path.rect [0 0] [10 10])'
	const B = '(path.rect [100 0] [10 10])'
	const pathOfIt = (src: string) => (evaluate(parse(src), env).value as PathValue).path

	it('is both of them, and as many as it says between', () => {
		expect(pathOfIt(`(path.blendSteps ${A} ${B} 3)`).curves).toHaveLength(5)
		expect(pathOfIt(`(path.blendSteps ${A} ${B} 0)`).curves).toHaveLength(2)
	})

	it('has them evenly between', () => {
		const lefts = pathOfIt(`(path.blendSteps ${A} ${B} 1)`).curves.map(
			({ vertices }) => Math.min(...vertices.map(({ point }) => point[0]))
		)
		expect(lefts).toEqual([0, 50, 100])
	})

	it('goes by whole steps, and none for fewer than none', () => {
		expect(pathOfIt(`(path.blendSteps ${A} ${B} 1.6)`).curves).toHaveLength(4)
		expect(pathOfIt(`(path.blendSteps ${A} ${B} -2)`).curves).toHaveLength(2)
	})

	it('shows and moves both of what it goes between', () => {
		const held = grip(`(path.blendSteps ${A} ${B} 3)`)
		expect(held.sources).toHaveLength(2)
		expect(held.move!([1, 1]).map(({ route }) => route[0])).toEqual([0, 1])
	})

	it('is among what two paths can be put into', () => {
		const names = filtersFor([evaluate(parse(A), env).value, evaluate(parse(B), env).value], env).map(({ name }) => name)
		expect(names).toContain('path.blendSteps')
	})
})

describe('going one step on what is in a modifier', () => {
	const stepped = (src: string, row = 'binding:a') => {
		const next = withSlotCommand(parse(src), env, [row], 'step')
		return next === null ? null : print(next).replace(/\s+/g, ' ')
	}

	it('goes by what it is given first', () => {
		expect(stepped('{a = (path.offset (path.circle [10 10] 5) 2)}')).toContain('(path.offset (path.ellipse [10 10] [5 5]) 2)')
		expect(stepped('{a = (path.offset (path.ellipse [10 10] [5 5]) 2)}')).toMatch(/path\.offset \(path\.d "M 15,10/)
		expect(stepped('{a = (style (path.circle [10 10] 5) fill="#000000")}')).toContain('(style (path.ellipse [10 10] [5 5]) fill=')
	})

	it('goes one of them at a time', () => {
		expect(stepped('{a = (path.blend (path.circle [10 10] 5) (path.rect [0 0] [5 5]) 0.5)}')).toContain(
			'(path.blend (path.ellipse [10 10] [5 5]) (path.rect [0 0] [5 5]) 0.5)'
		)
	})

	it('works out the modifier, when there is nothing left in it to step', () => {
		const next = stepped('{a = (path.offset (path.d "M 0,0 L 10,0 L 10,10 Z") 2)}')
		expect(next).toMatch(/a = \(path\.d "/)
		expect(next).not.toContain('offset')
	})

	it('works out the modifier around what has come to as much as it can', () => {
		const arcs = '(path.d "M 200,150 A 50,50 0 0 1 100,150 A 50,50 0 0 1 200,150 Z")'
		expect(stepped(`{a = (path.offset ${arcs} 10)}`)).not.toContain('offset')
	})

	it('leaves alone what is locked, and a name', () => {
		expect(stepped('{a = (path.offset @(path.circle [10 10] 5) 2)}')).not.toContain('offset')
		expect(stepped('{c = (path.circle [10 10] 5) a = (path.offset c 2)}')).not.toContain('(path.offset (path')
	})
})

describe('the convex hull of several', () => {
	const A = '(path.rect [0 0] [10 10])'
	const B = '(path.rect [100 50] [10 10])'
	const C = '(path.circle [50 200] 10)'
	const box = (src: string) => bounds((evaluate(parse(src), env).value as PathValue).path)

	it('fits all that it is given, however many', () => {
		expect(box(`(path.convexHull ${A})`)).toEqual([[0, 0], [10, 10]])
		expect(box(`(path.convexHull ${A} ${B})`)).toEqual([[0, 0], [110, 60]])
		const [, [, bottom]] = box(`(path.convexHull ${A} ${B} ${C})`)
		expect(bottom).toBeCloseTo(210)
	})

	it('is one shape, and not one for each', () => {
		const { path } = evaluate(parse(`(path.convexHull ${A} ${B})`), env).value as PathValue
		expect(path.curves).toHaveLength(1)
	})

	it('shows and moves all of them', () => {
		const held = grip(`(path.convexHull ${A} ${B})`)
		expect(held.sources).toHaveLength(2)
		expect(held.move!([1, 1]).map(({ route }) => route[0])).toEqual([0, 1])
	})

	it('numbers them, as all of one kind, and adds another path', () => {
		const { slots, append } = viewOf(parse(`(path.convexHull ${A} ${B})`), env)
		expect(slots.map(({ label }) => label)).toEqual(['0', '1'])
		expect(append?.label.toLowerCase()).toBe('path')
	})

	it('comes to nothing, of nothing', () => {
		expect(box('(path.convexHull)')[0][0]).toBe(Infinity)
	})

	it('is among what several paths can be put into', () => {
		const values = [A, B, C].map(src => evaluate(parse(src), env).value)
		expect(filtersFor(values, env).map(({ name }) => name)).toContain('path.convexHull')
	})
})

describe('a shadow and a ray', () => {
	const A = '(path.rect [0 0] [10 10])'
	const box = (src: string) => bounds((evaluate(parse(src), env).value as PathValue).path)

	it('has a shadow reach as far as it goes', () => {
		expect(box(`(path.shadow ${A} [20 0])`)).toEqual([[0, 0], [30, 10]])
		expect(box(`(path.shadow ${A} [0 0])`)).toEqual([[0, 0], [10, 10]])
	})

	it('takes hold of a shadow where it goes to', () => {
		const held = grip(`(path.shadow ${A} [20 0])`)
		expect(held.handles[0]!.at).toEqual([25, 5])
		expect(held.handles[0]!.to([35, 15], [25, 5])).toEqual([{ route: [1], value: [30, 10] }])
		expect(held.sources).toHaveLength(1)
	})

	it('has a shadow from a light go out from it', () => {
		const [[left], [right]] = box(`(path.shadowFrom ${A} [-10 5] 2)`)
		expect(left).toBeCloseTo(0)
		expect(right).toBeCloseTo(30)
	})

	it('takes hold of a light, and how far it reaches', () => {
		const [light, reach] = grip(`(path.shadowFrom ${A} [-10 5] 2)`).handles
		expect(light!.to([0, 0], [-10, 5])).toEqual([{ route: [1], value: [0, 0] }])
		expect(reach!.at).toEqual([20, 5])
		expect(reach!.to([35, 5], [20, 5])).toEqual([{ route: [2], value: 3 }])
	})

	it('stops a ray where it first hits', () => {
		expect(box(`(path.ray ${A} [-20 5] [-10 5])`)).toEqual([[-20, 5], [0, 5]])
	})

	it('has a ray go on, if it hits nothing, and be nothing if it goes no way', () => {
		const [, [right]] = box(`(path.ray ${A} [20 5] [30 5])`)
		expect(right).toBeGreaterThan(10000)
		expect(box(`(path.ray ${A} [20 5] [20 5])`)[0][0]).toBe(Infinity)
	})

	it('starts from around what it is of', () => {
		for (const [name, written] of [['path.ray', '[-40 5] [5 5]'], ['path.shadowFrom', '[-40 -40]']] as const) {
			const filter = filtersFor([evaluate(parse(A), env).value], env).find(f => f.name === name)!
			expect(print(wrappedAt(parse(`{c = ${A}}`), env, 'binding:c', filter)!)).toContain(written)
		}
	})
})

describe('repeating along a path', () => {
	const LINE = '(path.line [0 0] [100 0])'
	const STAMP = '(path.rect [500 500] [4 4])'
	const of = (src: string) => (evaluate(parse(src), env).value as PathValue).path

	it('has as many as it says, from one end to the other of what is open', () => {
		expect(of(`(path.repeatAlong ${LINE} ${STAMP} 3)`).curves).toHaveLength(3)
		const [[left], [right]] = bounds(of(`(path.repeatAlong ${LINE} ${STAMP} 3 0 false)`))
		expect(left).toBeCloseTo(-2)
		expect(right).toBeCloseTo(102)
	})

	it('has the middle of a shape on the path, wherever it was drawn', () => {
		const [[, top], [, bottom]] = bounds(of(`(path.repeatAlong ${LINE} ${STAMP} 1 0 false)`))
		expect(top).toBeCloseTo(-2)
		expect(bottom).toBeCloseTo(2)
	})

	it('leaves no copy on top of another, around what is closed', () => {
		const ring = of(`(path.repeatAlong (path.circle [0 0] 50) ${STAMP} 4 0 false)`)
		const middles = ring.curves.map(curve => {
			const [[l, t], [r, b]] = bounds({ curves: [curve] })
			return [Math.round((l + r) / 2), Math.round((t + b) / 2)].join()
		})
		expect(new Set(middles).size).toBe(4)
	})

	it('says nothing is wrong, with only what it has to be given', () => {
		for (const src of [`(path.repeatAlong ${LINE} ${STAMP})`, `(path.repeatAlong ${LINE} ${STAMP} 3)`]) {
			expect(evaluate(parse(src), env).diagnostics.filter(({ level }) => level === 'error')).toEqual([])
		}
		expect(of(`(path.repeatAlong ${LINE} ${STAMP})`).curves).toHaveLength(10)
	})

	it('starts from what can be seen, for what it is not given', () => {
		expect(of('(path.repeatAlong)').curves).toHaveLength(10)
		const filter = filtersFor([evaluate(parse(LINE), env).value], env).find(f => f.name === 'path.repeatAlong')!
		expect(filter.more).toEqual([])
		const next = print(wrappedAt(parse(`{c = ${LINE}}`), env, 'binding:c', filter)!)
		expect(next).toContain('(path.repeatAlong (path.line [0 0] [100 0]) (path.circle [0 0] 10))')
		expect(check(parse(next), env).filter(({ level }) => level === 'error')).toEqual([])
	})

	it('goes by no copies for fewer than none', () => {
		expect(of(`(path.repeatAlong ${LINE} ${STAMP} 0)`).curves).toHaveLength(0)
	})

	it('shows what it goes along and what it copies', () => {
		const held = grip(`(path.repeatAlong ${LINE} ${STAMP} 3)`)
		expect(held.sources).toHaveLength(2)
	})

	it('can have what is selected put into it', () => {
		const values = [LINE, STAMP].map(src => evaluate(parse(src), env).value)
		expect(filtersFor(values, env).map(({ name }) => name)).toContain('path.repeatAlong')
	})
})
