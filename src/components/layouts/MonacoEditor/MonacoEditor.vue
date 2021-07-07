<template>
	<div class="MonacoEditor">
		<div class="MonacoEditor__editor" ref="editorEl" />
	</div>
</template>

<script lang="ts">
import './languages/glisp'
import './languages/glsl'

import {templateRef} from '@vueuse/core'
import {editor as Editor, MarkerSeverity} from 'monaco-editor'
import {defineComponent, onMounted, onUnmounted, PropType, watch} from 'vue'

import {MonacoEditorMarker} from '.'
import useMonacoEditor from './use-monaco-editor'

export default defineComponent({
	name: 'MonacoEditor',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		lang: {
			type: String,
			default: 'glisp',
		},
		markers: {
			type: Array as PropType<MonacoEditorMarker[]>,
			default: () => [],
		},
	},
	emits: ['update:modelValue', 'update:editor'],
	setup(props, context) {
		const editorEl = templateRef<HTMLElement>('editorEl')

		let editor: ReturnType<typeof Editor.create>

		useMonacoEditor()

		onMounted(() => {
			if (!editorEl.value) return

			editor = Editor.create(editorEl.value, {
				value: props.modelValue,
				automaticLayout: true,
				language: props.lang,
				fontFamily: "'Fira Code'",
				minimap: {enabled: false},
				glyphMargin: false,
				lineDecorationsWidth: 0,
				lineNumbersMinChars: 0,
				scrollBeyondLastLine: false,
				folding: false,
				lineNumbers: 'off',
				lineHeight: 21,
				fontLigatures: true,
				fontSize: 14,
				renderLineHighlight: 'none',
				overviewRulerLanes: 0,
				wordWrap: 'on',
			})

			editor.onDidChangeModelContent(e => {
				const value = editor.getValue()
				context.emit('update:modelValue', value, e)
			})

			// Markers
			function getSeverity(severity: MonacoEditorMarker['severity'] = 'error') {
				switch (severity) {
					case 'hint':
						return MarkerSeverity.Hint
					case 'info':
						return MarkerSeverity.Info
					case 'warn':
						return MarkerSeverity.Warning
					case 'error':
						return MarkerSeverity.Error
				}
			}

			watch(
				() => props.markers,
				markers =>
					Editor.setModelMarkers(
						editor.getModel() as any,
						'errors',
						markers.map(m => ({
							startLineNumber: m.line,
							endLineNumber: m.line,
							startColumn: 0,
							endColumn: 1000,
							message: m.message,
							severity: getSeverity(m.severity),
						}))
					),
				{immediate: true}
			)

			watch(
				() => props.modelValue,
				value => editor.getValue() !== value && editor.setValue(value)
			)

			context.emit('update:editor', editor)
		})

		onUnmounted(() => {
			editor?.dispose()
			context.emit('update:editor', null)
		})
	},
})
</script>

<style lang="stylus">
.MonacoEditor
	position relative
	overflow hidden
	height 100%

	&__editor
		position absolute
		height 100%
		inset 0
</style>
