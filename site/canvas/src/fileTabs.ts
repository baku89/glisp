/**
 * What is open, as tabs. A file is kept in this browser, in its private file system, until it
 * is saved somewhere of the person's own, and then it is that file. What this comes to is plain
 * data, and `useFileTabs` is what acts on it.
 */

export interface FileTab {
	readonly id: string
	readonly name: string
	/** The file of the person's own that it is, or null if it is only in this browser. */
	readonly handle: FileSystemFileHandle | null
	/** Its source when it last went to `handle`, to tell whether it has changed since. */
	readonly savedSource: string | null
	/** Whether it has what has not gone to `handle`. Something only in this browser never does. */
	readonly dirty: boolean
}

const EXTENSIONS = /(\.glisp\.svg|\.canvas\.glisp|\.glisp|\.svg)$/i

/** What to call a file in a tab, which is its name without what kind of file it is. */
export const nameOfFile = (fileName: string): string =>
	fileName.replace(EXTENSIONS, '') || fileName

/** What to call something new before anyone has named it: the day, and which of that day it is. */
export function sketchName(tabs: readonly Pick<FileTab, 'name'>[], today = new Date()): string {
	const day = [today.getFullYear() % 100, today.getMonth() + 1, today.getDate()]
		.map(part => String(part).padStart(2, '0'))
		.join('')
	const taken = new Set(tabs.map(({ name }) => name))
	for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
		if (!taken.has(`sketch_${day}${letter}`)) return `sketch_${day}${letter}`
	}
	return freeTabName(tabs, `sketch_${day}z`)
}

/** The tabs with `id` taken out and put back at `to`. */
export function movedTab<Tab extends Pick<FileTab, 'id'>>(tabs: readonly Tab[], id: string, to: number): readonly Tab[] {
	const moving = tabs.find(tab => tab.id === id)
	if (!moving) return tabs
	const others = tabs.filter(tab => tab !== moving)
	return [...others.slice(0, to), moving, ...others.slice(to)]
}

/** `base`, or if that is taken, the first of `base 2`, `base 3` and so on that is not. */
export function freeTabName(tabs: readonly Pick<FileTab, 'name'>[], base: string): string {
	const taken = new Set(tabs.map(({ name }) => name))
	if (!taken.has(base)) return base
	let n = 2
	while (taken.has(`${base} ${n}`)) n++
	return `${base} ${n}`
}

/** Which to go to when the tab `id` closes: the next along, or else the one before. */
export function tabAfterClosing(tabs: readonly FileTab[], id: string): string | null {
	const at = tabs.findIndex(tab => tab.id === id)
	if (at < 0) return null
	return (tabs[at + 1] ?? tabs[at - 1])?.id ?? null
}

/** A tab as it is now that what it holds has this source. */
export function withSource(tab: FileTab, source: string): FileTab {
	const dirty = tab.handle !== null && source !== tab.savedSource
	return dirty === tab.dirty ? tab : { ...tab, dirty }
}

/** A tab as it is now that it has gone to `handle` with this source. */
export const savedTo = (tab: FileTab, handle: FileSystemFileHandle, source: string): FileTab => ({
	...tab,
	name: nameOfFile(handle.name),
	handle,
	savedSource: source,
	dirty: false,
})

/** What closing would lose, to say before it does: nothing, or how to put it. */
export function lossOnClosing(tab: FileTab, isBlank: boolean): string | null {
	if (tab.handle === null) {
		return isBlank ? null : `"${tab.name}" is only in this browser. Close it and delete it?`
	}
	return tab.dirty ? `"${tab.name}" has changes that are not saved. Close it and lose them?` : null
}
