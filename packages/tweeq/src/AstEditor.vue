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
import { copiedRows, pastedRows, withoutRows } from './rowsClipboard'
import {
	ALSO_SELECTED,
	LINKER,
	OPEN_ROW,
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
	type Slot,
	viewOf,
} from './structure'

const props = defineProps<{
	document: GlispDocument
	/** Only what adds, where the app around it has the rest, by key and from a menu. */
	compact?: boolean
	/** An icon for what a row comes to, over the one its type has. */
	iconOfValue?: (value: unknown) => string | null
	/** Rows selected along with the one that is, from elsewhere, such as a canvas. */
	alsoSelected?: readonly string[]
	/** Only the names, as a list of what there is, with the values left to an inspector. */
	layers?: boolean
	/**
	 * Be an inspector: only this row, open, and nothing of its own to say about keys
	 * or the selection, which are for the tree. Null with nothing to inspect.
	 */
	inspect?: string | null
}>()

const emit = defineEmits<{
	/** A row has been selected, or nothing is any more. */
	select: [path: string | null]
	/** The whole program is to be edited as code, which is elsewhere among layers. */
	code: []
	/** These rows have just been pasted. */
	pasted: [paths: readonly string[]]
	/** An inspector would go out to the row that holds what it shows. */
	outer: [path: string]
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

const revealTarget = shallowRef<{
	path: string
	rename?: boolean
	quiet?: boolean
} | null>(null)

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

const isInspector = computed(() => props.inspect !== undefined)
provide(OPEN_ROW, () => props.inspect ?? null)

/** The row being inspected, and the slots down to it, to go back up through. */
const inspected = computed(() => {
	if (!props.inspect) return null
	const parts = props.inspect.split('/')
	const parent = parts.slice(0, -1).join('/')
	const chain: Slot[] = []
	let node: AST = props.document.root.value
	let env: Env = props.document.env.value
	for (const key of parts) {
		const slots: readonly Slot[] = viewOf(node, env).slots
		const slot = slots.find(s => s.key === key)
		if (slot === undefined) return null
		chain.push(slot)
		node = slot.ast
		env = slot.env
	}
	const view = viewOf(node, env)
	const own = chain.at(-1)!
	return {
		chain,
		parentPath: parent,
		view,
		// With nothing inside it, what there is to see of it is itself.
		alone: view.slots.length === 0 && view.missing.length === 0 && view.append === null,
		title: view.head?.label ?? own.label,
		doc: view.head?.doc ?? own.doc ?? null,
	}
})

/** The row inspected, or what holds it if it is alone, has changed, and so what is around. */
function replaceInspected(next: AST): void {
	const chain = inspected.value?.chain ?? []
	const from = inspected.value?.alone ? chain.length - 2 : chain.length - 1
	let parent = next
	for (let i = from; i >= 0; i--) parent = chain[i]!.replace(parent)
	replaceRoot(parent)
}

/** The rows a key is about: all that are selected, where something else selects them. */
const selectedRows = (): readonly string[] => {
	const also = props.alsoSelected ?? []
	if (also.length > 1) return also
	return selection.value === null ? [] : [selection.value.path]
}

function copyRows(): boolean {
	const text = copiedRows(
		props.document.root.value,
		props.document.env.value,
		selectedRows()
	)
	if (text === '') return false
	void navigator.clipboard.writeText(text)
	return true
}

function removeRows(): void {
	const next = withoutRows(
		props.document.root.value,
		props.document.env.value,
		selectedRows()
	)
	reselectNothing = true
	replaceRoot(next)
}

const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)
watch(
	() => props.inspect,
	() => {
		if (isInspector.value) selection.value = null
	}
)
provide(ALSO_SELECTED, () => props.alsoSelected ?? [])
/** What was selected has just gone, so there is nothing to select again. */
let reselectNothing = false
/** A row on its way to being selected again, having been edited. */
let reselecting: string | null = null
watch(selection, next => {
	if (next !== null) reselecting = null
	emit('select', next?.path ?? reselecting)
})

const rowExists = (path: string): boolean => {
	let node: AST = props.document.root.value
	let env: Env = props.document.env.value
	for (const key of path.split('/')) {
		const slots: readonly Slot[] = viewOf(node, env).slots
		const slot = slots.find(s => s.key === key)
		if (slot === undefined) return false
		node = slot.ast
		env = slot.env
	}
	return true
}

defineExpose({
	/** Open the rows down to one, and select it. */
	reveal(path: string): void {
		revealTarget.value = { path }
	},
	/** Select no row. */
	deselect(): void {
		selection.value = null
	},
})

// A selection deletes through the tree as it was, so an edit makes it again, from the
// row as it is now, if it is still there.
watch(props.document.root, () => {
	const path = reselectNothing ? null : (selection.value?.path ?? null)
	reselectNothing = false
	// A row already on its way to being selected, such as one just added, goes first.
	const coming = revealTarget.value?.path ?? null
	reselecting = coming ?? (path !== null && rowExists(path) ? path : null)
	selection.value = null
	unsolved.value = null
	if (coming === null && reselecting !== null) {
		revealTarget.value = { path: reselecting, quiet: true }
	}
})

// A press anywhere but on a row's label, or the menu it opened, ends a selection, unless
// where it was pressed has its own say in what is selected.
useEventListener(window, 'pointerdown', (event: PointerEvent) => {
	unsolved.value = null
	const target = event.target as Element | null
	if (target?.closest('.TqParameterTreeItem .row, [popover], [data-selects-rows]')) return
	selection.value = null
})

// Pasting into a row, as code, whether it was copied as a value or as an expression.
useEventListener(window, 'paste', (event: ClipboardEvent) => {
	if (isInspector.value) return
	const target = event.target as HTMLElement | null
	if (target?.closest?.('input, textarea, [contenteditable]')) return
	const text = event.clipboardData?.getData('text') ?? ''
	// Bindings are more of them, whatever is selected, which is where they go after.
	const rows = pastedRows(
		props.document.root.value,
		props.document.env.value,
		selectedRows().at(-1) ?? null,
		text
	)
	if (rows !== null) {
		event.preventDefault()
		replaceRoot(rows.ast)
		emit('pasted', rows.paths)
		return
	}
	if (selection.value?.paste === undefined) return
	event.preventDefault()
	const next = parseSource(text)
	if (next === null) unsolved.value = 'what is on the clipboard cannot be read as code'
	else selection.value.paste(next)
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (isInspector.value) return
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
		if (!copyRows()) selection.value.evaluate('copy')
	} else if (isMod && event.key.toLowerCase() === 'x') {
		if (selection.value === null || !getSelection()?.isCollapsed) return
		event.preventDefault()
		if (copyRows()) {
			removeRows()
		} else if (selection.value.remove !== undefined) {
			selection.value.evaluate?.('copy')
			selection.value.remove()
		}
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
		if (selection.value !== null) selection.value.editExpression?.()
		else if (props.layers) emit('code')
		else editingEnv.value = true
	} else if (event.key === 'Enter' || event.key === 'F2') {
		if (selection.value?.rename === undefined) return
		event.preventDefault()
		selection.value.rename()
	} else if (event.key === 'Delete' || event.key === 'Backspace') {
		if (selection.value === null) return
		if ((props.alsoSelected?.length ?? 0) > 1) {
			event.preventDefault()
			removeRows()
		} else if (selection.value.remove !== undefined) {
			event.preventDefault()
			selection.value.remove()
		}
	} else if (event.key === 'Escape') {
		selection.value = null
	}
})
</script>

<template>
	<div v-if="isInspector" class="AstEditor" data-selects-rows>
		<ScrollArea class="tree">
			<template v-if="inspected !== null">
				<div class="inspector-header">
					<h3 class="inspector-name">
						{{ inspected.title }}
						<InputButton
							v-if="inspected.parentPath !== ''"
							class="inspector-outer"
							icon="mdi:arrow-up-left"
							subtle
							narrow
							tooltip="What holds this"
							@click="emit('outer', inspected!.parentPath)"
						/>
					</h3>
					<p v-if="inspected.doc !== null" class="inspector-doc">{{ inspected.doc }}</p>
				</div>
				<ParameterTree name="glisp.inspector">
					<AstSlots
						:key="inspect ?? ''"
						:slots="inspected.alone ? [inspected.chain.at(-1)!] : inspected.view.slots"
						:parentPath="inspected.alone ? inspected.parentPath : (inspect ?? '')"
						:missing="inspected.alone ? [] : inspected.view.missing"
						:append="inspected.alone ? null : inspected.view.append"
						:read="document.read"
						:show="show"
						@change="replaceInspected"
					/>
				</ParameterTree>
			</template>
		</ScrollArea>
	</div>
	<div v-else class="AstEditor" :class="{ layers }">
		<div v-if="!layers" class="toolbar">
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
					:tooltip="{ content: 'Edit Expression', shortcut: ['='] }"
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
.inspector-header {
	margin-bottom: var(--tq-gap-control);
	padding-inline: 3px;
}
.inspector-name {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: var(--tq-input-height);
	font-weight: 600;
}
.inspector-outer {
	flex: none;
	width: auto;
}
.inspector-doc {
	line-height: 1.4;
	color: var(--tq-color-text-mute);
}
/* Names alone: the value's column goes, with what resizes it. */
.layers :deep(.TqParameterGrid.grid) {
	grid-template-columns: minmax(0, 1fr) 0;
}
.layers :deep(.TqParameter > .input),
.layers :deep(.resizer) {
	display: none;
}
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
