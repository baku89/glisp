import { describe, expect, it } from 'vitest'

import { colorOfToken, InputHistory, segmentsOf } from './repl'

describe('colorOfToken', () => {
	const rules = [
		{ token: '', foreground: '111111' },
		{ token: 'number', foreground: '222222' },
		{ token: 'type.identifier', foreground: '333333' },
		{ token: 'comment' },
	]

	it('takes the most specific rule', () => {
		expect(colorOfToken('number.glisp', rules)).toBe('#222222')
		expect(colorOfToken('type.identifier.glisp', rules)).toBe('#333333')
	})

	it('falls back to the default', () => {
		expect(colorOfToken('identifier.glisp', rules)).toBe('#111111')
		expect(colorOfToken('', rules)).toBe('#111111')
	})

	it('leaves a rule with no color alone', () => {
		expect(colorOfToken('comment.glisp', rules)).toBeUndefined()
	})
})

describe('segmentsOf', () => {
	it('joins code, so that it can be read as one piece', () => {
		expect(
			segmentsOf([
				{ kind: 'punct', text: '[' },
				{ kind: 'number', text: '1' },
				{ kind: 'punct', text: ']' },
			])
		).toEqual([{ code: true, text: '[1]' }])
	})

	it('keeps words apart from code', () => {
		expect(
			segmentsOf([
				{ kind: 'symbol', text: 'x' },
				{ kind: 'plain', text: '\n  docs' },
				{ kind: 'number', text: '1' },
			])
		).toEqual([
			{ code: true, text: 'x' },
			{ code: false, text: '\n  docs' },
			{ code: true, text: '1' },
		])
	})

	it('has nothing for nothing', () => {
		expect(segmentsOf([])).toEqual([])
	})
})

describe('InputHistory', () => {
	const filled = () => {
		const history = new InputHistory()
		history.push('a')
		history.push('b')
		return history
	}

	it('goes back, and stops at the oldest', () => {
		const history = filled()
		expect(history.previous('')).toBe('b')
		expect(history.previous('')).toBe('a')
		expect(history.previous('')).toBeNull()
	})

	it('comes back to what was being written', () => {
		const history = filled()
		history.previous('draft')
		history.previous('b')
		expect(history.next()).toBe('b')
		expect(history.next()).toBe('draft')
		expect(history.next()).toBeNull()
	})

	it('does not repeat itself', () => {
		const history = filled()
		history.push('b')
		expect(history.previous('')).toBe('b')
		expect(history.previous('')).toBe('a')
	})

	it('has nothing at first', () => {
		const history = new InputHistory()
		expect(history.previous('x')).toBeNull()
		expect(history.next()).toBeNull()
	})

	it('goes back to the end with a new entry', () => {
		const history = filled()
		history.previous('')
		history.previous('')
		history.push('c')
		expect(history.previous('')).toBe('c')
	})
})
