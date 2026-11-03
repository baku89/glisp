<script setup lang="ts">
import { type AST, type Diagnostic, type Env, UNIT } from '@glisp/lang'
import type * as monaco from 'monaco-editor'
import { InputCode } from 'tweeq/InputCode'
import { InputDropdown } from 'tweeq/InputDropdown'
import { InputNumber } from 'tweeq/InputNumber'
import { InputString } from 'tweeq/InputString'
import { InputSwitch } from 'tweeq/InputSwitch'
import { InputTextBase } from 'tweeq/InputTextBase'
import { type MenuItem } from 'tweeq/Menu'
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue'

import { EDITOR_OPTIONS, editOneExpression, GLISP, registerGlisp } from './language'
import { editMenuItems } from './menu'
import { REVEALER, SOLVER } from './selection'
import {
	canSolve,
	expressionFromField,
	hasValue,
	isExpression,
	kindIconOf,
	numberOptionsAt,
	parseSource,
	problemOf,
	type Slot,
	sourceOf,
	viewOf,
	withLiteral,
} from './structure'

type InputPosition = 'start' | 'middle' | 'end'

const props = defineProps<{
	entry: Slot
	path: string
	menuItems: MenuItem[]
	/** Where it is in a row of them, which also leaves no room for an icon. */
	inlinePosition?: InputPosition
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
}>()

const emit = defineEmits<{
	/** A new parent: what this slot's edit makes of the node holding it. */
	change: [parent: AST]
	/** The kind icon was pressed, on what opens rather than leads somewhere. */
	toggle: []
}>()

registerGlisp()

const ast = computed(() => props.entry.ast)
const update = (next: AST): void => emit('change', props.entry.replace(next))

const view = computed(() =>
	viewOf(ast.value, props.entry.env, props.entry.expected)
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
	if (typeof value === 'string') return value
	return props.show(value, props.entry.env)
})

// A step is called and not a value, and looks like it: an outline, not a fill.
const isCallee = computed(() => props.entry.role === 'step')

/** What a pipe has come to by the end of this step. */
const upToNow = computed(() => {
	const { upTo, env } = props.entry
	if (upTo === undefined) return null
	const { value } = props.read(upTo, env)
	if (value === UNIT) return '()'
	return typeof value === 'number'
		? String(Number(value.toFixed(4)))
		: props.show(value, env)
})

// What comes to a number or a string looks like one, as a literal does.
const isNumber = computed(
	() => typeof result.value?.value === 'number' && props.entry.display === undefined
)
const isString = computed(
	() => typeof result.value?.value === 'string' && props.entry.display === undefined
)

// The node's own say goes first, over what its parameter's type says.
const numberOptions = computed(() => numberOptionsAt(props.entry))

const revealer = inject(REVEALER, null)

const iconTarget = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return bare.kind === 'sym' ? (revealer?.targetOf(props.path) ?? null) : null
})
const kindIcon = computed(() =>
	props.entry.display === undefined && props.inlinePosition === undefined
		? (view.value.head?.icon ??
				kindIconOf(ast.value, iconTarget.value !== null) ??
				undefined)
		: undefined
)

function onKindIcon(): void {
	const target = iconTarget.value
	if (target !== null && revealer) revealer.target.value = { path: target }
	else emit('toggle')
}

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
	editOneExpression(editor, {
		caretAtEnd: startedByTyping,
		// With nothing written, there is nothing to go on with.
		isFinished: () => draft.value.trim() === '' || parseSource(draft.value) !== null,
		cancel() {
			draft.value = sourceOf(ast.value)
			editing.value = false
			startedByTyping = false
		},
		confirm: finishEditing,
	})
}

// Typing `=` first in a number or the like turns it into an expression, as in a
// spreadsheet. A string can begin with `=`, so it stays a string.
let startedByTyping = false

function onFieldKey(event: KeyboardEvent): void {
	const { kind } = view.value.editor ?? {}
	if (
		event.key !== '=' ||
		event.isComposing ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey ||
		(kind !== 'number' && kind !== 'boolean' && kind !== 'enum' && !solvable.value)
	) {
		return
	}
	const target = event.target as HTMLElement
	if (solvable.value) {
		event.preventDefault()
		event.stopPropagation()
		target.blur()
		editExpression()
		return
	}
	const isText =
		target instanceof HTMLInputElement && target.type === 'text'
	const start = expressionFromField(isText ? target : null)
	if (start === null) return
	event.preventDefault()
	event.stopPropagation()
	target.blur()
	startedByTyping = true
	draft.value = start
	editing.value = true
}

function finishEditing(): void {
	if (!editing.value) return
	editing.value = false
	startedByTyping = false
	commitDraft()
}

// What comes out of an expression is a number like any other. Editing it changes
// what it comes from, and what it is written as is gone into on purpose.
const solver = inject(SOLVER, null)
const solvable = computed(
	() => solver !== null && canSolve(props.entry, result.value?.value)
)
const hasNumber = computed(
	() => view.value.editor?.kind === 'number' || solvable.value
)

const $root = useTemplateRef<HTMLElement>('$root')

function editValue(): void {
	// After a menu has closed, which gives the focus back to where it was.
	void nextTick(() => $root.value?.querySelector('input')?.select())
}

function editExpression(): void {
	draft.value = sourceOf(ast.value)
	startedByTyping = false
	editing.value = true
}

const editItems = computed(() =>
	editMenuItems(hasNumber.value ? editValue : null, editExpression)
)
const fieldMenu = computed<MenuItem[]>(() => [...editItems.value, ...props.menuItems])

defineExpose({
	editValue: computed(() => (hasNumber.value ? editValue : null)),
	editExpression,
})

const label = (value: unknown): string =>
	typeof value === 'string' ? value : String(value)
</script>

<template>
	<div
		ref="$root"
		class="value"
		:class="{
			expression: !editing && !isCallee && isExpression(ast),
			callee: !editing && isCallee,
			error:
				(draft.trim() !== '' && parseSource(draft) === null) ||
				(!editing && problem !== null),
		}"
		:title="problem ?? sourceOf(ast)"
		@keydown.capture="onFieldKey"
	>
		<InputCode
			v-if="editing"
			v-model="draft"
			:lang="GLISP"
			:options="EDITOR_OPTIONS"
			@mount="onEditorMount"
		/>
		<InputNumber
			v-else-if="view.editor?.kind === 'number'"
			v-bind="numberOptions"
			:modelValue="view.editor.value"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			@update:modelValue="update(withLiteral(ast, $event))"
		/>
		<InputNumber
			v-else-if="solvable"
			v-bind="numberOptions"
			:modelValue="result?.value as number"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			:rightIcon="kindIcon"
			:rightIconPressable="iconTarget !== null || view.slots.length > 0"
			@rightIconClick="onKindIcon"
			@update:modelValue="solver?.solve(ast, $event)"
		/>
		<InputString
			v-else-if="view.editor?.kind === 'string'"
			:modelValue="view.editor.value"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
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
		<InputTextBase
			v-else
			:modelValue="draft"
			:font="isNumber ? 'numeric' : isString ? undefined : 'monospace'"
			:align="isNumber ? 'center' : undefined"
			:inlinePosition="inlinePosition"
			ignoreInput
			:rightIcon="kindIcon"
			:rightIconPressable="iconTarget !== null || view.slots.length > 0"
			:menuItems="fieldMenu"
			@rightIconClick="onKindIcon"
			@click="editing = true"
			@focus="editing = true"
		>
			<template #inactiveContent>
				<span class="shown">{{ shown }}</span>
				<span v-if="upToNow !== null" class="up-to-now">{{ upToNow }}</span>
			</template>
		</InputTextBase>
	</div>
</template>

<style scoped>
.value {
	display: grid;
	min-width: 0;
}
/* As a parameter driven by an expression is in After Effects or Houdini. */
.expression {
	--tq-color-text: var(--tq-color-info);
	--tq-color-input: var(--tq-color-info-soft);
	--tq-color-input-hover: var(--tq-color-info-soft);
}
.callee :deep(.TqInputTextBase) {
	background: transparent;
	box-shadow: inset 0 0 0 1px var(--tq-color-border);
}
.callee :deep(.TqInputTextBase:hover) {
	background: var(--tq-color-input-hover);
}
.value.error {
	--tq-color-text: var(--tq-color-error);
	--tq-color-input: var(--tq-color-error-soft);
	--tq-color-input-hover: var(--tq-color-error-soft);
}
.value :deep(.TqInputTextBase:not(.TqInputNumber)) {
	cursor: text;
}
.up-to-now {
	position: absolute;
	top: 0;
	right: 0;
	max-width: 50%;
	overflow: hidden;
	line-height: var(--tq-input-height);
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--tq-color-text-mute);
	pointer-events: none;
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
