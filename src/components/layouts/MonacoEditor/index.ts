import MonacoEditor from './MonacoEditor.vue'

export interface MonacoEditorMarker {
	line: number
	message: string
	severity?: 'hint' | 'info' | 'warn' | 'error'
}

export default MonacoEditor
