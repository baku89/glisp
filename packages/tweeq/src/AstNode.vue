<script setup lang="ts">
import type { AST, Diagnostic, Env } from '@glisp/lang'
import type * as monaco from 'monaco-editor'
import { InputCode } from 'tweeq/InputCode'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue'

import AstInline from './AstInline.vue'
import AstSlots from './AstSlots.vue'
import AstValue from './AstValue.vue'
import { iconOf } from './icons'
import { EDITOR_OPTIONS, editOneExpression, GLISP, registerGlisp } from './language'
import { slotMenuItems } from './menu'
import { RENAMER, REVEALER, SELECTION } from './selection'
import { fitsInline, parseSource, type Slot, sourceOf, viewOf } from './structure'

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
const hint = computed(() =>
	props.entry.doc === undefined
		? props.entry.expected?.typeName
		: { title: props.entry.label, description: props.entry.doc }
)

// A binding's name is edited on its label. What a call calls is an expression, so it
// is edited as code, across the row.
const renamable = computed(() => isBinding.value || isFunction.value)
function canRename(name: string): boolean {
	return renamer?.can(props.path, name) ?? false
}
function rename(name: string): void {
	renamer?.apply(props.path, name)
}

registerGlisp()
const functionDraft = ref('')
function onFunctionEditor(editor: monaco.editor.IStandaloneCodeEditor): void {
	editOneExpression(editor, {
		isFinished: () => parseSource(functionDraft.value) !== null,
		cancel() {
			renaming.value = false
		},
		confirm: finishFunction,
	})
}
function finishFunction(): void {
	if (!renaming.value) return
	const next = parseSource(functionDraft.value)
	renaming.value = false
	if (next !== null && sourceOf(next) !== sourceOf(ast.value)) update(next)
}

const revealer = inject(REVEALER, null)
const $item = useTemplateRef<{ scrollIntoView(): void }>('$item')

const bareKind = computed(() =>
	ast.value.kind === 'meta' ? ast.value.expr.kind : ast.value.kind
)

const renamer = inject(RENAMER, null)
const renaming = ref(false)
watch(renaming, on => {
	if (on && isFunction.value) functionDraft.value = sourceOf(ast.value)
})

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
	selection.value = {
		path: props.path,
		...(remove === undefined ? {} : { remove: () => emit('change', remove()) }),
		...(renamable.value ? { rename: () => (renaming.value = true) } : {}),
	}
}

const menuItems = computed<MenuItem[]>(() => [
	...(renamable.value
		? [
				{
					label: isFunction.value ? 'Change Function' : 'Rename',
					icon: 'mdi:rename-outline',
					perform: () => (renaming.value = true),
				},
				{ separator: true as const },
			]
		: []),
	...slotMenuItems(props.entry, parent => emit('change', parent)),
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
		:gapAfter="entry.role === 'subject'"
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
			:entry="entry"
			:path="path"
			:menuItems="menuItems"
			:read="read"
			:show="show"
			@change="emit('change', $event)"
			@toggle="open = !open"
		/>

		<template v-if="isFunction && renaming" #wide>
			<InputCode
				v-model="functionDraft"
				:lang="GLISP"
				:options="EDITOR_OPTIONS"
				@mount="onFunctionEditor"
			/>
		</template>

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
