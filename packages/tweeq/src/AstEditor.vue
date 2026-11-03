<script setup lang="ts">
import { type AST, type Env, LetAST, toAst } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import { InputButton } from 'tweeq/InputButton'
import { ParameterTree } from 'tweeq/ParameterGrid'
import { computed, provide, shallowRef, watch } from 'vue'

import AstNode from './AstNode.vue'
import { type GlispDocument } from './document'
import { SELECTION, type Selection } from './selection'
import { viewOf } from './structure'

const props = defineProps<{ document: GlispDocument }>()

const show = (value: unknown, env: Env): string => {
	try {
		return toAst(value, env).print()
	} catch {
		return String(value)
	}
}

const bindings = computed(
	() => viewOf(props.document.root.value, props.document.env.value).slots
)

function replaceRoot(next: AST): void {
	if (next.kind === 'let') {
		props.document.setRoot(new LetAST(next.bindings, null))
	}
}

const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)

// A selection deletes through the tree as it was, so an edit ends it.
watch(props.document.root, () => {
	selection.value = null
})

// A press anywhere but on a row's label, or the menu it opened, ends a selection.
useEventListener(window, 'pointerdown', (event: PointerEvent) => {
	const target = event.target as Element | null
	if (target?.closest('.TqParameterTreeItem .row, [popover]')) return
	selection.value = null
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	const target = event.target as HTMLElement | null
	if (target?.closest('input, textarea, [contenteditable]')) return
	const isMod = event.metaKey || event.ctrlKey
	if (isMod && event.key.toLowerCase() === 'z') {
		event.preventDefault()
		if (event.shiftKey) props.document.redo()
		else props.document.undo()
	} else if (event.key === 'Delete' || event.key === 'Backspace') {
		if (selection.value?.remove === undefined) return
		event.preventDefault()
		selection.value.remove()
	} else if (event.key === 'Escape') {
		selection.value = null
	}
})
</script>

<template>
	<div class="AstEditor">
		<div class="toolbar">
			<InputButton
				icon="mdi:undo"
				:disabled="!document.canUndo.value"
				@click="document.undo()"
			/>
			<InputButton
				icon="mdi:redo"
				:disabled="!document.canRedo.value"
				@click="document.redo()"
			/>
		</div>
		<ParameterTree name="glisp.env">
			<AstNode
				v-for="binding in bindings"
				:key="binding.key"
				:entry="binding"
				:path="binding.key"
				:read="document.read"
				:show="show"
				@change="replaceRoot"
			/>
		</ParameterTree>
		<ul v-if="document.diagnostics.value.length > 0" class="problems">
			<li v-for="(problem, i) in document.diagnostics.value" :key="i">
				{{ problem.message }}
			</li>
		</ul>
	</div>
</template>

<style scoped>
.AstEditor {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-control);
	min-width: 0;
}
.toolbar {
	display: flex;
	gap: var(--tq-gap-related);
	width: fit-content;
}
.problems {
	list-style: none;
	font-family: var(--tq-font-code);
	color: var(--tq-color-error);
}
</style>
