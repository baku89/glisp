<template>
	<div class="SyntaxHIghliter" ref="root" />
</template>

<script lang="ts">
import {asyncComputed, templateRef} from '@vueuse/core'
import {editor} from 'monaco-editor'
import {defineComponent, onMounted, watch} from 'vue'

import {useMonacoEditor} from './MonacoEditor'

export default defineComponent({
	name: 'SyntaxHighlighter',
	props: {
		code: {type: String, required: true},
		lang: {type: String, default: 'glisp'},
	},
	setup(props) {
		useMonacoEditor()
		editor.setTheme('custom-theme')

		const root = templateRef<HTMLElement>('root')

		const codeHtml = asyncComputed(async () => {
			return await editor.colorize(props.code, props.lang, {})
		}, props.code)

		onMounted(() => {
			if (!root.value) return
			const el = root.value
			watch(codeHtml, () => (el.innerHTML = codeHtml.value))
		})
	},
})
</script>
