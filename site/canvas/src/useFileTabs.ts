/**
 * Going between files in one document. Only what is being edited is in the document, with what
 * is not waiting as it was left, undo and all, so everything else in the app has only the one to
 * think of. Whatever is being edited goes to this browser as it changes, so a reload loses nothing.
 */

import type { LetAST } from '@glisp/lang'
import type { DocumentState, GlispDocument } from '@glisp/tweeq'
import { computed, shallowRef, watch } from 'vue'

import { askToStay, loadTabs, readKept, removeKept, saveTabs, writeKept } from './fileStore'
import { openFile, type OpenedFile, saveFile } from './files'
import { type FileTab, freeTabName, lossOnClosing, nameOfFile, savedTo, tabAfterClosing, withSource } from './fileTabs'

const KEEP_AFTER_MS = 300
const UNTITLED = 'untitled'
/** Which tab the source that App keeps in localStorage is of, being written the moment it changes. */
const SOURCE_OF_KEY = 'glisp.canvas.sourceOf'

interface Options<View> {
	readonly document: GlispDocument
	readFile(text: string): { readonly root: LetAST; readonly whole: boolean } | null
	writeFile(root: LetAST): string
	sourceOf(root: LetAST): string
	blank(): LetAST
	readonly view: { get(): View | undefined; set(view: View): void }
	onSwitched(firstTime: boolean): void
}

const newId = (): string => crypto.randomUUID()

const fresh = (root: LetAST): DocumentState => ({ root, past: [], future: [] })

function rememberSourceOf(id: string): void {
	try {
		localStorage.setItem(SOURCE_OF_KEY, id)
	} catch {
		// It is then read from where it is kept instead, which is only a moment behind.
	}
}

function sourceIsOf(): string | null {
	try {
		return localStorage.getItem(SOURCE_OF_KEY)
	} catch {
		return null
	}
}

export function useFileTabs<View>({ document, readFile, writeFile, sourceOf, blank, view, onSwitched }: Options<View>) {
	const tabs = shallowRef<readonly FileTab[]>([])
	const active = shallowRef<string | null>(null)

	const waiting = new Map<string, DocumentState>()
	const views = new Map<string, View>()
	/** What a tab started as, when that was nothing anyone made, to close it without asking. */
	const blanks = new Map<string, LetAST>()
	const kept = new Map<string, LetAST>()

	const activeTab = computed(() => tabs.value.find(({ id }) => id === active.value) ?? null)

	const remember = (): void => {
		if (active.value === null) return
		// Plain objects, as a store of handles can only clone those.
		void saveTabs({ tabs: tabs.value.map(tab => ({ ...tab })), active: active.value })
	}

	const update = (id: string, change: (tab: FileTab) => FileTab): void => {
		const next = tabs.value.map(tab => (tab.id === id ? change(tab) : tab))
		if (next.some((tab, i) => tab !== tabs.value[i])) {
			tabs.value = next
			remember()
		}
	}

	const keep = (id: string, root: LetAST): void => {
		if (kept.get(id) === root) return
		kept.set(id, root)
		void writeKept(id, writeFile(root))
	}

	let keeping: ReturnType<typeof setTimeout> | undefined
	const keepNow = (): void => {
		clearTimeout(keeping)
		if (active.value !== null) keep(active.value, document.root.value)
	}

	watch(document.root, root => {
		const id = active.value
		if (id === null) return
		update(id, tab => withSource(tab, sourceOf(root)))
		clearTimeout(keeping)
		keeping = setTimeout(keepNow, KEEP_AFTER_MS)
	})
	window.addEventListener('pagehide', keepNow)

	let going = 0

	/** Be at `id`, with what it holds, which is only read once this is known to be still wanted. */
	async function goTo(id: string): Promise<void> {
		if (id === active.value) return
		const asked = ++going
		let state = waiting.get(id)
		if (!state) {
			const text = await readKept(id)
			if (asked !== going) return
			state = fresh((text !== null ? readFile(text)?.root : null) ?? blank())
		}
		keepNow()
		if (active.value !== null) {
			waiting.set(active.value, document.state())
			const left = view.get()
			if (left !== undefined) views.set(active.value, left)
		}
		active.value = id
		rememberSourceOf(id)
		waiting.delete(id)
		kept.set(id, state.root)
		document.resume(state)
		const back = views.get(id)
		if (back !== undefined) view.set(back)
		onSwitched(back === undefined)
		remember()
	}

	const ready = (async () => {
		askToStay()
		const stored = await loadTabs()
		if (stored === null) {
			// What there was before there were tabs is the first of them.
			const id = newId()
			tabs.value = [{ id, name: UNTITLED, handle: null, savedSource: null, dirty: false }]
			active.value = id
			rememberSourceOf(id)
			keep(id, document.root.value)
			remember()
			return
		}
		tabs.value = stored.tabs
		const id = stored.tabs.some(tab => tab.id === stored.active) ? stored.active : stored.tabs[0]!.id
		if (sourceIsOf() === id) {
			active.value = id
			update(id, tab => withSource(tab, sourceOf(document.root.value)))
			return
		}
		await goTo(id)
	})()

	async function addTab(tab: Omit<FileTab, 'id' | 'dirty'>, root: LetAST): Promise<string> {
		const id = newId()
		tabs.value = [...tabs.value, { ...tab, id, dirty: false }]
		waiting.set(id, fresh(root))
		keep(id, root)
		await goTo(id)
		return id
	}

	/** A new tab in this browser, of a program or of nothing yet, as if `leaving` were not there. */
	async function add(root?: LetAST, name = UNTITLED, leaving?: string): Promise<void> {
		await ready
		const program = root ?? blank()
		const others = tabs.value.filter(({ id }) => id !== leaving)
		const id = await addTab({ name: freeTabName(others, name), handle: null, savedSource: null }, program)
		if (!root) blanks.set(id, program)
	}

	async function tabOf(handle: FileSystemFileHandle): Promise<FileTab | null> {
		for (const tab of tabs.value) {
			if (tab.handle && (await tab.handle.isSameEntry(handle))) return tab
		}
		return null
	}

	/** A file in a tab of its own, or the tab it is already in. What is not a program's own stays apart from it. */
	async function openFrom({ text, name, handle }: OpenedFile): Promise<void> {
		await ready
		const already = handle && (await tabOf(handle))
		if (already) return goTo(already.id)
		const reading = readFile(text)
		if (!reading) return
		const own = reading.whole ? handle : null
		await addTab(
			{
				name: freeTabName(tabs.value, nameOfFile(name)),
				handle: own,
				savedSource: own ? sourceOf(reading.root) : null,
			},
			reading.root
		)
	}

	async function open(): Promise<void> {
		const opened = await openFile()
		if (opened) await openFrom(opened)
	}

	/** To the file it is, or else to one of the person's own, which it then is. */
	async function save(asNew: boolean): Promise<void> {
		await ready
		const tab = activeTab.value
		if (!tab) return
		const root = document.root.value
		const handle = await saveFile(writeFile(root), asNew ? null : tab.handle, tab.name)
		if (handle) update(tab.id, it => savedTo(it, handle, sourceOf(root)))
	}

	function rename(id: string, name: string): void {
		const trimmed = name.trim()
		if (trimmed === '') return
		update(id, tab => (tab.handle === null ? { ...tab, name: trimmed } : tab))
	}

	const isBlank = (id: string): boolean => {
		const started = blanks.get(id)
		if (started === undefined) return false
		return (id === active.value ? document.root.value : waiting.get(id)?.root) === started
	}

	async function close(id: string): Promise<void> {
		await ready
		const tab = tabs.value.find(other => other.id === id)
		if (!tab) return
		const loss = lossOnClosing(tab, isBlank(id))
		if (loss !== null && !window.confirm(loss)) return
		if (id === active.value) {
			const next = tabAfterClosing(tabs.value, id)
			if (next === null) await add(undefined, UNTITLED, id)
			else await goTo(next)
			if (active.value === id) return
		}
		tabs.value = tabs.value.filter(other => other.id !== id)
		for (const held of [waiting, views, blanks, kept]) held.delete(id)
		await removeKept(id)
		remember()
	}

	const switchTo = async (id: string): Promise<void> => {
		await ready
		await goTo(id)
	}

	return { tabs, active, ready, add, open, openFrom, save, close, rename, switchTo }
}
