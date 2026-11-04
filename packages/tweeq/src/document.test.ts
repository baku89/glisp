import { LetAST, parse } from '@glisp/lang'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useGlispDocument } from './document'

const program = (source: string) => parse(source) as LetAST

// Each edit far enough from the last not to undo as one with it.
beforeEach(() => {
	let now = 0
	vi.spyOn(performance, 'now').mockImplementation(() => (now += 1000))
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe('rewind', () => {
	it('goes back as if nothing since had happened, leaving nothing to undo', () => {
		const document = useGlispDocument('{a = 1}')
		const start = document.root.value
		document.setRoot(program('{a = 2}'))
		document.rewind(start)
		expect(document.root.value).toBe(start)
		expect(document.canUndo.value).toBe(false)
	})

	it('keeps what was done before what it goes back to', () => {
		const document = useGlispDocument('{a = 1}')
		const first = document.root.value
		document.setRoot(program('{a = 2}'))
		const before = document.root.value
		document.undo()
		document.redo()
		document.setRoot(program('{a = 3}'))
		document.rewind(before)
		expect(document.root.value).toBe(before)
		document.undo()
		expect(document.root.value).toBe(first)
	})

	it('can go on from there, as one edit', () => {
		const document = useGlispDocument('{a = 1}')
		const start = document.root.value
		document.setRoot(program('{a = 2}'))
		document.rewind(start)
		document.setRoot(program('{a = 3}'))
		document.undo()
		expect(document.root.value).toBe(start)
		expect(document.canUndo.value).toBe(false)
	})
})
