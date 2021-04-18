<template>
	<div class="MonacoEditor" ref="rootEl" />
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import * as Monaco from 'monaco-editor'
import {
	defineComponent,
	inject,
	onMounted,
	onUnmounted,
	Ref,
	ref,
	watch,
} from 'vue'

export default defineComponent({
	name: 'MonacoEditor',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const rootEl = templateRef('rootEl')

		let editor: ReturnType<typeof Monaco.editor.create>

		const scheme = inject<Ref<{[name: string]: string}>>('scheme', ref({}))

		onMounted(() => {
			if (!rootEl.value) return

			editor = Monaco.editor.create(rootEl.value as HTMLElement, {
				value: props.modelValue,
				language: 'clojure',
				fontFamily: "'Fira Code'",
				minimap: {enabled: false},
				lineNumbers: 'off',
				fontSize: 14,
				renderLineHighlight: 'none',
			})

			watch(
				() => scheme,
				() => {
					if (!editor) return

					const {
						base00,
						base01,
						base02,
						base03,
						base04,
						base06,
						base07,
						base08,
						base09,
						base0B,
						base0C,
						base0E,
						accent,
					} = scheme.value

					Monaco.editor.defineTheme('custom-theme', {
						base: 'vs-dark',
						inherit: false,
						rules: [
							{token: '', foreground: base04},
							{token: 'string', foreground: base0B},
							{token: 'string.escape', foreground: base0C},
							{token: 'comment', foreground: base03},
							{token: 'white', foreground: base03},
							{token: 'number', foreground: base09},
							{token: 'constant', foreground: base09},
							{token: 'identifier', foreground: base08},
							{token: 'keyword', foreground: base0E},
						],
						colors: {
							'editor.background': base00,
							'editor.selectionBackground': base01,
							'editorBracketMatch.background': base02,
							'editorBracketMatch.border': base03,
							'editorCursor.foreground': base06,
							'editorIndentGuide.background': base01,
							'editorIndentGuide.activeBackground': base03,
						},
					})

					Monaco.editor.setTheme('custom-theme')
				},
				{immediate: true, deep: true}
			)

			editor.onDidChangeModelContent(e => {
				const value = editor.getValue()
				if (props.modelValue !== value) {
					context.emit('update:modelValue', value, e)
				}
			})
		})

		onUnmounted(() => {
			editor && editor.dispose()
		})
	},
})
</script>

<style lang="stylus">
.MonacoEditor
	width 100%
	height 20em
</style>
