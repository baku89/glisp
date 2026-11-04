import { type AST, print } from '@glisp/lang'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { missingMenuItems, referenceMenuItems, withCopyItems } from './menu'
import type { Linker } from './selection'

const labels = (items: ReturnType<typeof withCopyItems>) =>
	items.map(item => ('label' in item ? item.label : '---'))

const noop = () => {}
const item = (label: string) => ({ label, icon: 'x', perform: noop })

describe('withCopyItems', () => {
	it('goes ahead of the group that deletes', () => {
		const items = [item('Copy'), { separator: true as const }, item('Delete')]
		expect(labels(withCopyItems(items, [item('More')]))).toEqual(['Copy', 'More', '---', 'Delete'])
	})

	it('goes last with nothing to delete', () => {
		expect(labels(withCopyItems([item('Copy')], [item('More')]))).toEqual(['Copy', 'More'])
	})

	it('goes first with only something to delete', () => {
		expect(labels(withCopyItems([item('Delete')], [item('More')]))).toEqual(['More', 'Delete'])
	})
})

describe('referenceMenuItems', () => {
	const linkerOf = (pasted: string | null, canCopy = true) => {
		const linked: [string, string][] = []
		const copied: string[] = []
		const linker: Linker = {
			can: () => true,
			link: (source, target) => void linked.push([source, target]),
			canCopy: () => canCopy,
			copy: path => (copied.push(path), true),
			pasted: () => pasted,
			pasteInto: () => false,
			pasteMissing: () => true,
		}
		return { linker, linked, copied }
	}
	const perform = (items: ReturnType<typeof referenceMenuItems>, label: string) => {
		const found = items.find(i => 'label' in i && i.label === label)
		;(found as { perform(): void }).perform()
	}
	const clipboardHas = (text: string) =>
		vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.resolve(text) } })
	const settled = () => new Promise(resolve => setTimeout(resolve))

	afterEach(() => vi.unstubAllGlobals())

	it('copies where it is', () => {
		const { linker, copied } = linkerOf(null)
		perform(referenceMenuItems(linker, 'binding:a/0', noop), 'Copy Reference')
		expect(copied).toEqual(['binding:a/0'])
	})

	it('offers a copy only of what a reference can reach', () => {
		expect(labels(referenceMenuItems(linkerOf(null, false).linker, 'x', noop))).toEqual(['Paste'])
	})

	it('has no paste of its own: a reference pastes as one', async () => {
		clipboardHas('./a/0')
		const { linker, linked } = linkerOf('binding:a/0')
		const pasted: AST[] = []
		perform(referenceMenuItems(linker, 'binding:b/1', code => pasted.push(code)), 'Paste')
		await settled()
		expect(linked).toEqual([['binding:b/1', 'binding:a/0']])
		expect(pasted).toEqual([])
	})

	it('pastes anything else as code', async () => {
		clipboardHas('(+ 1 2)')
		const { linker, linked } = linkerOf(null)
		const pasted: AST[] = []
		perform(referenceMenuItems(linker, 'binding:b', code => pasted.push(code)), 'Paste')
		await settled()
		expect(linked).toEqual([])
		expect(pasted.map(print)).toEqual(['(+ 1 2)'])
	})
})

describe('missingMenuItems', () => {
	it('gives it what is on the clipboard', async () => {
		vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.resolve('./a/0') } })
		const asked: string[][] = []
		const linker: Linker = {
			can: () => true,
			link: noop,
			canCopy: () => false,
			copy: () => false,
			pasted: () => null,
			pasteInto: () => false,
			pasteMissing: (at, parameter, text) => (asked.push([at, parameter, text]), true),
		}
		const [paste] = missingMenuItems(linker, 'binding:b', 'fill')
		;(paste as { perform(): void }).perform()
		await new Promise(resolve => setTimeout(resolve))
		expect(asked).toEqual([['binding:b', 'fill', './a/0']])
		vi.unstubAllGlobals()
	})
})
