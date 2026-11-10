import { type AST, buildPrelude, evaluate, type LetAST, parse as parsed, print } from '@glisp/lang'
import { bounds } from 'pave/path/metrics'
import { describe, expect, it } from 'vitest'

import {
	artboardDrawn,
	nameForArtboard,
	presetNamed,
	sizeOf,
	withLayerOnto,
	withLayersTakenIn,
	withLayerWhere,
} from './artboards'
import { ArtboardValue, type Path, withGraphics } from './graphics'
import { parse } from './program.testing'
import { svgOfArtboard, svgOfProgram } from './svg'
import { artboardOfRow, changed, gripAt, isArtboardRow, rowsHeldBy, rowTakenAt, sceneOf } from './scene'

const env = withGraphics(buildPrelude())

const BOARD = `{main = [
  desk = (artboard (rect [100 50] [300 200]) [a = (path.rect [10 10] [20 20])] fill: "#eeeeee")
  b = (path.rect [0 0] [5 5])
]}`

describe('artboard', () => {
	it('is an area with what is on it', () => {
		const { value } = evaluate(
			parsed('(artboard (rect [10 20] [300 200]) [a = (path.rect [0 0] [10 10])] fill: "#eeeeee")'),
			env
		)
		expect(value).toBeInstanceOf(ArtboardValue)
		const v = value as ArtboardValue
		expect(v.area.origin).toEqual([10, 20])
		expect(v.fill).toBe('#eeeeee')
		expect(v.layers).toHaveLength(1)
	})

	it('is drawn behind what is on it, which is measured from its corner and cut off by its edge', () => {
		const scene = sceneOf(parse(BOARD), env)
		expect(scene.map(({ row, draw }) => [row, draw])).toEqual([
			['binding:b', 'path'],
			['binding:desk', 'artboard'],
			['binding:desk/arg1/binding:a', 'path'],
		])
		const a = scene[2]!
		expect(bounds(a.value as Path)).toEqual([
			[110, 60],
			[130, 80],
		])
		expect(bounds(a.clip!)).toEqual([
			[100, 50],
			[400, 250],
		])
		expect(scene[1]!.paint?.fill).toBe('#eeeeee')
	})

	it('has what is on it taken hold of where it is on the canvas', () => {
		const root = parse(BOARD)
		expect(gripAt(root, env, 'binding:desk/arg1/binding:a')?.transform).toEqual([1, 0, 0, 1, 100, 50])
		expect(isArtboardRow(root, env, 'binding:desk')).toBe(true)
		expect(isArtboardRow(root, env, 'binding:b')).toBe(false)
		expect(artboardOfRow(root, env, 'binding:desk')?.area.size).toEqual([300, 200])
	})

	it('moves by its area, taking what is on it along', () => {
		const root = parse(BOARD)
		const grip = gripAt(root, env, 'binding:desk')!
		expect(grip.transform).toEqual([1, 0, 0, 1, 0, 0])
		expect(grip.move?.([10, 0])).toEqual([{ route: [0, 0], value: [110, 50] }])
	})
})

describe('a layer onto an artboard and off of it', () => {
	const ON = `{main = [
  desk = (artboard (rect [100 50] [300 200]) [a = (path.rect [10 10] [20 20])])
  b = (path.rect [150 100] [5 5])
]}`
	const at = (root: AST, row: string) => bounds(sceneOf(root, env).find(shape => shape.row === row)!.value as Path)

	it('goes on staying where it is on the canvas', () => {
		const root = parse(ON)
		const moved = withLayerOnto(root, env, 'binding:b', 'binding:desk')!
		expect(moved.row).toBe('binding:desk/arg1/binding:b')
		expect(print(moved.ast)).toContain('b = (path.rect [50 50] [5 5])')
		expect(at(moved.ast, moved.row)).toEqual(at(root, 'binding:b'))
	})

	it('comes off staying where it is, in front of the artboard', () => {
		const root = parse(ON)
		const moved = withLayerOnto(root, env, 'binding:desk/arg1/binding:a', null)!
		expect(moved.row).toBe('binding:a')
		expect(print(moved.ast)).toContain('a = (path.rect [110 60] [20 20])')
		expect(at(moved.ast, 'binding:a')).toEqual(at(root, 'binding:desk/arg1/binding:a'))
	})

	it('goes where it is let go', () => {
		const root = parse(ON)
		expect(withLayerWhere(root, env, 'binding:b', [160, 110]).row).toBe('binding:desk/arg1/binding:b')
		expect(withLayerWhere(root, env, 'binding:b', [0, 0]).row).toBe('binding:b')
		expect(withLayerWhere(root, env, 'binding:desk/arg1/binding:a', [0, 0]).row).toBe('binding:a')
	})

	it('is drawn, and takes in what is wholly within it', () => {
		const root = parse(`{main = [b = (path.rect [150 100] [5 5]) c = (path.rect [0 0] [500 500])]}`) as LetAST
		const name = nameForArtboard(root)
		expect(name).toBe('artboard1')
		const drawn = artboardDrawn(root, name, [400, 250], [100, 50], 1)
		expect(print(drawn)).toContain('artboard1 = (artboard (rect [100 50] [300 200]) [])')
		const taken = withLayersTakenIn(drawn, env, ['binding:b', 'binding:c'], 'binding:artboard1')
		expect(print(taken)).toContain('(artboard (rect [100 50] [300 200]) [b = (path.rect [50 50] [5 5])])')
		expect(print(taken)).toContain('c = (path.rect [0 0] [500 500])')
	})

	it('has presets the other way around', () => {
		expect(sizeOf(presetNamed('desktop'), false)).toEqual([1024, 1440])
		expect(sizeOf(presetNamed('iphone16'), true)).toEqual([852, 393])
		expect(sizeOf(presetNamed('iphone16'), false)).toEqual([393, 852])
	})
})

describe('an artboard exported', () => {
	it('is as large as it is, filled, with what is on it cut off by its edge', () => {
		const root = parse(BOARD)
		const svg = svgOfArtboard(root, env, 'binding:desk')!
		expect(svg).toContain('viewBox="100 50 300 200"')
		expect(svg).toContain('<clipPath id="clip1">')
		expect(svg).toMatch(/<path id="desk" d="[^"]+" fill="#eeeeee"/)
		expect(svg).toMatch(/<path id="a" d="M 110,60[^"]*"[^>]*clip-path="url\(#clip1\)"/)
		expect(svg).not.toContain('id="b"')
	})

	it('is what a file is as large as, the one in front', () => {
		const svg = svgOfProgram(parse(BOARD) as LetAST, env)
		expect(svg).toContain('viewBox="100 50 300 200"')
	})
})

describe('an artboard moved', () => {
	it('takes nothing on it along a second time', () => {
		expect(rowsHeldBy(parse(BOARD), env, new Set(['binding:desk']))).toEqual([])
	})

	it('has what is on it taken hold of each by itself', () => {
		expect(rowTakenAt(parse(BOARD), env, 'binding:desk/arg1/binding:a', [])).toBe('binding:desk/arg1/binding:a')
	})

	it('is not taken along by what is moved on it', () => {
		expect(rowsHeldBy(parse(BOARD), env, new Set(['binding:desk/arg1/binding:a']))).toEqual([])
	})
})

describe('an artboard whose area is locked', () => {
	it('has none of its handles change it, nor the size inside it', () => {
		const root = parse(`{main = [
			a = (artboard @(rect [0 0] [1920 1080]) [])
		]}`)
		const { handles, move } = gripAt(root, env, 'binding:a')!
		for (const handle of handles) {
			if (handle.at === undefined) continue
			const to: [number, number] = [handle.at[0] + 50, handle.at[1] + 30]
			expect(changed(root, env, 'binding:a', handle.to(to, handle.at)), handle.name).toEqual({ ast: null, problem: 'locked' })
		}
		expect(changed(root, env, 'binding:a', move!([10, 10])).ast).toBeNull()
	})
})
