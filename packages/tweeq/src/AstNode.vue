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
import { actionsOf, fitsInline, kindIconOf, type Slot, sourceOf, viewOf } from './structure'

const props = defineProps<{
	entry: Slot
	path: string
	/** Adds a new one in the gap above this row, among those that can grow. */
	insertBefore?: () => void
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

// What kind of expression it is goes at the end of the label, so that the values
// line up, whatever comes to them.
const referenceTarget = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return bare.kind === 'sym' ? (revealer?.targetOf(props.path) ?? null) : null
})
const kindIcon = computed(() =>
	isFunction.value || props.entry.display !== undefined
		? null
		: (view.value.head?.icon ?? kindIconOf(ast.value, referenceTarget.value !== null))
)
const kindHint = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return bare.kind === 'sym' || bare.kind === 'path'
		? sourceOf(bare)
		: (view.value.title ?? undefined)
})
const kindPressable = computed(
	() => referenceTarget.value !== null || view.value.slots.length > 0
)
function onKind(): void {
	const target = referenceTarget.value
	if (target !== null && revealer) revealer.target.value = { path: target }
	else open.value = !open.value
}

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
				v-if="insertBefore"
				class="gap-add"
				type="button"
				aria-label="Add Here"
				@click.stop="insertBefore"
				@dblclick.stop
				@pointerdown.stop
			>
				<Icon icon="mdi:plus" />
			</button>
			<button
				v-if="pinned"
				v-tooltip="'Unpin'"
				class="end pin"
				type="button"
				aria-label="Unpin"
				@click.stop="togglePin"
				@dblclick.stop
			>
				<Icon icon="mdi:pin" />
			</button>
			<button
				v-if="kindIcon !== null"
				v-tooltip="kindHint"
				class="end kind"
				:class="{ pressable: kindPressable }"
				type="button"
				:disabled="!kindPressable"
				:aria-label="kindHint"
				@click.stop="onKind"
				@dblclick.stop
			>
				<Icon :icon="kindIcon" />
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
/* In the gap above the row, and there when reached for, so it moves nothing. */
.gap-add {
	position: absolute;
	top: calc(var(--tq-gap-related) * -1);
	right: 0;
	left: calc((var(--depth) + 1) * var(--indent));
	z-index: 2;
	height: var(--tq-gap-related);
	cursor: pointer;
	opacity: 0;
	transition: opacity var(--tq-hover-transition-duration);
}
.gap-add:hover,
.gap-add:focus-visible {
	opacity: 1;
}
.gap-add::before {
	content: '';
	position: absolute;
	top: 50%;
	right: 0;
	left: 0;
	height: 1px;
	background: var(--tq-color-accent);
}
.gap-add > * {
	position: absolute;
	top: 50%;
	right: 0;
	width: var(--tq-icon-size);
	height: var(--tq-icon-size);
	border-radius: 50%;
	color: var(--tq-color-on-accent);
	background: var(--tq-color-accent);
	transform: translateY(-50%);
}
.end {
	display: block;
	flex-shrink: 0;
	width: var(--tq-icon-size);
	height: var(--tq-icon-size);
	margin-top: calc((var(--tq-input-height) - var(--tq-icon-size)) / 2);
	/* Together, at the end of the label column, whatever the label's length. */
	margin-left: auto;
	border-radius: var(--tq-radius-input);
}
.end + .end {
	margin-left: 0;
}
.end > * {
	display: block;
	width: 100%;
	height: 100%;
}
.pin {
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.kind {
	color: var(--tq-color-info);
}
.kind.pressable {
	cursor: pointer;
}
.pin:hover,
.kind.pressable:hover {
	background: var(--tq-color-input-hover);
}
</style>
