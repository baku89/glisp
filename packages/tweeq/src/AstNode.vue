<script setup lang="ts">
import { type AST, type Diagnostic, type Env, UNIT } from '@glisp/lang'
import { InputButton } from 'tweeq/InputButton'
import { InputDropdown } from 'tweeq/InputDropdown'
import { InputNumber } from 'tweeq/InputNumber'
import * as monaco from 'monaco-editor'
import { InputCode } from 'tweeq/InputCode'
import { InputString } from 'tweeq/InputString'
import { InputSwitch } from 'tweeq/InputSwitch'
import { InputTextBase } from 'tweeq/InputTextBase'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject, ref, watch } from 'vue'

import { iconOf } from './icons'
import { EDITOR_OPTIONS, GLISP, registerGlisp } from './language'
import { SELECTION } from './selection'
import {
	actionsOf,
	hasValue,
	isExpression,
	parseSource,
	problemOf,
	type Slot,
	type SlotAction,
	sourceOf,
	viewOf,
	withLiteral,
} from './structure'

const props = defineProps<{
	entry: Slot
	path: string
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
}>()

/** A new parent: what this slot's edit makes of the node holding it. */
const emit = defineEmits<{ change: [parent: AST] }>()

const ast = computed(() => props.entry.ast)
const update = (next: AST): void => emit('change', props.entry.replace(next))

const selection = inject(SELECTION)!

registerGlisp()

const view = computed(() =>
	viewOf(ast.value, props.entry.env, props.entry.expected)
)

const icon = computed(
	() => iconOf(ast.value, props.entry.env, props.entry.expected) ?? undefined
)

const result = computed(() =>
	view.value.editor !== null || !hasValue(ast.value)
		? null
		: props.read(ast.value, props.entry.env)
)
const problem = computed(() =>
	problemOf(ast.value, props.entry.env, props.entry.expected, props.read)
)

/** What the field shows while it is not being edited. */
const shown = computed(() => {
	if (props.entry.display !== undefined) return props.entry.display
	const value = result.value?.value
	if (result.value === null || typeof value === 'function') {
		return sourceOf(ast.value)
	}
	if (value === UNIT) return '()'
	if (typeof value === 'number') return String(Number(value.toFixed(4)))
	return props.show(value, props.entry.env)
})

const open = ref(false)

/** What can be added here, as new rows at the end of it. */
const additions = computed(() => [
	...view.value.missing.map(({ name, add }) => ({ label: name, add })),
	...(view.value.append === null ? [] : [view.value.append]),
])

const children = computed(() =>
	view.value.head === null ? view.value.slots : [view.value.head, ...view.value.slots]
)

// The field holds the source while it has focus.
const draft = ref(sourceOf(ast.value))
watch(ast, next => {
	draft.value = sourceOf(next)
})
function commitDraft(): void {
	const next = parseSource(draft.value)
	if (next === null) draft.value = sourceOf(ast.value)
	else if (sourceOf(next) !== sourceOf(ast.value)) update(next)
}
// An expression shows its value, and becomes code to edit when clicked. Only the
// one being edited has an editor, so that a long program stays light.
const editing = ref(false)

function onEditorMount(editor: monaco.editor.IStandaloneCodeEditor): void {
	const range = editor.getModel()?.getFullModelRange()
	if (range !== undefined) editor.setSelection(range)
	editor.focus()
	editor.onDidBlurEditorWidget(finishEditing)
	editor.onKeyDown(event => {
		if (event.keyCode === monaco.KeyCode.Escape) {
			draft.value = sourceOf(ast.value)
		} else if (
			event.keyCode !== monaco.KeyCode.Enter ||
			event.shiftKey ||
			// An unfinished form goes on to the next line.
			parseSource(draft.value) === null
		) {
			return
		}
		event.preventDefault()
		event.stopPropagation()
		finishEditing()
	})
}

function finishEditing(): void {
	if (!editing.value) return
	editing.value = false
	commitDraft()
}

const label = (value: unknown): string =>
	typeof value === 'string' ? value : String(value)

const selected = computed(() => selection.value?.path === props.path)

function select(): void {
	const remove = props.entry.remove
	selection.value = {
		path: props.path,
		...(remove === undefined ? {} : { remove: () => emit('change', remove()) }),
	}
}

const menuItems = computed<MenuItem[]>(() => {
	const items: MenuItem[] = []
	let group: SlotAction['group'] | null = null
	for (const action of actionsOf(props.entry)) {
		if (group !== null && group !== action.group) items.push({ separator: true })
		group = action.group
		items.push({
			label: action.label,
			icon: action.icon,
			perform: () => {
				if ('apply' in action) emit('change', action.apply())
				else void navigator.clipboard.writeText(action.copy())
			},
		})
	}
	return items
})
</script>

<template>
	<ParameterTreeItem
		v-model:open="open"
		:label="view.label ?? entry.label"
		:icon="icon"
		:hint="entry.expected?.typeName"
		:expandable="children.length > 0 || additions.length > 0"
		:sortGroup="entry.sort === undefined ? undefined : path.slice(0, path.lastIndexOf('/'))"
		:sortIndex="entry.sort?.index"
		:selected="selected"
		:menuItems="menuItems"
		@select="select"
		@sort="(from, to) => entry.sort && emit('change', entry.sort.move(from, to))"
	>
		<div
			class="value"
			:class="{
				expression: isExpression(ast),
				error: problem !== null || parseSource(draft) === null,
			}"
			:title="problem ?? sourceOf(ast)"
		>
			<InputNumber
				v-if="view.editor?.kind === 'number'"
				:modelValue="view.editor.value"
				:menuItems="menuItems"
				@update:modelValue="update(withLiteral(ast, $event))"
			/>
			<InputString
				v-else-if="view.editor?.kind === 'string'"
				:modelValue="view.editor.value"
				:menuItems="menuItems"
				@update:modelValue="update(withLiteral(ast, $event))"
			/>
			<InputSwitch
				v-else-if="view.editor?.kind === 'boolean'"
				:modelValue="view.editor.value"
				@update:modelValue="update(withLiteral(ast, $event))"
			/>
			<InputDropdown
				v-else-if="view.editor?.kind === 'enum'"
				:modelValue="view.editor.value"
				:options="[...view.editor.options]"
				:labelizer="label"
				@update:modelValue="update(withLiteral(ast, $event as never))"
			/>
			<InputCode
				v-else-if="editing"
				v-model="draft"
				:lang="GLISP"
				:options="EDITOR_OPTIONS"
				@mount="onEditorMount"
			/>
			<InputTextBase
				v-else
				:modelValue="draft"
				font="monospace"
				ignoreInput
				:menuItems="menuItems"
				@click="editing = true"
				@focus="editing = true"
			>
				<template #inactiveContent>
					<span class="shown">{{ shown }}</span>
				</template>
			</InputTextBase>
		</div>

		<template #children>
			<AstNode
				v-for="child in children"
				:key="child.key"
				:entry="child"
				:path="`${path}/${child.key}`"
				:read="read"
				:show="show"
				@change="update"
			/>
			<ParameterTreeItem
				v-for="addition in additions"
				:key="`add:${addition.label}`"
				label=""
			>
				<InputButton
					class="add"
					subtle
					icon="mdi:plus"
					:label="addition.label"
					@click="update(addition.add())"
				/>
			</ParameterTreeItem>
		</template>
	</ParameterTreeItem>
</template>

<style scoped>
.value {
	display: grid;
	min-width: 0;
}
/* As a parameter driven by an expression is in After Effects or Houdini. */
.expression {
	--tq-color-text: var(--tq-color-success);
	--tq-color-input: var(--tq-color-success-soft);
	--tq-color-input-hover: var(--tq-color-success-soft);
}
.value.error {
	--tq-color-text: var(--tq-color-error);
	--tq-color-input: var(--tq-color-error-soft);
	--tq-color-input-hover: var(--tq-color-error-soft);
}
.value :deep(.TqInputTextBase) {
	cursor: text;
}
.add {
	justify-self: start;
}
.value .shown {
	display: block;
	line-height: var(--tq-input-height);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	pointer-events: none;
}
</style>
