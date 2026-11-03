<script setup lang="ts">
import { type AST, type Env, UNIT } from '@glisp/lang'
import { Icon } from 'tweeq/Icon'
import { InputCheckbox } from 'tweeq/InputCheckbox'
import { InputDropdown } from 'tweeq/InputDropdown'
import { InputNumber } from 'tweeq/InputNumber'
import { InputString } from 'tweeq/InputString'
import { InputTextBase } from 'tweeq/InputTextBase'
import { Menu, type MenuItem } from 'tweeq/Menu'
import { Parameter } from 'tweeq/ParameterGrid'
import Popover from 'tweeq/Popover/Popover.vue'
import { computed, inject, ref, useTemplateRef, watch } from 'vue'

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
	depth: number
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

// Tweeq's unranged InputNumber decides its decimals from what it last displayed,
// which is nothing at first, so `1.5` first shows as `2`. A step gives it the
// decimals until that is fixed there.
const numberStep = computed(() => {
	const editor = view.value.editor
	if (editor?.kind !== 'number') return undefined
	const decimals = /\.(\d+)$/.exec(String(editor.value))?.[1]?.length ?? 0
	return decimals === 0 ? undefined : 10 ** -decimals
})

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

// The menu on the label.
const $label = useTemplateRef<HTMLElement>('$label')
const menuPosition = ref<[number, number] | null>(null)

function openMenu(event: MouseEvent): void {
	event.preventDefault()
	select()
	if (menuItems.value.length > 0) {
		menuPosition.value = [event.clientX, event.clientY]
	}
}
</script>

<template>
	<Parameter>
		<template #label>
			<span
				ref="$label"
				class="row-label"
				:style="{ '--depth': depth }"
				:title="entry.expected?.typeName"
				@click="select"
				@contextmenu="openMenu"
			>
				<button
					v-if="view.slots.length > 0"
					class="toggle"
					:class="{ open }"
					type="button"
					@click.stop="open = !open"
				>
					<Icon class="chevron" :class="{ collapsed: !open }" icon="mdi:chevron-down" />
				</button>
				<span v-else class="toggle" />
				<Icon v-if="view.icon !== null" class="icon" :icon="view.icon" />
				<span class="name" :class="{ selected }">{{ view.label ?? entry.label }}</span>
				<span v-if="view.label === null && view.title !== null" class="title">
					{{ view.title }}
				</span>
			</span>
			<Popover
				v-if="menuPosition !== null"
				:reference="$label"
				:placement="menuPosition"
				:open="true"
				teleport=".TqViewport"
				@update:open="$event || (menuPosition = null)"
			>
				<Menu :items="menuItems" @close="menuPosition = null" />
			</Popover>
		</template>

		<InputNumber
			v-if="view.editor?.kind === 'number'"
			:modelValue="view.editor.value"
			:step="numberStep"
			@update:modelValue="update(withLiteral(ast, $event))"
		/>
		<InputString
			v-else-if="view.editor?.kind === 'string'"
			:modelValue="view.editor.value"
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
	</Parameter>

	<template v-if="open">
		<AstNode
			v-for="child in view.slots"
			:key="child.key"
			:entry="child"
			:path="`${path}/${child.key}`"
			:depth="depth + 1"
			:read="read"
			:show="show"
			@change="update"
		/>
	</template>
</template>

<style scoped>
.row-label {
	display: flex;
	align-items: center;
	position: relative;
	align-self: stretch;
	padding-left: calc(var(--depth) * var(--tq-icon-size));
	cursor: pointer;
}
/* One line for each level this row is inside, under that level's chevron. */
.row-label::before {
	content: '';
	position: absolute;
	top: calc(-1 * var(--tq-gap-control));
	bottom: 0;
	left: 0;
	width: calc(var(--depth) * var(--tq-icon-size));
	pointer-events: none;
	background: repeating-linear-gradient(
		to right,
		transparent 0 calc(var(--tq-icon-size) / 2),
		var(--tq-color-border) 0 calc(var(--tq-icon-size) / 2 + 1px),
		transparent 0 var(--tq-icon-size)
	);
}
/* The start of that line, from the tip of an open chevron. */
.toggle.open::after {
	content: '';
	position: absolute;
	top: 64%;
	bottom: calc((var(--tq-input-height) - var(--tq-icon-size)) / -2 - var(--tq-gap-control));
	left: 50%;
	width: 1px;
	pointer-events: none;
	background: var(--tq-color-border);
}
.toggle {
	position: relative;
	display: block;
	flex-shrink: 0;
	width: var(--tq-icon-size);
	height: var(--tq-icon-size);
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.chevron {
	display: block;
	width: 100%;
	height: 100%;
	transition: transform var(--tq-hover-transition-duration) ease;
}
.chevron.collapsed {
	transform: rotate(-90deg);
}
.icon {
	flex-shrink: 0;
	width: var(--tq-icon-size);
	height: var(--tq-icon-size);
}
.title {
	margin-left: var(--tq-gap-related);
	color: var(--tq-color-text-subtle);
}
.name {
	border-radius: var(--tq-radius-input);
	padding-inline: 0.25em;
}
.name.selected {
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent);
}
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
