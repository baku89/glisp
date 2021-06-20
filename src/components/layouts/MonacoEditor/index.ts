import MonacoEditor from './MonacoEditor.vue'
import useMonacoEditor from './use-monaco-editor'

interface MonacoEditorMarker {
	line: number
	message: string
	severity?: 'hint' | 'info' | 'warn' | 'error'
}

export {useMonacoEditor, MonacoEditorMarker}

export default MonacoEditor
