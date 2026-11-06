import { buildPrelude, type Env, evaluate, type LetAST, print } from '@glisp/lang'
import { bound, parse } from './program.testing'
import { describe, expect, it } from 'vitest'

import { type Vec, withGraphics } from './graphics'
import { gripAt, pencilled, sceneOf } from './scene'

const env: Env = withGraphics(buildPrelude())
const root = parse('{a = 1}') as LetAST

/** A wobble of many points along a sine, as a hand would give. */
const wave: Vec[] = Array.from({ length: 200 }, (_, i) => [i, Math.sin(i / 20) * 30])
const circle: Vec[] = Array.from({ length: 101 }, (_, i) => {
	const angle = (i / 100) * Math.PI * 2
	return [50 + Math.cos(angle) * 40, 50 + Math.sin(angle) * 40]
})

const source = (ast: LetAST) => print(bound(ast).at(-1)![1])
const commands = (ast: LetAST, letter: string) => source(ast).split(letter).length - 1

describe('a stroke of a pencil', () => {
	it('comes to a named curve that draws, and can be taken hold of', () => {
		const { ast, name } = pencilled(root, wave, 2.5, 8)!
		expect(name).toBe('pencil1')
		expect(source(ast)).toMatch(/^\(path\.d "M/)
		expect(evaluate(ast, env).diagnostics).toEqual([])
		expect(sceneOf(ast, env).map(({ row }) => row)).toContain('binding:pencil1')
		expect(gripAt(ast, env, 'binding:pencil1')!.handles.length).toBeGreaterThan(0)
	})

	it('has far fewer places than it went through', () => {
		const { ast } = pencilled(root, wave, 2.5, 8)!
		expect(commands(ast, 'C')).toBeLessThan(wave.length / 10)
	})

	it('follows more closely, with less tolerance', () => {
		const loose = pencilled(root, wave, 8, 8)!
		const close = pencilled(root, wave, 0.1, 8)!
		expect(commands(close.ast, 'C')).toBeGreaterThan(commands(loose.ast, 'C'))
	})

	it('writes its numbers no finer than the rest', () => {
		const { ast } = pencilled(root, wave, 2.5, 8)!
		expect(source(ast)).not.toMatch(/\d\.\d{3,}/)
	})

	it('goes on with a name of its own', () => {
		const { ast } = pencilled(root, wave, 2.5, 8)!
		expect(pencilled(ast, wave, 2.5, 8)!.name).toBe('pencil2')
	})

	it('closes, if it ends where it began', () => {
		expect(source(pencilled(root, circle, 2.5, 8)!.ast)).toMatch(/[zZ]"\)$/)
		expect(source(pencilled(root, wave, 2.5, 8)!.ast)).not.toMatch(/[zZ]"\)$/)
	})

	it('does not close, if it hardly went anywhere', () => {
		const short: Vec[] = [[0, 0], [3, 0], [3, 3], [0, 1]]
		expect(source(pencilled(root, short, 2.5, 8)!.ast)).not.toMatch(/[zZ]"\)$/)
	})

	it('is nothing, if it went nowhere', () => {
		expect(pencilled(root, [], 2.5, 8)).toBeNull()
		expect(pencilled(root, [[1, 1]], 2.5, 8)).toBeNull()
		expect(pencilled(root, [[1, 1], [1, 1]], 2.5, 8)).toBeNull()
	})
})
