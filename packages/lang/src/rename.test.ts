import { describe, expect, it } from 'vitest'

import { buildPrelude } from './prelude.js'
import { evaluate, parse, print, Session } from './index.js'
import { isBindingName, renameBinding } from './rename.js'
import type { LetAST } from './types.js'

const rename = (src: string, from: string, to: string) => {
	const next = renameBinding(parse(src) as LetAST, from, to)
	return next === null ? null : print(next)
}

describe('renameBinding', () => {
	it('renames a binding, and what refers to it', () => {
		expect(rename('{a = 1 b = (+ a 1)}', 'a', 'c')).toBe('{c = 1 b = (+ c 1)}')
	})

	it('keeps what the program means', () => {
		const before = parse('{a = 2 b = (* a a) (+ a b)}') as LetAST
		const after = renameBinding(before, 'a', 'z')!
		const env = buildPrelude()
		expect(evaluate(after, env).value).toBe(evaluate(before, env).value)
	})

	it('reaches into everything in its scope', () => {
		expect(rename('{a = 1 b = [a {x: a}] c = (=> (y: number): number a) a}', 'a', 'z')).toBe(
			'{z = 1 b = [z {x: z}] c = (=> (y: number): number z) z}'
		)
		expect(rename('{a = 1 b = (+ ...a) c = a.x}', 'a', 'z')).toBe('{z = 1 b = (+ ...z) c = z.x}')
		expect(rename('{a = 1 b = ^{label: "L"} a}', 'a', 'z')).toBe('{z = 1 b = ^{label: "L"} z}')
		expect(rename('{a = number f = (=> (x: a): a x)}', 'a', 'z')).toBe(
			'{z = number f = (=> (x: z): z x)}'
		)
	})

	it('leaves a key that happens to have the name', () => {
		expect(rename('{a = 1 b = {a: 2}}', 'a', 'z')).toBe('{z = 1 b = {a: 2}}')
		expect(rename('{a = 1 b = (f a=a)}', 'a', 'z')).toBe('{z = 1 b = (f a=z)}')
	})

	it('leaves alone what a nearer one shadows', () => {
		expect(rename('{a = 1 b = {a = 2 a} c = a}', 'a', 'z')).toBe('{z = 1 b = {a = 2 a} c = z}')
		expect(rename('{a = 1 f = (=> (a: number): number a)}', 'a', 'z')).toBe(
			'{z = 1 f = (=> (a: number): number a)}'
		)
	})

	it('does not take a name that is taken', () => {
		expect(rename('{a = 1 b = 2}', 'a', 'b')).toBeNull()
	})

	it('does not let something inside catch a reference', () => {
		expect(rename('{a = 1 b = {c = 2 (+ a c)}}', 'a', 'c')).toBeNull()
		expect(rename('{a = 1 f = (=> (c: number): number a)}', 'a', 'c')).toBeNull()
	})

	it('allows what is inside to have the name when nothing is caught', () => {
		expect(rename('{a = 1 b = {c = 2 c}}', 'a', 'c')).toBe('{c = 1 b = {c = 2 c}}')
	})

	it('wants a binding and a name', () => {
		expect(rename('{a = 1}', 'b', 'c')).toBeNull()
		for (const name of ['', '1', '(a)', 'a b', '%', '"a"', 'true']) {
			expect(rename('{a = 1}', 'a', name)).toBeNull()
		}
	})

	it('changes nothing for the same name', () => {
		const block = parse('{a = 1}') as LetAST
		expect(renameBinding(block, 'a', 'a')).toBe(block)
	})

	it('takes names of any script', () => {
		expect(rename('{a = 1 a}', 'a', '半径')).toBe('{半径 = 1 半径}')
		expect(isBindingName('半径')).toBe(true)
	})

	it('leaves the original alone', () => {
		const block = parse('{a = 1 a}') as LetAST
		renameBinding(block, 'a', 'b')
		expect(print(block)).toBe('{a = 1 a}')
	})
})

describe('Session.renameBinding', () => {
	it('renames in the session', () => {
		const session = new Session(buildPrelude())
		session.exec('x = 1')
		session.exec('y = (+ x 1)')
		expect(session.renameBinding('x', 'z')).toBeNull()
		expect(session.exec('y').value).toBe(2)
		expect(session.bindings()).toContain('z')
		expect(session.bindings()).not.toContain('x')
	})

	it('says why it cannot', () => {
		const session = new Session(buildPrelude())
		session.exec('x = 1')
		session.exec('y = 2')
		expect(session.renameBinding('x', 'y')).toContain('y')
		expect(session.renameBinding('nope', 'z')).toContain('nope')
		expect(session.bindings()).toEqual(['x', 'y'])
	})
})
