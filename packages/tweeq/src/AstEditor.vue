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
import {
	LINKER,
	RENAMER,
	REVEALER,
	SELECTION,
	type Selection,
	SOLVER,
	VALUE_ICON,
} from './selection'
import {
	moveBinding,
	parseSource,
	referenceAt,
	referenceTargetOf,
	renameBindingAt,
	viewOf,
} from './structure'

const props = defineProps<{
	document: GlispDocument
	/** Only what adds, where the app around it has the rest, by key and from a menu. */
	compact?: boolean
	/** An icon for what a row comes to, over the one its type has. */
	iconOfValue?: (value: unknown) => string | null
}>()

const emit = defineEmits<{
	/** A row has been selected, or nothing is any more. */
	select: [path: string | null]
}>()

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

provide(VALUE_ICON, value => props.iconOfValue?.(value) ?? null)

provide(LINKER, {
	copied: shallowRef<string | null>(null),
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

// The whole program as code, a binding to a line. It can only be a block of them, so
// that goes unsaid.
const editingEnv = ref(false)
const $envButton = useTemplateRef<HTMLElement>('$envButton')
const envSource = computed(() =>
	props.document.root.value.bindings
		.map(([name, value]) => `${name} = ${print(value)}`)
		.join('\n')
)
const asEnv = (written: string): string => `{\n${written}\n}`
const refuseAsEnv = (next: AST): string | null =>
	next.kind === 'let' && next.body === null ? null : 'This can only have bindings.'

const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)
watch(selection, next => emit('select', next?.path ?? null))

defineExpose({
	/** Open the rows down to one, and select it. */
	reveal(path: string): void {
		revealTarget.value = { path }
	},
})

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

// Pasting into a row, as code, whether it was copied as a value or as an expression.
useEventListener(window, 'paste', (event: ClipboardEvent) => {
	const target = event.target as HTMLElement | null
	if (target?.closest?.('input, textarea, [contenteditable]')) return
	if (selection.value?.paste === undefined) return
	event.preventDefault()
	const next = parseSource(event.clipboardData?.getData('text') ?? '')
	if (next === null) unsolved.value = 'what is on the clipboard cannot be read as code'
	else selection.value.paste(next)
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
	} else if (event.key.toLowerCase() === 'h' && !isMod && !event.altKey) {
		if (selection.value?.evaluate === undefined) return
		event.preventDefault()
		selection.value.evaluate('hide')
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
				v-if="!compact"
				icon="mdi:undo"
				tooltip="Undo"
				subtle
				:disabled="!document.canUndo.value"
				@click="document.undo()"
			/>
			<InputButton
				v-if="!compact"
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
				:expand="asEnv"
				:refuse="refuseAsEnv"
				@change="replaceRoot"
				@close="editingEnv = false"
			/>
			<InputButton
				v-if="!compact"
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
			<li v-if="unsolved !== null">Cannot do that: {{ unsolved }}</li>
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
