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

export function configureEditor(editor: ace.Editor) {
	editor.$blockScrolling = Infinity
	editor.setShowPrintMargin(false)
	editor.setOption('displayIndentGuides', false)

	const session = editor.getSession()
	session.setMode('ace/mode/clojure')
	session.setUseWrapMode(true)

	editor.setOptions({
		highlightActiveLine: false,
		showGutter: false,
		tabSize: 2,
		useSoftTabs: false,
		maxLines: Infinity
	})
}

export function setupWheelUpdators(editor: ace.Editor) {
	// Updater
	const sel = editor.getSelection()
	const doc = editor.getSession().doc

	const wheelSpeed = (e: MouseWheelEvent) => {
		return (e.shiftKey ? 2 : e.altKey ? 0.02 : 0.5) / 10
	}

	const Updaters = [
		{
			match: /^[-+]?[0-9]+$/,
			parse: (s: string) => parseInt(s),
			update: (val: number, e: MouseWheelEvent) =>
				Math.round(val - e.deltaY * wheelSpeed(e)),
			toString: (val: number) => val.toString()
		},
		{
			match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
			parse: (s: string) => parseFloat(s),
			update: (val: number, e: MouseWheelEvent) =>
				val - e.deltaY * wheelSpeed(e),
			toString: (val: number) => val.toFixed(1)
		},
		{
			// Int 2
			match: /^[-+]?[0-9]+ [-+]?[0-9]+$/,
			parse: (s: string) => s.split(' ').map(parseFloat),
			update: ([x, y]: number[], e: MouseWheelEvent) => [
				x - e.deltaX * wheelSpeed(e),
				y - e.deltaY * wheelSpeed(e)
			],
			toString: (val: number[]) => val.map(v => v.toFixed(0)).join(' ')
		},
		{
			// Float 2
			match: /^[-+]?([0-9]*\.[0-9]+|[0-9]+) [-+]?([0-9]*\.[0-9]+|[0-9]+)$/,
			parse: (s: string) => s.split(' ').map(parseFloat),
			update: ([x, y]: number[], e: MouseWheelEvent) => [
				x - e.deltaX * wheelSpeed(e),
				y - e.deltaY * wheelSpeed(e)
			],
			toString: (val: number[]) => val.map(v => v.toFixed(1)).join(' ')
		}
	]

	let listener: any = null

	sel.on('changeSelection', () => {
		if (listener) {
			window.removeEventListener('mousewheel', listener)
		}

		const origStr = editor.getCopyText()

		if (origStr.trim() === '') {
			return
		}

		const updater = Updaters.find(({match}) => origStr.match(match))

		if (updater) {
			const [start, end] = getEditorSelection(editor)

			let val = updater.parse(origStr)
			const text = editor.getValue()

			const range = sel.getRange()

			listener = (e: WheelEvent) => {
				val = updater.update(val as any, e)

				const newStr = updater.toString(val as any)
				const newText = replaceStrByRange(text, start, end, newStr)

				const newEnd = doc.indexToPosition(
					end + (newStr.length - origStr.length),
					0
				)

				range.setEnd(newEnd.row, newEnd.column)

				editor.setValue(newText)
				sel.setRange(range, false)
			}

			window.addEventListener('mousewheel', listener, {once: true})
		}
	})
}
