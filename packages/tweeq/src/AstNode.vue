<script setup lang="ts">
import { type AST, type Diagnostic, type Env, isPinned } from '@glisp/lang'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
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
		: isPinned(ast.value)
			? 'mdi:pin'
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
const editingFunction = ref(false)
const $functionAnchor = useTemplateRef<HTMLElement>('$functionAnchor')
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

/** What the + adds: the next thing missing, or else one more. */
const addition = computed(() => {
	const [missing] = view.value.missing
	return missing === undefined
		? view.value.append
		: { label: missing.name, add: missing.add }
})

function add(): void {
	const next = addition.value
	if (next === null) return
	// A vector that is still short shows the new one where it is.
	const grows = bareKind.value === 'vec' && fits(view.value.slots.length + 1)
	if (!grows) open.value = true
	update(next.add())
	// A new binding has only a placeholder for a name.
	const key = 'key' in next ? next.key : undefined
	if (key !== undefined && revealer) {
		revealer.target.value = { path: `${props.path}/${key}`, rename: true }
	}
}

const children = computed(() =>
	view.value.head === null ? view.value.slots : [view.value.head, ...view.value.slots]
)

const selected = computed(() => selection.value?.path === props.path)

function select(): void {
	const remove = props.entry.remove
	if (isFunction.value) editingFunction.value = true
	selection.value = {
		path: props.path,
		...(remove === undefined ? {} : { remove: () => emit('change', remove()) }),
		...(renamable.value
			? { rename: () => (renaming.value = true) }
			: isFunction.value
				? { rename: () => (editingFunction.value = true) }
				: {}),
		editValue: () => $value.value?.editValue?.(),
		editExpression: () => $value.value?.editExpression(),
		evaluate(id) {
			const action = actionsOf(props.entry).find(a => a.id === id)
			if (action !== undefined && 'apply' in action) emit('change', action.apply())
		},
	}
}

const slotMenu = computed(() =>
	slotMenuItems(props.entry, parent => emit('change', parent))
)

// What the value's own field offers by itself, and the row offers on its behalf.
const menuItems = computed<MenuItem[]>(() => [
	...($value.value === null
		? []
		: editMenuItems($value.value.editValue, () => $value.value?.editExpression())),
	...(renamable.value || isFunction.value
		? [
				{
					label: isFunction.value ? 'Change Function' : 'Rename',
					icon: 'mdi:rename-outline',
					perform: () =>
						isFunction.value
							? (editingFunction.value = true)
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
		:expandable="children.length > 0"
		:addLabel="addition === null ? undefined : `Add ${addition.label}`"
		:renamable="renamable"
		:emphasized="isFunction"
		@add="add"
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
	>
		<AstInline
			v-if="inline"
			:slots="view.slots"
			:parentPath="path"
			:read="read"
			:show="show"
			@change="update"
		/>
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
		<div v-else ref="$functionAnchor" />
		<AstCodePopup
			v-if="editingFunction"
			:reference="$functionAnchor"
			:ast="ast"
			@change="update"
			@close="editingFunction = false"
		/>

		<template #children>
			<AstSlots
				:slots="children"
				:parentPath="path"
				:sequence="bareKind === 'call' ? (view.append ?? undefined) : undefined"
				:read="read"
				:show="show"
				@change="update"
			/>
		</template>
	</ParameterTreeItem>
</template>
