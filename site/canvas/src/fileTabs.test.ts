import { describe, expect, it } from 'vitest'

import { type FileTab, freeTabName, lossOnClosing, nameOfFile, savedTo, tabAfterClosing, withSource } from './fileTabs'

const handle = (name: string) => ({ name }) as FileSystemFileHandle
const tab = (id: string, over: Partial<FileTab> = {}): FileTab => ({
	id,
	name: id,
	handle: null,
	savedSource: null,
	dirty: false,
	...over,
})

describe('a tab', () => {
	it('is called what its file is, without what kind it is', () => {
		expect(nameOfFile('poster.glisp.svg')).toBe('poster')
		expect(nameOfFile('old.canvas.glisp')).toBe('old')
		expect(nameOfFile('logo.svg')).toBe('logo')
		expect(nameOfFile('notes.txt')).toBe('notes.txt')
		expect(nameOfFile('.svg')).toBe('.svg')
	})

	it('has a name of its own', () => {
		expect(freeTabName([], 'untitled')).toBe('untitled')
		expect(freeTabName([tab('untitled')], 'untitled')).toBe('untitled 2')
		expect(freeTabName([tab('untitled'), tab('untitled 2')], 'untitled')).toBe('untitled 3')
	})

	it('goes to the next when it closes, or else the one before', () => {
		const tabs = [tab('a'), tab('b'), tab('c')]
		expect(tabAfterClosing(tabs, 'a')).toBe('b')
		expect(tabAfterClosing(tabs, 'b')).toBe('c')
		expect(tabAfterClosing(tabs, 'c')).toBe('b')
		expect(tabAfterClosing([tab('a')], 'a')).toBeNull()
	})
})

describe('what has not been saved', () => {
	it('is what differs from what went to the file, so going back undoes it', () => {
		const saved = savedTo(tab('a'), handle('a.glisp.svg'), 'x = 1')
		expect(saved.dirty).toBe(false)
		const changed = withSource(saved, 'x = 2')
		expect(changed.dirty).toBe(true)
		expect(withSource(changed, 'x = 1').dirty).toBe(false)
	})

	it('is nothing of something only in this browser, which is always kept', () => {
		expect(withSource(tab('a'), 'x = 2').dirty).toBe(false)
	})

	it('takes the name of where it went', () => {
		expect(savedTo(tab('untitled'), handle('poster.glisp.svg'), '').name).toBe('poster')
	})
})

describe('closing', () => {
	it('says what is lost, only if something is', () => {
		expect(lossOnClosing(tab('a'), true)).toBeNull()
		expect(lossOnClosing(tab('a'), false)).toContain('only in this browser')
		const onDisk = savedTo(tab('a'), handle('a.svg'), 's')
		expect(lossOnClosing(onDisk, false)).toBeNull()
		expect(lossOnClosing({ ...onDisk, dirty: true }, false)).toContain('not saved')
	})
})
