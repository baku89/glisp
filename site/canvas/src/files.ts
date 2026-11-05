/**
 * A program as a file, which is an SVG with its source in it, with the File System Access
 * API where there is one, and a plain download and file input where there is not.
 */

const EXTENSION = '.glisp.svg'
const FILE_TYPE = 'image/svg+xml'

const CANVAS_FILE = {
	description: 'Glisp Canvas',
	accept: { [FILE_TYPE]: [EXTENSION] },
}

/** Any SVG can be opened, and so can a file of source from before. */
const OPENABLE = {
	description: 'Glisp Canvas or SVG',
	accept: { [FILE_TYPE]: ['.svg'], 'text/plain': ['.glisp'] },
}

interface FilePicking {
	showOpenFilePicker?(options: unknown): Promise<FileSystemFileHandle[]>
	showSaveFilePicker?(options: unknown): Promise<FileSystemFileHandle>
}

const picking = window as unknown as FilePicking

export interface OpenedFile {
	readonly text: string
	readonly name: string
	readonly handle: FileSystemFileHandle | null
}

/** A cancelled picker is not anything having gone wrong. */
const isCancel = (error: unknown): boolean =>
	error instanceof DOMException && error.name === 'AbortError'

function pickWithInput(): Promise<OpenedFile | null> {
	return new Promise(resolve => {
		const input = window.document.createElement('input')
		input.type = 'file'
		input.accept = '.svg,.glisp'
		input.onchange = async () => {
			const file = input.files?.[0]
			resolve(file ? { text: await file.text(), name: file.name, handle: null } : null)
		}
		input.oncancel = () => resolve(null)
		input.click()
	})
}

export async function openFile(): Promise<OpenedFile | null> {
	if (!picking.showOpenFilePicker) return pickWithInput()
	try {
		const [handle] = await picking.showOpenFilePicker({ types: [OPENABLE] })
		if (!handle) return null
		const file = await handle.getFile()
		return { text: await file.text(), name: file.name, handle }
	} catch (error) {
		if (isCancel(error)) return null
		throw error
	}
}

function download(name: string, text: string, type: string): void {
	const url = URL.createObjectURL(new Blob([text], { type }))
	const link = window.document.createElement('a')
	link.href = url
	link.download = name
	link.click()
	URL.revokeObjectURL(url)
}

/**
 * Whether a file can be written to. One kept from before has to be asked about again, which
 * only comes up when it is saved to, as that takes something the person did.
 */
async function canWrite(handle: FileSystemFileHandle): Promise<boolean> {
	const asking = handle as unknown as {
		requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>
	}
	return ((await asking.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted'
}

async function write(handle: FileSystemFileHandle, text: string): Promise<void> {
	const stream = await handle.createWritable()
	await stream.write(text)
	await stream.close()
}

/** Save to `handle`, or else where is asked, called `name`. What it was saved to, if that is known. */
export async function saveFile(
	text: string,
	handle: FileSystemFileHandle | null,
	name: string
): Promise<FileSystemFileHandle | null> {
	if (handle) {
		if (!(await canWrite(handle))) return null
		await write(handle, text)
		return handle
	}
	if (!picking.showSaveFilePicker) {
		download(`${name}${EXTENSION}`, text, FILE_TYPE)
		return null
	}
	try {
		const picked = await picking.showSaveFilePicker({
			suggestedName: `${name}${EXTENSION}`,
			types: [CANVAS_FILE],
		})
		await write(picked, text)
		return picked
	} catch (error) {
		if (isCancel(error)) return null
		throw error
	}
}

export async function exportSvg(text: string, name: string): Promise<void> {
	if (!picking.showSaveFilePicker) return download(`${name}.svg`, text, 'image/svg+xml')
	try {
		const picked = await picking.showSaveFilePicker({
			suggestedName: `${name}.svg`,
			types: [{ description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } }],
		})
		await write(picked, text)
	} catch (error) {
		if (!isCancel(error)) throw error
	}
}
