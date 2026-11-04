/**
 * A program as a file, which is its source, with the File System Access API where there
 * is one, and a plain download and file input where there is not.
 */

const CANVAS_FILE = {
	description: 'Glisp Canvas',
	accept: { 'text/plain': ['.canvas.glisp'] },
}

interface FilePicking {
	showOpenFilePicker?(options: unknown): Promise<FileSystemFileHandle[]>
	showSaveFilePicker?(options: unknown): Promise<FileSystemFileHandle>
}

const picking = window as unknown as FilePicking

export interface OpenedFile {
	readonly text: string
	readonly handle: FileSystemFileHandle | null
}

/** A cancelled picker is not anything having gone wrong. */
const isCancel = (error: unknown): boolean =>
	error instanceof DOMException && error.name === 'AbortError'

function pickWithInput(): Promise<OpenedFile | null> {
	return new Promise(resolve => {
		const input = window.document.createElement('input')
		input.type = 'file'
		input.accept = '.glisp'
		input.onchange = async () => {
			const file = input.files?.[0]
			resolve(file ? { text: await file.text(), handle: null } : null)
		}
		input.oncancel = () => resolve(null)
		input.click()
	})
}

export async function openFile(): Promise<OpenedFile | null> {
	if (!picking.showOpenFilePicker) return pickWithInput()
	try {
		const [handle] = await picking.showOpenFilePicker({ types: [CANVAS_FILE] })
		if (!handle) return null
		return { text: await (await handle.getFile()).text(), handle }
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

async function write(handle: FileSystemFileHandle, text: string): Promise<void> {
	const stream = await handle.createWritable()
	await stream.write(text)
	await stream.close()
}

/** Save to `handle`, or else where is asked. What it was saved to, if that is known. */
export async function saveFile(
	text: string,
	handle: FileSystemFileHandle | null
): Promise<FileSystemFileHandle | null> {
	if (handle) {
		await write(handle, text)
		return handle
	}
	if (!picking.showSaveFilePicker) {
		download('untitled.canvas.glisp', text, 'text/plain')
		return null
	}
	try {
		const picked = await picking.showSaveFilePicker({
			suggestedName: 'untitled.canvas.glisp',
			types: [CANVAS_FILE],
		})
		await write(picked, text)
		return picked
	} catch (error) {
		if (isCancel(error)) return null
		throw error
	}
}

export async function exportSvg(text: string): Promise<void> {
	if (!picking.showSaveFilePicker) return download('untitled.svg', text, 'image/svg+xml')
	try {
		const picked = await picking.showSaveFilePicker({
			suggestedName: 'untitled.svg',
			types: [{ description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } }],
		})
		await write(picked, text)
	} catch (error) {
		if (!isCancel(error)) throw error
	}
}
