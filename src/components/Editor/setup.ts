import ace from 'brace'
import './define-glisp-mode'
import {useResizeSensor} from '@/components/use'
import ConsoleScope from '@/scopes/console'

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

function setupKeybinds(editor: ace.Editor) {
	editor.commands.addCommand({
		name: 'select-outer',
		bindKey: {win: 'Ctrl-p', mac: 'Command-p'},
		exec: () => {
			ConsoleScope.readEval('(select-outer)')
		}
	})

	editor.commands.addCommand({
		name: 'expand-selected',
		bindKey: {win: 'Ctrl-e', mac: 'Command-e'},
		exec: () => {
			ConsoleScope.readEval('(expand-selected)')
		}
	})
}

export function setupEditor(editor: ace.Editor) {
	setupSettings(editor)
	setupResizeHandler(editor)
	setupKeybinds(editor)
}
