import { buildPrelude, type LetAST, print } from '@glisp/lang'
import { describe, expect, it } from 'vitest'

import { withGraphics } from './graphics'
import { appliedTo, editedAt, problemsOf, programOf, readProgram, referredAt, selectionOf, signatureOf, slotsAt, typeAt } from './hostApi'
import { MCP_TOOLS } from './mcpTools'
import { parse } from './program.testing'

const env = withGraphics(buildPrelude())
const program = parse('[c = (path.circle [10 20] 5) r = (path.rect [0 0] [100 50])]') as LetAST

describe('what an agent can ask of a program', () => {
	it('reads it as code, with what it draws and paths to go into it by', () => {
		const read = readProgram(program, env)
		expect(read.code).toContain('(path.circle [10 20] 5)')
		expect(read.drawn).toEqual(expect.arrayContaining(['binding:c', 'binding:r']))
		const slots = slotsAt(program, env, 'binding:c')
		expect(slots.map(({ path }) => path)).toEqual(['binding:c/arg0', 'binding:c/arg1'])
		expect(slots[0]).toMatchObject({ code: '[10 20]' })
	})

	it('says what a slot wants, and what is there, without working it out', () => {
		const at = typeAt(program, env, 'binding:c/arg1')
		expect(at).toMatchObject({ code: '5', fits: true })
		expect(at.expected).toBe('number')
		expect(() => typeAt(program, env, 'binding:nothing')).toThrow(/Nothing is at/)
	})

	it('says how a function is called', () => {
		const reflect = signatureOf(env, 'vec2.reflect')
		expect(reflect.params).toHaveLength(2)
		expect(reflect.returns).toBeTruthy()
		expect(() => signatureOf(env, 'no.such')).toThrow()
	})

	it('edits a slot, and the whole of it', () => {
		const next = editedAt(program, env, 'binding:c/arg1', '(* 2 4)')
		expect(print(next)).toContain('(path.circle [10 20] (* 2 4))')
		expect(problemsOf(next, env).filter(({ level }) => level === 'error')).toEqual([])
		expect(print(programOf('[a = (path.circle [0 0] 1)]', env))).toContain('a = (path.circle [0 0] 1)')
		expect(() => programOf('(+ 1 2)', env)).toThrow(/block/)
	})

	it('has one place refer to another, and goes on being it', () => {
		const next = referredAt(program, env, 'binding:r/arg0', 'binding:c/arg0')
		expect(print(next)).toMatch(/r = \(path\.rect \S*c\S* \[100 50\]\)/)
		const moved = parse(print(next).replace('[10 20]', '[30 40]'))
		expect(print(editedAt(moved as LetAST, env, 'binding:c/arg1', '6'))).toContain('[30 40]')
		expect(() => referredAt(program, env, 'binding:r/arg9', 'binding:c/arg0')).toThrow(/Nothing is at/)
	})

	it('calls a function on paths, as quick-add does on what is selected', () => {
		const drawn = parse('[l = (line.vertical [50 0]) a = ^point [90 0] b = ^point [0 0]]') as LetAST
		const into = appliedTo(drawn, env, 'vec2.reflect', ['binding:a', 'binding:l', 'binding:b'])
		expect(into).toMatchObject({ row: 'binding:b', into: true })
		expect(print(into.ast)).toContain('b = (vec2.reflect a l)')
		const own = appliedTo(drawn, env, 'vec2.reflect', ['binding:l', 'binding:a'])
		expect(own).toMatchObject({ row: 'binding:reflect1', into: false })
		expect(() => appliedTo(drawn, env, 'no.such', [])).toThrow()
		expect(() => appliedTo(drawn, env, 'vec2.reflect', ['binding:zz'])).toThrow(/Nothing is at/)
	})

	it('lists each tool once, with a schema', () => {
		expect(new Set(MCP_TOOLS.map(({ name }) => name)).size).toBe(MCP_TOOLS.length)
		for (const tool of MCP_TOOLS) expect(tool.inputSchema.type).toBe('object')
	})

	it('says what is selected with its code, and the points chosen in it', () => {
		expect(selectionOf(program, env, ['binding:r', 'binding:c'], ['binding:c/arg0'])).toEqual({
			selected: [
				{ path: 'binding:r', code: '(path.rect [0 0] [100 50])', expected: null, inferred: expect.any(String) },
				{ path: 'binding:c', code: '(path.circle [10 20] 5)', expected: null, inferred: expect.any(String) },
			],
			chosen: [{ path: 'binding:c/arg0', code: '[10 20]', expected: 'point', inferred: '[number number]' }],
		})
		expect(selectionOf(program, env, ['binding:nope'], []).selected).toEqual([])
	})
})
