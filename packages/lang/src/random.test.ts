import { describe, expect, it } from 'vitest'

import { evaluate } from './eval.js'
import { infer } from './infer.js'
import { parse } from './parse.js'
import { buildPrelude } from './prelude.js'
import { randomAt } from './random.js'
import { UNIT } from './types.js'

const env = buildPrelude()
const value = (source: string) => evaluate(parse(source), env).value
const problems = (source: string) => evaluate(parse(source), env).diagnostics

describe('random', () => {
	// What a drawing depends on: if one of these has to change, so does everyone's drawing.
	it('gives what it has always given', () => {
		expect(randomAt(42, 0)).toBe(0.2608322922664409)
		expect(randomAt(42, 1)).toBe(0.18141092023533278)
		expect(randomAt([42, 'radius'], 0)).toBe(0.180420929255516)
		expect(randomAt('a', 0)).toBe(0.5887133421460609)
	})

	it('makes a function from a number to a value', () => {
		expect(value('((random.number 42) 0)')).toBe(0.2608322922664409)
		expect(infer(parse('(random.number 42)'), env)?.typeName).toBe('(=> [i: number]: number)')
	})

	it('gives a sequence by being mapped over numbers', () => {
		expect(value('(map (range 0 3) (random.number 42))')).toEqual([
			randomAt(42, 0),
			randomAt(42, 1),
			randomAt(42, 2),
		])
	})

	it('gives the same for the same, and leaves what came before as it is when asked for more', () => {
		expect(value('(take (map (range 0 9) (random.number 7)) 3)')).toEqual(
			value('(map (range 0 3) (random.number 7))')
		)
	})

	it('tells seeds apart by what they are', () => {
		const seeds = [1, '1', [1], [[1]], [1, 1], true, false, 'radius', ['radius']]
		expect(new Set(seeds.map(seed => randomAt(seed, 0))).size).toBe(seeds.length)
	})

	it('takes -0 as 0', () => {
		expect(randomAt(-0, -0)).toBe(randomAt(0, 0))
	})

	it('stays from 0 up to 1, without leaning, for any seed', () => {
		const N = 20000
		let sum = 0
		let afterLast = 0
		let afterSeed = 0
		for (let i = 0; i < N; i++) {
			const x = randomAt(1, i)
			expect(x).toBeGreaterThanOrEqual(0)
			expect(x).toBeLessThan(1)
			sum += x
			afterLast += (x - 0.5) * (randomAt(1, i + 1) - 0.5)
			afterSeed += (randomAt(i, 0) - 0.5) * (randomAt(i + 1, 0) - 0.5)
		}
		expect(Math.abs(sum / N - 0.5)).toBeLessThan(0.01)
		expect(Math.abs((afterLast / N) * 12)).toBeLessThan(0.03)
		expect(Math.abs((afterSeed / N) * 12)).toBeLessThan(0.03)
	})

	it('goes between two numbers', () => {
		const xs = value('(map (range 0 500) (random.between 3 5 20))') as number[]
		expect(xs.every(x => x >= 5 && x < 20)).toBe(true)
		expect(xs[0]).toBe(5 + 15 * randomAt(3, 0))
	})

	it('picks from a vector, knowing what of', () => {
		const picked = value('(map (range 0 200) (random.pick 3 ["a" "b" "c"]))') as string[]
		expect(new Set(picked)).toEqual(new Set(['a', 'b', 'c']))
		expect(infer(parse('(random.pick 3 [1 2])'), env)?.typeName).toBe('(=> [i: number]: number)')
	})

	it('picks nothing from nothing', () => {
		expect(value('((random.pick 3 []) 0)')).toBe(UNIT)
	})

	it('says so of what cannot be a seed, and still gives a number', () => {
		expect(problems('(random.number {a: 1})').length).toBeGreaterThan(0)
		expect(typeof value('((random.number {a: 1}) 0)')).toBe('number')
	})

	it('has `seed` to say what a function takes', () => {
		expect(value('((=> [s: seed]: number ((random.number s) 0)) 42)')).toBe(randomAt(42, 0))
	})
})
