/**
 * Where tabs are kept in this browser, which is the origin private file system: a file for what
 * each holds, and a file of which there are. A handle to a file of the person's own is the one
 * thing that cannot be written to a file, so those are in IndexedDB. If a browser refuses any of
 * this, what is being edited lasts as long as the page, and it says so in the console.
 */

import type { FileTab } from './fileTabs'

const DATABASE = 'glisp.canvas'
const STORE = 'files'
const HANDLES_KEY = 'handles'
/** Where the list of tabs was, before it was a file. */
const OLD_INDEX_KEY = 'tabs'
const DIRECTORY = 'canvas'
const INDEX_FILE = 'tabs.json'

export interface StoredTabs {
	readonly tabs: readonly FileTab[]
	readonly active: string
}

const complain = (doing: string) => (error: unknown): void => {
	console.warn(`Could not ${doing} in this browser:`, error)
}

/** Ask not to have this cleared when the browser wants room. It may say no, and is still used. */
export function askToStay(): void {
	navigator.storage?.persist?.().catch(complain('ask for storage to stay'))
}

function database(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const opening = indexedDB.open(DATABASE, 1)
		opening.onupgradeneeded = () => opening.result.createObjectStore(STORE)
		opening.onsuccess = () => resolve(opening.result)
		opening.onerror = () => reject(opening.error)
	})
}

async function inStore<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await database()
	try {
		return await new Promise<T>((resolve, reject) => {
			const request = act(db.transaction(STORE, mode).objectStore(STORE))
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => reject(request.error)
		})
	} finally {
		db.close()
	}
}

const directory = async (): Promise<FileSystemDirectoryHandle> =>
	(await navigator.storage.getDirectory()).getDirectoryHandle(DIRECTORY, { create: true })

const fileNameOf = (id: string): string => `${id}.glisp.svg`

async function readFromKept(name: string): Promise<string | null> {
	try {
		const handle = await (await directory()).getFileHandle(name)
		return await (await handle.getFile()).text()
	} catch (error) {
		if (!(error instanceof DOMException && error.name === 'NotFoundError')) complain(`read ${name}`)(error)
		return null
	}
}

// One at a time, so that of two writes of a file the later is what stays.
let writing: Promise<unknown> = Promise.resolve()

function inTurn(doing: string, act: () => Promise<void>): Promise<void> {
	const settled = writing.then(act).catch(complain(doing))
	writing = settled
	return settled
}

function writeToKept(name: string, text: string): Promise<void> {
	return inTurn(`keep ${name}`, async () => {
		const handle = await (await directory()).getFileHandle(name, { create: true })
		const stream = await handle.createWritable()
		await stream.write(text)
		await stream.close()
	})
}

export const readKept = (id: string): Promise<string | null> => readFromKept(fileNameOf(id))

export const writeKept = (id: string, text: string): Promise<void> => writeToKept(fileNameOf(id), text)

export const removeKept = (id: string): Promise<void> =>
	inTurn(`remove ${id}`, async () => (await directory()).removeEntry(fileNameOf(id)))

type Handles = Readonly<Record<string, FileSystemFileHandle>>

async function fromDatabase<T>(key: string): Promise<T | undefined> {
	try {
		return await inStore<T | undefined>('readonly', store => store.get(key))
	} catch (error) {
		complain(`read ${key}`)(error)
		return undefined
	}
}

export async function loadTabs(): Promise<StoredTabs | null> {
	const text = await readFromKept(INDEX_FILE)
	if (text === null) {
		const old = await fromDatabase<StoredTabs>(OLD_INDEX_KEY)
		return old && old.tabs.length > 0 ? old : null
	}
	try {
		const { tabs, active } = JSON.parse(text) as { tabs: Omit<FileTab, 'handle'>[]; active: string }
		const handles = (await fromDatabase<Handles>(HANDLES_KEY)) ?? {}
		// Without its handle, what it holds is still here, and it is only in this browser again.
		const withHandles = tabs.map(tab => {
			const handle = handles[tab.id] ?? null
			return handle ? { ...tab, handle } : { ...tab, handle, savedSource: null, dirty: false }
		})
		return withHandles.length > 0 ? { tabs: withHandles, active } : null
	} catch (error) {
		complain(`read ${INDEX_FILE}`)(error)
		return null
	}
}

export async function saveTabs({ tabs, active }: StoredTabs): Promise<void> {
	const handles = Object.fromEntries(tabs.flatMap(({ id, handle }) => (handle ? [[id, handle]] : [])))
	const written = tabs.map(({ handle: _, ...tab }) => tab)
	await Promise.all([
		writeToKept(INDEX_FILE, JSON.stringify({ tabs: written, active })),
		inStore('readwrite', store => store.put(handles, HANDLES_KEY)).catch(complain('keep file handles')),
	])
}
