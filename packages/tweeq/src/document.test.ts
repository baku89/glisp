import { LetAST, parse, print } from '@glisp/lang'
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

describe('what is held', () => {
	const set = (document: ReturnType<typeof useGlispDocument>, source: string) =>
		document.setRoot(program(source))
	const at = (document: ReturnType<typeof useGlispDocument>) => print(document.root.value)

	it('undoes as one, however long it takes', () => {
		const document = useGlispDocument('{a = 1}')
		document.hold()
		set(document, '{a = 5}')
		set(document, '{a = 52}')
		set(document, '{a = 520}')
		document.release()
		document.undo()
		expect(at(document)).toBe('{a = 1}')
		expect(document.canUndo.value).toBe(false)
	})

	it('stays one through a batch, as several rows typed in at once are', () => {
		const document = useGlispDocument('{a = 1}')
		document.hold()
		document.batch(() => set(document, '{a = 5}'))
		document.batch(() => set(document, '{a = 52}'))
		document.release()
		document.undo()
		expect(at(document)).toBe('{a = 1}')
	})

	it('is apart from what comes before and after, however soon', () => {
		vi.restoreAllMocks()
		const document = useGlispDocument('{a = 1}')
		set(document, '{a = 2}')
		document.hold()
		set(document, '{a = 3}')
		document.release()
		set(document, '{a = 4}')
		document.undo()
		expect(at(document)).toBe('{a = 3}')
		document.undo()
		expect(at(document)).toBe('{a = 2}')
		document.undo()
		expect(at(document)).toBe('{a = 1}')
	})

	it('adds nothing to undo, if nothing was written', () => {
		const document = useGlispDocument('{a = 1}')
		document.hold()
		document.release()
		expect(document.canUndo.value).toBe(false)
	})

	it('goes on as a new edit after an undo, without having been let go of', () => {
		const document = useGlispDocument('{a = 1}')
		document.hold()
		set(document, '{a = 2}')
		document.undo()
		set(document, '{a = 3}')
		document.undo()
		expect(at(document)).toBe('{a = 1}')
		document.release()
	})
})
