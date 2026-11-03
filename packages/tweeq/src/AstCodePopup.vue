<script setup lang="ts">
import type { AST } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import type * as monaco from 'monaco-editor'
import { InputCode } from 'tweeq/InputCode'
import { Popover } from 'tweeq/Popover'
import { ref } from 'vue'

import { EDITOR_OPTIONS, editOneExpression, GLISP, registerGlisp } from './language'
import { parseSource, sourceOf } from './structure'

const props = defineProps<{
	/** What it opens from. */
	reference: HTMLElement | null
	/** What is being edited, to tell whether anything has changed. */
	ast: AST
	/** What to start with, if not what is being edited. */
	start?: string
	/** Why what is written cannot go here, if it cannot. */
	refuse?: (next: AST) => string | null
}>()

const emit = defineEmits<{
	/** It has been written differently. `close` follows. */
	change: [next: AST]
	close: []
}>()

registerGlisp()

const initial = props.start ?? sourceOf(props.ast)
const draft = ref(initial)
const problem = ref<string | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null

function onMount(instance: monaco.editor.IStandaloneCodeEditor): void {
	editor = instance
	editOneExpression(instance, {
		// With nothing written, there is nothing to go on with.
		isFinished: () => draft.value.trim() === '' || parseSource(draft.value) !== null,
		cancel: () => emit('close'),
		confirm: finish,
	})
}

/** Take what is written, and if it cannot be read, stay, rather than lose it. */
function finish(): void {
	if (draft.value.trim() !== '' && draft.value !== initial) {
		const next = parseSource(draft.value)
		problem.value =
			next === null
				? 'This cannot be read yet. Esc leaves it as it was.'
				: (props.refuse?.(next) ?? null)
		if (next === null || problem.value !== null) {
			// After the press that is on its way, which takes the focus.
			requestAnimationFrame(() => editor?.focus())
			return
		}
		if (sourceOf(next) !== sourceOf(props.ast)) emit('change', next)
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
	if (event.key === 'Escape') emit('close')
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
				@update:modelValue="problem = null"
			/>
			<p v-if="problem !== null" class="problem">{{ problem }}</p>
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
.problem {
	color: var(--tq-color-error);
}
</style>
