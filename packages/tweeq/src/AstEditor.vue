<script setup lang="ts">
import { type AST, type Env, LetAST, print, solve, toAst } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import { InputButton } from 'tweeq/InputButton'
import { ParameterTree } from 'tweeq/ParameterGrid'
import { ScrollArea } from 'tweeq/ScrollArea'
import { computed, provide, ref, shallowRef, useTemplateRef, watch } from 'vue'

import AstCodePopup from './AstCodePopup.vue'
import AstSlots from './AstSlots.vue'
import { type GlispDocument } from './document'
import { LINKER, RENAMER, REVEALER, SELECTION, type Selection, SOLVER } from './selection'
import {
	moveBinding,
	referenceAt,
	referenceTargetOf,
	renameBindingAt,
	viewOf,
} from './structure'

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

const rootAppend = computed(
	() => viewOf(props.document.root.value, props.document.env.value).append
)

const revealTarget = shallowRef<{ path: string; rename?: boolean } | null>(null)

function reset(): void {
	replaceRoot(new LetAST([], null))
}

function addBinding(): void {
	const { append } = viewOf(props.document.root.value, props.document.env.value)
	if (append === null) return
	replaceRoot(append.add())
	if (append.key !== undefined) {
		revealTarget.value = { path: append.key, rename: true }
	}
}

provide(REVEALER, {
	target: revealTarget,
	targetOf: path =>
		referenceTargetOf(props.document.root.value, props.document.env.value, path),
})

provide(RENAMER, {
	can: (path, name) =>
		renameBindingAt(
			props.document.root.value,
			props.document.env.value,
			path,
			name
		) !== null,
	apply(path, name) {
		const next = renameBindingAt(
			props.document.root.value,
			props.document.env.value,
			path,
			name
		)
		if (next !== null) replaceRoot(next)
	},
})

const linked = (source: string, target: string): AST | null =>
	referenceAt(props.document.root.value, props.document.env.value, source, target)

provide(LINKER, {
	can: (source, target) => linked(source, target) !== null,
	link(source, target) {
		const next = linked(source, target)
		if (next !== null) replaceRoot(next)
	},
})

/** Why the last value asked of a row could not be, until something changes. */
const unsolved = shallowRef<string | null>(null)

provide(SOLVER, {
	solve(node, value) {
		const { ast, diagnostics } = solve(
			props.document.root.value,
			props.document.env.value,
			node,
			value
		)
		unsolved.value = diagnostics[0]?.message ?? null
		if (ast !== null && ast !== props.document.root.value) replaceRoot(ast)
	},
})

type DropPosition = 'before' | 'after' | 'inside'

const moved = (source: string, target: string, position: DropPosition): AST | null =>
	moveBinding(
		props.document.root.value,
		props.document.env.value,
		source,
		target,
		position
	)
const canMove = (source: string, target: string, position: DropPosition): boolean =>
	moved(source, target, position) !== null

function move(source: string, target: string, position: DropPosition): void {
	const next = moved(source, target, position)
	if (next !== null) replaceRoot(next)
}

function replaceRoot(next: AST): void {
	if (next.kind === 'let') {
		props.document.setRoot(new LetAST(next.bindings, null))
	}
}

// The whole program as code, a binding to a line, which is how it is easiest to read.
const editingEnv = ref(false)
const $envButton = useTemplateRef<HTMLElement>('$envButton')
const envSource = computed(() => {
	const lines = props.document.root.value.bindings.map(
		([name, value]) => `\t${name} = ${print(value)}\n`
	)
	return lines.length === 0 ? '{}' : `{\n${lines.join('')}}`
})
const refuseAsEnv = (next: AST): string | null =>
	next.kind === 'let' ? null : 'This has to be a block of bindings.'

const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)

// A selection deletes through the tree as it was, so an edit ends it.
watch(props.document.root, () => {
	selection.value = null
	unsolved.value = null
})

// A press anywhere but on a row's label, or the menu it opened, ends a selection.
useEventListener(window, 'pointerdown', (event: PointerEvent) => {
	unsolved.value = null
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
	} else if (isMod && event.key.toLowerCase() === 'c') {
		// Text that is selected, as in a REPL, is what a copy means if there is any.
		if (selection.value?.evaluate === undefined || !getSelection()?.isCollapsed) return
		event.preventDefault()
		selection.value.evaluate('copy')
	} else if (event.key.toLowerCase() === 'e' && !isMod && !event.altKey) {
		if (selection.value?.evaluate === undefined) return
		event.preventDefault()
		selection.value.evaluate(event.shiftKey ? 'all' : 'step')
	} else if (event.key.toLowerCase() === 'p' && !isMod && !event.altKey) {
		if (selection.value?.evaluate === undefined) return
		event.preventDefault()
		selection.value.evaluate('pin')
	} else if (event.key.toLowerCase() === 'v' && !isMod && !event.altKey) {
		if (selection.value?.editValue === undefined) return
		event.preventDefault()
		selection.value.editValue()
	} else if (event.key === '=' && !isMod && !event.altKey) {
		event.preventDefault()
		if (selection.value === null) editingEnv.value = true
		else selection.value.editExpression?.()
	} else if (event.key === 'Enter' || event.key === 'F2') {
		if (selection.value?.rename === undefined) return
		event.preventDefault()
		selection.value.rename()
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
				tooltip="Undo"
				subtle
				:disabled="!document.canUndo.value"
				@click="document.undo()"
			/>
			<InputButton
				icon="mdi:redo"
				tooltip="Redo"
				subtle
				:disabled="!document.canRedo.value"
				@click="document.redo()"
			/>
			<InputButton icon="mdi:plus" label="Add" subtle @click="addBinding" />
			<span ref="$envButton" class="env-button">
				<InputButton
					icon="mdi:code-braces"
					tooltip="Edit Expression"
					subtle
					@click="editingEnv = true"
				/>
			</span>
			<AstCodePopup
				v-if="editingEnv"
				:reference="$envButton"
				:ast="document.root.value"
				:start="envSource"
				:refuse="refuseAsEnv"
				@change="replaceRoot"
				@close="editingEnv = false"
			/>
			<InputButton
				class="reset"
				icon="mdi:restore"
				label="Reset"
				subtle
				:disabled="bindings.length === 0"
				@click="reset"
			/>
		</div>
		<ScrollArea class="tree">
			<ParameterTree name="glisp.env" :canDrop="canMove" @move="move">
				<AstSlots
					:slots="bindings"
					parentPath=""
					:append="rootAppend"
					noAddRow
					:read="document.read"
					:show="show"
					@change="replaceRoot"
				/>
			</ParameterTree>
		</ScrollArea>
		<ul
			v-if="unsolved !== null || document.diagnostics.value.length > 0"
			class="problems"
		>
			<li v-if="unsolved !== null">Cannot change that value: {{ unsolved }}</li>
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
	height: 100%;
	min-width: 0;
}
/* Only the tree scrolls, so that what acts on it stays in reach. */
.tree {
	flex: 1;
	/* Room for the ring of a focused input, and a selected row's color, which it would
	clip, taken from around it so that the rows stay where they are. */
	margin: -1px;
	padding: 3px;
}
.reset {
	margin-left: auto;
}
.env-button {
	display: inline-flex;
}
.toolbar {
	flex-shrink: 0;
	width: auto;
	display: flex;
	gap: var(--tq-gap-related);
}
.problems {
	flex-shrink: 0;
	max-height: 30%;
	overflow-y: auto;
	list-style: none;
	font-family: var(--tq-font-code);
	color: var(--tq-color-error);
}
</style>
