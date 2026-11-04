<script setup lang="ts">
import { type AST, type Diagnostic, type Env, isHidden, isPinned, MetaAST, readByName } from '@glisp/lang'
import { Icon } from 'tweeq/Icon'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, inject, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'

import AstCodePopup from './AstCodePopup.vue'
import AstGapAdd from './AstGapAdd.vue'
import AstInline from './AstInline.vue'
import AstSlots from './AstSlots.vue'
import AstValue from './AstValue.vue'
import { iconOf } from './icons'
import { editMenuItems, slotMenuItems } from './menu'
import { LINKER, RENAMER, REVEALER, SELECTION, VALUE_ICON } from './selection'
import {
	actionsOf,
	fitsInline,
	kindIconOf,
	parseSource,
	type Slot,
	sourceOf,
	viewOf,
} from './structure'

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

const iconOfValue = inject(VALUE_ICON, null)
const icon = computed(() =>
	props.entry.role === 'step'
		? 'mdi:arrow-down-thin'
		: (props.entry.icon ??
			iconOfValue?.(props.read(readByName(ast.value), props.entry.env).value) ??
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
		: (view.value.head?.icon ?? kindIconOf(ast.value))
)
const kindHint = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return bare.kind === 'sym' || bare.kind === 'path'
		? sourceOf(bare)
		: (view.value.title ?? undefined)
})
const expandable = computed(
	() =>
		children.value.length > 0 ||
		view.value.append !== null ||
		view.value.missing.length > 0
)
const kindPressable = computed(() => referenceTarget.value !== null || expandable.value)

// A reference can be pulled out to another row, like After Effects' pick whip.
const linker = inject(LINKER, null)
const isReference = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return (bare.kind === 'sym' || bare.kind === 'path') && linker !== null
})
const whip = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
let whipped = false
let hovered: Element | null = null
let hoveredField: Element | null = null
let endWhip: (() => void) | null = null
onBeforeUnmount(() => endWhip?.())

// Stopping on a closed row opens it, so that what is inside can be reached.
const OPEN_ON_HOVER_MS = 500
let hoveredRow: Element | null = null
let openTimer: ReturnType<typeof setTimeout> | undefined

function openOnHover(row: Element | null): void {
	if (row === hoveredRow) return
	hoveredRow = row
	clearTimeout(openTimer)
	const toggle = row?.querySelector<HTMLElement>('.row:not(.open) > button.toggle')
	if (toggle) openTimer = setTimeout(() => toggle.click(), OPEN_ON_HOVER_MS)
}

function setHovered(target: Element | null): void {
	hovered?.classList.remove('drop-target', 'link-target')
	hoveredField?.classList.remove('link-target')
	hovered = target
	const isRow = hovered?.classList.contains('TqParameterTreeItem') ?? false
	hovered?.classList.add(isRow ? 'drop-target' : 'link-target')
	// A row's own field says so as well, as the elements beside others do.
	const path = isRow ? hovered?.querySelector('.row .row-path')?.getAttribute('data-path') : null
	hoveredField =
		path == null
			? null
			: (hovered?.querySelector(`.value[data-path="${CSS.escape(path)}"]`) ?? null)
	hoveredField?.classList.add('link-target')
}

/**
 * What is under the pointer that this could refer to, and where it is: an element
 * side by side with others in its row, if on one, or else the row.
 */
function linkableAt(x: number, y: number): { row: Element; path: string } | null {
	const under = window.document.elementFromPoint(x, y)
	const row = under?.closest('.TqParameterTreeItem')
	const rowPath = row?.querySelector('.row .row-path')?.getAttribute('data-path')
	const field = under?.closest('.value[data-path]')
	const fieldPath = field?.getAttribute('data-path')
	if (field && fieldPath != null && fieldPath !== rowPath && linker?.can(props.path, fieldPath)) {
		return { row: field, path: fieldPath }
	}
	if (!row || rowPath == null || !linker?.can(props.path, rowPath)) return null
	return { row, path: rowPath }
}

function onKindPress(event: PointerEvent): void {
	if (!isReference.value || event.button !== 0) return
	event.preventDefault()
	const icon = (event.currentTarget as Element).getBoundingClientRect()
	const [x1, y1] = [icon.left + icon.width / 2, icon.top + icon.height / 2]
	const [startX, startY] = [event.clientX, event.clientY]
	whipped = false

	const onMove = (move: PointerEvent) => {
		if (!whipped && Math.hypot(move.clientX - startX, move.clientY - startY) < 4) return
		whipped = true
		window.document.body.classList.add('glisp-linking')
		whip.value = { x1, y1, x2: move.clientX, y2: move.clientY }
		setHovered(linkableAt(move.clientX, move.clientY)?.row ?? null)
		openOnHover(
			window.document
				.elementFromPoint(move.clientX, move.clientY)
				?.closest('.TqParameterTreeItem') ?? null
		)
	}
	const onUp = (up: PointerEvent) => {
		const landed = whipped ? linkableAt(up.clientX, up.clientY) : null
		endWhip?.()
		if (landed) linker?.link(props.path, landed.path)
	}
	const onKey = (key: KeyboardEvent) => {
		if (key.key === 'Escape') endWhip?.()
	}
	endWhip = () => {
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('keydown', onKey)
		setHovered(null)
		openOnHover(null)
		window.document.body.classList.remove('glisp-linking')
		whip.value = null
		endWhip = null
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('keydown', onKey)
}

function onKind(): void {
	// Letting go of a pull is a click, too.
	if (whipped) {
		whipped = false
		return
	}
	const target = referenceTarget.value
	if (target !== null && revealer) revealer.target.value = { path: target }
	else if (expandable.value) open.value = !open.value
}

const pinned = computed(() => isPinned(ast.value))
const hidden = computed(() => isHidden(ast.value))
function toggle(id: 'pin' | 'hide'): void {
	const action = actionsOf(props.entry).find(a => a.id === id)
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
		paste,
		evaluate(id) {
			const action = actionsOf(props.entry).find(a => a.id === id)
			if (action === undefined) return
			if ('apply' in action) emit('change', action.apply())
			else void navigator.clipboard.writeText(action.copy())
		},
	}
}

/** Put `next` in place of what is here, leaving what is said about it. */
function paste(next: AST): void {
	update(ast.value.kind === 'meta' ? new MetaAST(ast.value.metadata, next) : next)
}

async function pasteFromClipboard(): Promise<void> {
	const next = parseSource(await navigator.clipboard.readText())
	if (next !== null) paste(next)
}

// As Houdini copies a parameter, to paste as a reference to it.
const referenceItems = computed<MenuItem[]>(() => {
	if (linker === null || isFunction.value) return []
	const copied = linker.copied.value
	return [
		{
			label: 'Paste',
			icon: 'mdi:clipboard-text-outline',
			bindIcon: ['⌘', 'V'],
			perform: () => void pasteFromClipboard(),
		},
		{
			label: 'Copy Reference',
			icon: 'mdi:link-variant',
			perform: () => (linker.copied.value = props.path),
		},
		...(copied !== null && linker.can(props.path, copied)
			? [
					{
						label: 'Paste Reference',
						icon: 'mdi:link-variant-plus',
						perform: () => linker.link(props.path, copied),
					},
				]
			: []),
	]
})

const slotMenu = computed(() => {
	const items = slotMenuItems(props.entry, (parent, action) => {
		if (action.opens) open.value = true
		emit('change', parent)
	})
	// With the other copies, ahead of what deletes it, if anything does.
	const end = items.findIndex(item => 'label' in item && item.label === 'Delete')
	items.splice(end < 0 ? items.length : end - 1, 0, ...referenceItems.value)
	return items
})

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
		:expandable="expandable"
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
		<div v-if="inline" ref="$anchor" class="inline-anchor">
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
			<span class="row-path" :data-path="path" hidden />
			<AstGapAdd v-if="insertBefore" @add="insertBefore" />
			<button
				v-if="pinned"
				v-tooltip="'Unpin'"
				class="end pin"
				type="button"
				aria-label="Unpin"
				@click.stop="toggle('pin')"
				@dblclick.stop
			>
				<Icon icon="mdi:pin" />
			</button>
			<button
				v-if="hidden"
				v-tooltip="'Show'"
				class="end pin"
				type="button"
				aria-label="Show"
				@click.stop="toggle('hide')"
				@dblclick.stop
			>
				<Icon icon="mdi:eye-off-outline" />
			</button>
			<button
				v-if="kindIcon !== null"
				v-tooltip="kindHint"
				class="end kind"
				:class="{ pressable: kindPressable || isReference, reference: isReference }"
				type="button"
				:disabled="!kindPressable && !isReference"
				:aria-label="kindHint"
				@pointerdown="onKindPress"
				@click.stop="onKind"
				@dblclick.stop
			>
				<Icon :icon="kindIcon" />
			</button>
		</template>

		<Teleport v-if="whip" to=".TqViewport">
			<svg class="whip">
				<line :x1="whip.x1" :y1="whip.y1" :x2="whip.x2" :y2="whip.y2" />
				<circle :cx="whip.x2" :cy="whip.y2" r="3" />
			</svg>
		</Teleport>

		<template #children>
			<AstSlots
				:slots="children"
				:parentPath="path"
				:missing="view.missing"
				:append="view.append"
				:noAddRow="bareKind === 'let' && view.slots.length > 0"
				:read="read"
				:show="show"
				@change="update"
			/>
		</template>
	</ParameterTreeItem>
</template>

<style scoped>
.inline-anchor {
	display: grid;
	min-width: 0;
}
.whip {
	position: fixed;
	inset: 0;
	z-index: 20;
	width: 100%;
	height: 100%;
	pointer-events: none;
}
.whip line {
	stroke: var(--tq-color-info);
	stroke-width: 1.5;
}
.whip circle {
	fill: var(--tq-color-info);
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
/* A name for something else, and not what this row does: a filled mark. */
.kind.reference {
	border-radius: 50%;
	color: var(--tq-color-background);
	background: var(--tq-color-info);
	transform: scale(0.78);
}
.pin:hover,
.kind.pressable:not(.reference):hover {
	background: var(--tq-color-input-hover);
}
.kind.reference:hover {
	opacity: 0.8;
}
</style>
