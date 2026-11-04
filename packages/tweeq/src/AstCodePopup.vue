<script setup lang="ts">
import type { AST } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import type * as monaco from 'monaco-editor'
import { InputButton } from 'tweeq/InputButton'
import { InputCode } from 'tweeq/InputCode'
import { Popover } from 'tweeq/Popover'
import { ref, watch } from 'vue'

import { EDITOR_OPTIONS, editOneExpression, GLISP, registerGlisp } from './language'
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
	editOneExpression(instance, {
		cancel: dismiss,
		confirm: finish,
	})
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

// Not by the popover's own light dismiss, which would close it whatever is written.
useEventListener(
	window,
	'pointerdown',
	(event: PointerEvent) => {
		const target = event.target as Element | null
		if (!target?.closest('.AstCodePopup, .monaco-editor')) finish()
	},
	{ capture: true }
)

// Wherever the focus has gone, as Esc is how to get away from what cannot be read.
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (event.key === 'Escape') dismiss()
})
</script>

<template>
	<Popover
		:reference="reference"
		:open="true"
		:lightDismiss="false"
		placement="bottom-end"
		arrow
		teleport=".TqViewport"
	>
		<div class="AstCodePopup">
			<InputCode
				v-model="draft"
				:lang="GLISP"
				:options="EDITOR_OPTIONS"
				@mount="onMount"
			/>
			<div class="footer">
				<p class="problem">{{ problem }}</p>
				<InputButton icon="mdi:close" subtle :tooltip="{ content: 'Dismiss', shortcut: ['Esc'] }" @click="dismiss" />
				<InputButton icon="mdi:check" subtle :tooltip="{ content: 'Confirm', shortcut: ['⌘', '↵'] }" @click="finish" />
			</div>
		</div>
	</Popover>
</template>

<style scoped>
.AstCodePopup {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-related);
	width: min(80ch, calc(100vw - 40px));
	font-family: var(--tq-font-code);
}
/* The popup is the editor, so the field has no box of its own. */
.AstCodePopup :deep(.TqInputCode),
.AstCodePopup :deep(.TqInputCode:focus-within) {
	background: none;
	box-shadow: none;
}
.footer {
	display: flex;
	align-items: center;
	gap: var(--tq-gap-related);
}
.footer > :not(.problem) {
	flex: none;
	width: auto;
}
.problem {
	flex: 1;
	min-width: 0;
	color: var(--tq-color-error);
}
</style>
