<script setup lang="ts">
import type { AST } from '@glisp/lang'
import type * as monaco from 'monaco-editor'
import { ref, watch } from 'vue'

import CodePopover from './CodePopover.vue'
import { GLISP, registerGlisp } from './language'
import { parseSource, sourceOf } from './structure'

const props = defineProps<{
	/** What it opens from. */
	reference: HTMLElement | null
	/** What is being edited, to tell whether anything has changed. */
	ast: AST
	/** What to start with, if not what is being edited. */
	start?: string
	/** What is written, as what it is short for, if it is short for anything. */
	expand?: (written: string) => string
	/** Why what is written cannot go here, if it cannot. */
	refuse?: (next: AST) => string | null
}>()

const emit = defineEmits<{
	/** It has come to read differently, as it is written, or back to how it was. */
	change: [next: AST]
	close: []
}>()

registerGlisp()

const OPENING_KEY_MS = 300

const initial = props.start ?? sourceOf(props.ast)
const draft = ref(initial)
const problem = ref<string | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const parsed = (): AST | null =>
	parseSource(props.expand?.(draft.value) ?? draft.value)

/**
 * The `=` that opened it can still arrive as text, once the editor has the focus,
 * however its keydown was cancelled. It is not what anyone meant to write.
 */
function dropOpeningKey(instance: monaco.editor.IStandaloneCodeEditor): void {
	const openedAt = performance.now()
	const watcher = instance.onDidChangeModelContent(() => {
		watcher.dispose()
		if (performance.now() - openedAt > OPENING_KEY_MS) return
		if (instance.getValue() !== `${initial}=`) return
		instance.setValue(initial)
		const end = instance.getModel()?.getFullModelRange().getEndPosition()
		if (end !== undefined) instance.setPosition(end)
	})
}

function onMount(instance: monaco.editor.IStandaloneCodeEditor): void {
	editor = instance
	dropOpeningKey(instance)
}

const original = props.ast

// Whatever can be read shows as it is written, so that its value can be watched.
watch(draft, () => {
	problem.value = null
	const next = parsed()
	if (next === null || props.refuse?.(next)) return
	if (sourceOf(next) !== sourceOf(props.ast)) emit('change', next)
})

/** Back to how it was, whatever has shown since. */
function dismiss(): void {
	if (props.ast !== original) emit('change', original)
	emit('close')
}

/** Keep what is written, and if it cannot be read, stay, rather than lose it. */
function finish(): void {
	if (draft.value.trim() === '') return dismiss()
	const next = parsed()
	problem.value =
		next === null
			? 'This cannot be read yet. Esc leaves it as it was.'
			: (props.refuse?.(next) ?? null)
	if (problem.value !== null) {
		// After the press that is on its way, which takes the focus.
		requestAnimationFrame(() => editor?.focus())
		return
	}
	emit('close')
}
</script>

<template>
	<CodePopover
		v-model="draft"
		:reference="reference"
		:lang="GLISP"
		:problem="problem"
		@mount="onMount"
		@dismiss="dismiss"
		@finish="finish"
	/>
</template>
