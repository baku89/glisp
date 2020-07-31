import ace from 'brace'

export function replaceStrByRange(
	s: string,
	start: number,
	end: number,
	substitute: string
) {
	return s.substring(0, start) + substitute + s.substring(end)
}

export function getEditorSelection(editor: ace.Editor) {
	const sel = editor.getSelection()
	const doc = editor.getSession().doc

	const range = sel.getRange()
	const start = doc.positionToIndex(range.start, 0)
	const end = doc.positionToIndex(range.end, 0)

	return [start, end]
}

export function convertToAceRange(
	editor: ace.Editor,
	start: number,
	end: number
) {
	const doc = editor.getSession().doc

	const s = doc.indexToPosition(start, 0)
	const e = doc.indexToPosition(end, 0)

	const range = editor.getSelectionRange()
	range.setStart(s.row, s.column)
	range.setEnd(e.row, e.column)

	return range
}
