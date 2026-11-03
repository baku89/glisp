<script setup lang="ts">
import { type AST, type Diagnostic, type Env, isPinned } from '@glisp/lang'
import { Icon } from 'tweeq/Icon'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue'

import AstCodePopup from './AstCodePopup.vue'
import AstInline from './AstInline.vue'
import AstSlots from './AstSlots.vue'
import AstValue from './AstValue.vue'
import { iconOf } from './icons'
import { editMenuItems, slotMenuItems } from './menu'
import { RENAMER, REVEALER, SELECTION } from './selection'
import { actionsOf, fitsInline, type Slot, viewOf } from './structure'

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

const view = computed(() =>
	viewOf(ast.value, props.entry.env, props.entry.expected)
)

const icon = computed(() =>
	props.entry.role === 'step'
		? 'mdi:arrow-down-thin'
		: (props.entry.icon ??
			iconOf(ast.value, props.entry.env, props.entry.expected) ??
			undefined)
)

const isBinding = computed(() => props.entry.key.startsWith('binding:'))
const isFunction = computed(() => props.entry.role === 'function')

// A function says what it does; anything else, what it is expected to be.
const hint = computed(() => props.entry.doc ?? props.entry.expected?.typeName)

// A binding's name is edited on its label. What a call calls is an expression, so its
// code opens from the row.
const renamable = isBinding
// A row with no field of its own for it, such as these, opens it from itself.
const editingCode = ref(false)
const $anchor = useTemplateRef<HTMLElement>('$anchor')
function editExpression(): void {
	if ($value.value === null) editingCode.value = true
	else $value.value.editExpression()
}
function canRename(name: string): boolean {
	return renamer?.can(props.path, name) ?? false
}
function rename(name: string): void {
	renamer?.apply(props.path, name)
}

const revealer = inject(REVEALER, null)
const $item = useTemplateRef<{ scrollIntoView(): void }>('$item')
const $value = useTemplateRef<{
	editValue: (() => void) | null
	editExpression(): void
}>('$value')

const bareKind = computed(() =>
	ast.value.kind === 'meta' ? ast.value.expr.kind : ast.value.kind
)

const renamer = inject(RENAMER, null)
const renaming = ref(false)

const open = ref(false)

/** A short vector shows its elements on its own row, until it is opened. */
const tree = inject(ParameterTreeContextKey, null)
const fits = (count: number): boolean =>
	fitsInline(count, tree?.valueWidth.value ?? 0)
const inline = computed(
	() => bareKind.value === 'vec' && !open.value && fits(view.value.slots.length)
)

const pinned = computed(() => isPinned(ast.value))
function togglePin(): void {
	const action = actionsOf(props.entry).find(a => a.id === 'pin')
	if (action !== undefined && 'apply' in action) emit('change', action.apply())
}

const children = computed(() =>
	view.value.head === null ? view.value.slots : [view.value.head, ...view.value.slots]
)

const selected = computed(() => selection.value?.path === props.path)

function select(): void {
	const remove = props.entry.remove
	selection.value = {
		path: props.path,
		...(remove === undefined ? {} : { remove: () => emit('change', remove()) }),
		...(renamable.value
			? { rename: () => (renaming.value = true) }
			: isFunction.value
				? { rename: () => (editingCode.value = true) }
				: {}),
		editValue: () => $value.value?.editValue?.(),
		editExpression,
		evaluate(id) {
			const action = actionsOf(props.entry).find(a => a.id === id)
			if (action === undefined) return
			if ('apply' in action) emit('change', action.apply())
			else void navigator.clipboard.writeText(action.copy())
		},
	}
}

const slotMenu = computed(() =>
	slotMenuItems(props.entry, (parent, action) => {
		if (action.opens) open.value = true
		emit('change', parent)
	})
)

// What the value's own field offers by itself, and the row offers on its behalf.
const menuItems = computed<MenuItem[]>(() => [
	...(isFunction.value
		? []
		: editMenuItems($value.value?.editValue ?? null, editExpression)),
	...(renamable.value || isFunction.value
		? [
				{
					label: isFunction.value ? 'Change Function' : 'Rename',
					icon: 'mdi:rename-outline',
					bindIcon: ['↵'],
					perform: () =>
						isFunction.value
							? (editingCode.value = true)
							: (renaming.value = true),
				},
				{ separator: true as const },
			]
		: []),
	...slotMenu.value,
])

// A reference leads to what it refers to: rows on the way open, and it is selected.
watch(
	() => revealer?.target.value ?? null,
	target => {
		if (target === null) return
		if (target.path.startsWith(`${props.path}/`)) open.value = true
		if (target.path !== props.path) return
		select()
		if (target.rename) renaming.value = true
		revealer!.target.value = null
		void nextTick(() => $item.value?.scrollIntoView())
	},
	{ immediate: true }
)
</script>

<template>
	<ParameterTreeItem
		ref="$item"
		v-model:open="open"
		:label="view.label ?? entry.label"
		:icon="icon"
		:hint="hint"
		:expandable="
			children.length > 0 || view.append !== null || view.missing.length > 0
		"
		:renamable="renamable"
		:emphasized="isFunction"
		:sortHandle="entry.sort !== undefined"
		:dragId="isBinding ? path : undefined"
		v-model:renaming="renaming"
		:labelSource="entry.label"
		:canRename="canRename"
		@rename="rename"
		:selected="selected"
		:closedGuide="bareKind === 'call'"
		:menuItems="menuItems"
		@select="select"
		@nameClick="isFunction && (editingCode = true)"
	>
		<div v-if="inline" ref="$anchor" class="inline">
			<AstInline
				:slots="view.slots"
				:parentPath="path"
				:read="read"
				:show="show"
				@change="update"
			/>
		</div>
		<AstValue
			v-else-if="!isFunction"
			ref="$value"
			:entry="entry"
			:path="path"
			:menuItems="slotMenu"
			:read="read"
			:show="show"
			@change="emit('change', $event)"
			@toggle="open = !open"
		/>
		<div v-else ref="$anchor" />
		<AstCodePopup
			v-if="editingCode"
			:reference="$anchor"
			:ast="ast"
			@change="update"
			@close="editingCode = false"
		/>

		<template #labelEnd>
			<button
				v-if="pinned"
				v-tooltip="'Unpin'"
				class="pin"
				type="button"
				aria-label="Unpin"
				@click.stop="togglePin"
				@dblclick.stop
			>
				<Icon icon="mdi:pin" />
			</button>
		</template>

		<template #children>
			<AstSlots
				:slots="children"
				:parentPath="path"
				:missing="view.missing"
				:append="view.append"
				:read="read"
				:show="show"
				@change="update"
			/>
		</template>
	</ParameterTreeItem>
</template>

<style scoped>
.inline {
	display: grid;
	min-width: 0;
}
.pin {
	display: block;
	flex-shrink: 0;
	width: var(--tq-icon-size);
	height: var(--tq-icon-size);
	margin-top: calc((var(--tq-input-height) - var(--tq-icon-size)) / 2);
	margin-left: auto;
	border-radius: var(--tq-radius-input);
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.pin > * {
	display: block;
	width: 100%;
	height: 100%;
}
.pin:hover {
	color: var(--tq-color-text);
	background: var(--tq-color-input-hover);
}
</style>
