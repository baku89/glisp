import ace from 'brace'
import './define-glisp-mode'
import {useResizeSensor} from '@/components/use'

// require('brace/theme/tomorrow')
// require('brace/theme/tomorrow_night')
require('brace/mode/clojure')

function setupSettings(editor: ace.Editor) {
	editor.$blockScrolling = Infinity
	editor.setShowPrintMargin(false)
	editor.setOption('displayIndentGuides', false)
	// editor.setTheme('tomorrow')

	const session = editor.getSession()
	// session.setMode('ace/mode/clojure')
	session.setMode('ace/mode/glisp')

	session.setUseWrapMode(true)

	editor.setOptions({
		highlightActiveLine: false,
		showGutter: false,
		tabSize: 2,
		useSoftTabs: false,
		maxLines: Infinity
	})
}

function setupResizeHandler(editor: ace.Editor) {
	useResizeSensor(editor.container, el => {
		editor.resize(true)
	})
}

export function setupEditor(editor: ace.Editor) {
	setupSettings(editor)
	setupResizeHandler(editor)
}
