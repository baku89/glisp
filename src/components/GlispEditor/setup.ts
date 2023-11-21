import ace from 'brace'

import {useResizeSensor} from '@/components/use'
import ConsoleScope from '@/scopes/console'

null // Force TS to recognize the following imports as side-effect

// require('brace/theme/tomorrow')
// require('brace/theme/tomorrow_night')
import 'brace/mode/clojure'
import './define-glisp-mode'

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
		maxLines: Infinity,
	})
}

function setupResizeHandler(editor: ace.Editor) {
	useResizeSensor(editor.container, () => {
		editor.resize(true)
	})
}

function setupKeybinds(editor: ace.Editor) {
	editor.commands.addCommand({
		name: 'select-outer',
		bindKey: {win: 'Ctrl-p', mac: 'Command-p'},
		exec: () => {
			ConsoleScope.readEval('(select-outer)')
		},
	})

	editor.commands.addCommand({
		name: 'expand-selected',
		bindKey: {win: 'Ctrl-e', mac: 'Command-e'},
		exec: () => {
			ConsoleScope.readEval('(expand-selected)')
		},
	})
}

export function setupEditor(editor: ace.Editor) {
	setupSettings(editor)
	setupResizeHandler(editor)
	setupKeybinds(editor)
}
