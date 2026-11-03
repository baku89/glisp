<script setup lang="ts">
import { type AST, type Env, UNIT } from '@glisp/lang'
import { InputCheckbox } from 'tweeq/InputCheckbox'
import { InputDropdown } from 'tweeq/InputDropdown'
import { InputNumber } from 'tweeq/InputNumber'
import { InputString } from 'tweeq/InputString'
import { InputTextBase } from 'tweeq/InputTextBase'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject, ref, watch } from 'vue'

import { iconOf } from './icons'
import { SELECTION } from './selection'
import {
	actionsOf,
	hasValue,
	isExpression,
	parseSource,
	type Slot,
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
	) => { value: unknown; diagnostics: ReadonlyArray<{ message: string }> }
	show: (value: unknown, env: Env) => string
}>()

/** A new parent: what this slot's edit makes of the node holding it. */
const emit = defineEmits<{ change: [parent: AST] }>()

const ast = computed(() => props.entry.ast)
const update = (next: AST): void => emit('change', props.entry.replace(next))

const selection = inject(SELECTION)!

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
const problem = computed(() => result.value?.diagnostics[0]?.message ?? null)

/** What the field shows while it is not being edited. */
const shown = computed(() => {
	const value = result.value?.value
	if (result.value === null || typeof value === 'function') {
		return sourceOf(ast.value)
	}
	if (value === UNIT) return '()'
	if (typeof value === 'number') return String(Number(value.toFixed(4)))
	return props.show(value, props.entry.env)
})

const open = ref(false)

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
function onFieldKey(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === 'Escape') {
		if (event.key === 'Escape') draft.value = sourceOf(ast.value)
		;(event.target as HTMLElement).blur()
	}
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

const menuItems = computed<MenuItem[]>(() =>
	actionsOf(props.entry).map(action => ({
		label: action.label,
		perform: () => emit('change', action.apply()),
	}))
)
</script>

<template>
	<ParameterTreeItem
		v-model:open="open"
		:label="view.label ?? entry.label"
		:note="view.label === null ? (view.title ?? undefined) : undefined"
		:icon="icon"
		:hint="entry.expected?.typeName"
		:expandable="view.slots.length > 0"
		:selected="selected"
		:menuItems="menuItems"
		@select="select"
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
		<InputCheckbox
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
		<div
			v-else
			class="field"
			:class="{ expression: isExpression(ast) }"
			:title="problem ?? sourceOf(ast)"
		>
			<InputTextBase
				v-model="draft"
				font="monospace"
				:invalid="problem !== null || parseSource(draft) === null"
				:menuItems="menuItems"
				@blur="commitDraft"
				@keydown="onFieldKey"
			>
				<template #inactiveContent>
					<span class="shown">{{ shown }}</span>
				</template>
			</InputTextBase>
		</div>

		<template #children>
			<AstNode
				v-for="child in view.slots"
				:key="child.key"
				:entry="child"
				:path="`${path}/${child.key}`"
				:read="read"
				:show="show"
				@change="update"
			/>
		</template>
	</ParameterTreeItem>
</template>

<style scoped>
.field {
	display: flex;
	min-width: 0;
}
.field > * {
	flex: 1 1 0;
	min-width: 0;
}
/* As a parameter driven by an expression is in After Effects or Houdini. */
.expression {
	--tq-color-text: var(--tq-color-success);
	--tq-color-input: var(--tq-color-success-soft);
	--tq-color-input-hover: var(--tq-color-success-soft);
}
.field .shown {
	display: block;
	line-height: var(--tq-input-height);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	pointer-events: none;
}
</style>
