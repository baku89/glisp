<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type * as monaco from 'monaco-editor'
import { InputButton } from 'tweeq/InputButton'
import { InputCode } from 'tweeq/InputCode'
import { Popover } from 'tweeq/Popover'

import { EDITOR_OPTIONS, editOneExpression } from './language'

/**
 * Lines of text to write, in a popover: Enter goes on to the next line, Cmd+Enter or
 * pressing elsewhere is being done, and Esc is going back. What those mean for what is
 * written is up to whoever opened it.
 */
const props = defineProps<{
	/** What it opens from. */
	reference: HTMLElement | null
	lang: string
	/** Why it cannot be done with yet, if it cannot. */
	problem?: string | null
	/** What opens and closes it by itself, so that pressing it is not pressing elsewhere. */
	opener?: HTMLElement | null
}>()

const draft = defineModel<string>({ required: true })

const emit = defineEmits<{
	mount: [editor: monaco.editor.IStandaloneCodeEditor]
	dismiss: []
	finish: []
}>()

function onMount(instance: monaco.editor.IStandaloneCodeEditor): void {
	emit('mount', instance)
	editOneExpression(instance, {
		cancel: () => emit('dismiss'),
		confirm: () => emit('finish'),
	})
}

// Not by the popover's own light dismiss, which would close it whatever is written.
useEventListener(
	window,
	'pointerdown',
	(event: PointerEvent) => {
		const target = event.target as Element | null
		if (target?.closest('.AstCodePopup, .monaco-editor')) return
		if (target !== null && props.opener?.contains(target)) return
		emit('finish')
	},
	{ capture: true }
)

// Wherever the focus has gone, as Esc is how to get away from what cannot be read.
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (event.key === 'Escape') emit('dismiss')
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
				:lang="lang"
				:options="EDITOR_OPTIONS"
				@mount="onMount"
			/>
			<div class="footer">
				<p class="problem">{{ problem }}</p>
				<InputButton icon="mdi:close" subtle :tooltip="{ content: 'Dismiss', shortcut: ['Esc'] }" @click="emit('dismiss')" />
				<InputButton icon="mdi:check" subtle :tooltip="{ content: 'Confirm', shortcut: ['⌘', '↵'] }" @click="emit('finish')" />
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
