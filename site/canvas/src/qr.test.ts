import { evaluate, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'
import { bounds } from 'pave/path/metrics'
import { parse } from './program.testing'
import { PathValue, withGraphics } from './graphics'
import { buildPrelude } from '@glisp/lang'
import { outsideFinders, qrModules, qrOutline } from './qr'

const env = withGraphics(buildPrelude())

describe('qrModules', () => {
	it('is as large as the least version that holds it', () => {
		expect(qrModules('a', 'M')).toHaveLength(21)
		expect(qrModules('https://glisp.app/canvas', 'M')).toHaveLength(25)
		expect(qrModules('x'.repeat(3000), 'H')).toBeNull()
	})

	it('has its finders in three corners', () => {
		const m = qrModules('glisp', 'Q')!
		const n = m.length
		const finder = (x: number, y: number) =>
			[0, 1, 2, 3, 4, 5, 6].every(i => m[y]![x + i] && m[y + 6]![x + i] && m[y + i]![x] && m[y + i]![x + 6]) &&
			!m[y + 1]![x + 1] && m[y + 3]![x + 3]
		expect([finder(0, 0), finder(n - 7, 0), finder(0, n - 7)]).toEqual([true, true, true])
	})

	it('comes to the same, every time', () => {
		expect(qrModules('同じ', 'L')).toEqual(qrModules('同じ', 'L'))
	})
})

describe('qrOutline', () => {
	it('goes around a hole the other way', () => {
		const ring = [[true, true, true], [true, false, true], [true, true, true]]
		const loops = qrOutline(ring, [0, 0], 1)
		expect(loops).toHaveLength(2)
		const area = (loop: readonly (readonly [number, number])[]) =>
			loop.reduce((sum, [x, y], i) => {
				const [nx, ny] = loop[(i + 1) % loop.length]!
				return sum + x * ny - nx * y
			}, 0) / 2
		expect(loops.map(area).sort((a, b) => a - b)).toEqual([-1, 9])
	})

	it('has a corner at each module along a side, if it is asked to', () => {
		const bar = [[true, true, true], [false, false, false], [false, false, false]]
		expect(qrOutline(bar, [0, 0], 1)).toHaveLength(1)
		expect(qrOutline(bar, [0, 0], 1)[0]).toHaveLength(4)
		expect(qrOutline(bar, [0, 0], 1, true)[0]).toHaveLength(8)
	})

	it('keeps apart what only touches at a corner', () => {
		expect(qrOutline([[true, false], [false, true]], [0, 0], 1).map(loop => loop.length)).toEqual([4, 4])
	})
})

describe('path.qr', () => {
	it('fills the square from its origin', () => {
		const { value, diagnostics } = evaluate(parse('{a = (path.qr [10 20] 210 "glisp")}'), env)
		expect(diagnostics.filter(({ level }) => level === 'error')).toEqual([])
		const path = (value as unknown as readonly unknown[])[0] as PathValue
		const [[x0, y0], [x1, y1]] = bounds(path.path) as unknown as [[number, number], [number, number]]
		expect([x0, y0, x1, y1]).toEqual([10, 20, 220, 230])
	})

	it('has anchors at every module, if it says so', () => {
		const count = (src: string) => {
			const { value } = evaluate(parse(`{a = ${src}}`), env)
			return ((value as unknown as readonly unknown[])[0] as PathValue).path.curves.reduce((n, c) => n + c.vertices.length, 0)
		}
		const [corners, between, cells] = ['corners', 'cellsButFinders', 'cells'].map(anchors => count(`(path.qr [0 0] 100 "glisp" "M" "${anchors}")`))
		expect(corners).toBeLessThan(between!)
		expect(between).toBeLessThan(cells!)
	})

	it('keeps the squares it is found by as squares, between the two', () => {
		const m = qrModules('glisp', 'M')!
		const loops = qrOutline(m, [0, 0], 1, outsideFinders(m.length))
		const inTopLeft = loops.filter(loop => loop.every(([x, y]) => x <= 7 && y <= 7))
		// Its ring, the hole in it, and the square in the middle: four corners each.
		expect(inTopLeft.map(loop => loop.length)).toEqual([4, 4, 4])
	})

	it('can be written without a level', () => {
		expect(print(parse('{a = (path.qr [0 0] 100 "x")}'))).toContain('(path.qr [0 0] 100 "x")')
	})
})
