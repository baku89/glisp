import './define-glisp-mode'

import ace from 'brace'

import useResizeSensor from '@/components/use/use-resize-sensor'

require('brace/mode/clojure')
require('brace/mode/glsl')
require('brace/mode/json')

function setupSettings(editor: ace.Editor) {
	editor.$blockScrolling = Infinity
	editor.setShowPrintMargin(false)
	editor.setOption('displayIndentGuides', false)

	const session = editor.getSession()

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

// function setupKeybinds(editor: ace.Editor) {
// 	editor.commands.addCommand({
// 		name: 'select-outer',
// 		bindKey: {win: 'Ctrl-p', mac: 'Command-p'},
// 		exec: () => {
// 			ConsoleScope.readEval('(select-outer)')
// 		},
// 	})
// 	editor.commands.addCommand({
// 		name: 'expand-selected',
// 		bindKey: {win: 'Ctrl-e', mac: 'Command-e'},
// 		exec: () => {
// 			ConsoleScope.readEval('(expand-selected)')
// 		},
// 	})
// }

export function setupEditor(editor: ace.Editor) {
	setupSettings(editor)
	setupResizeHandler(editor)
	// setupKeybinds(editor)
}
