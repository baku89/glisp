<script setup lang="ts">
import { type AST, type Diagnostic, type Env, isHidden, isPinned, MetaAST, readByName } from '@glisp/lang'
import { Icon } from 'tweeq/Icon'
import { InputTranslate } from 'tweeq/InputTranslate'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, inject, nextTick, onBeforeUnmount, provide, ref, useTemplateRef, watch } from 'vue'

import AstCodePopup from './AstCodePopup.vue'
import AstGapAdd from './AstGapAdd.vue'
import AstInline from './AstInline.vue'
import AstSlots from './AstSlots.vue'
import AstValue from './AstValue.vue'
import { iconOf } from './icons'
import { editMenuItems, referenceMenuItems, slotMenuItems, withCopyItems } from './menu'
import {
	COMMANDS_FOR,
	HOST_KEY, ALSO_SELECTED, LINKER, OPEN_ROW, RATIO_KEEPER, RENAMER, REVEALER, SELECTION, SOLVER, TITLED, VALUE_ICON } from './selection'
import {
	actionsOf,
	canSolve,
	elementAt,
	canStack,
	numbersFit,
	type NumbersFit,
	isProportional,
	isSizeInput,
	keepingRatio,
	type KeptRatio,
	problemOf,
	titleOf,
	isTranslatable,
	kindIconOf,
	type Slot,
	sourceOf,
	viewOf,
	withProportional,
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
/** What is wrong with what it comes to, which shows on the row as well as on its value. */
const problem = computed(() =>
	isFunction.value
		? null
		: problemOf(ast.value, props.entry.env, props.entry.expected, props.read)
)
const hint = computed(
	() => problem.value ?? props.entry.doc ?? props.entry.expected?.typeName
)

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

const open = ref(inject(OPEN_ROW, null)?.() === props.path)

/** A short vector shows its elements on its own row, until it is opened. */
const tree = inject(ParameterTreeContextKey, null)
/** A point's pad, to take it by, and what is left beside it for its numbers. */
const translatable = computed(
	() => isTranslatable(props.entry.expected) && Array.isArray(placeValue.value)
)
const placeValue = computed(
	() => props.read(readByName(ast.value), props.entry.env).value
)
const PAD_WIDTH = 26
const solver = inject(SOLVER, null)
const titled = inject(TITLED, false)
const roomFor = (count: number): NumbersFit =>
	numbersFit(count, Math.max(0, (tree?.valueWidth.value ?? 0) - (translatable.value ? PAD_WIDTH : 0)))
const fit = computed(() => roomFor(view.value.slots.length))
/** Whether its numbers are there to read as they change, on its row or the rows of them. */
const numbersInView = computed(() => inline.value || open.value || roomFor(2) !== 'stacked')
// Numbers have ways of making room, where anything else goes by how much it needs.
const inline = computed(
	() =>
		bareKind.value === 'vec' &&
		!open.value &&
		(fit.value === 'side' || canStack(placeValue.value))
)

// A size has a chain across its width and height, to have them go together.
const sized = computed(() => {
	const value = placeValue.value
	return (
		isSizeInput(props.entry.expected) &&
		!isFunction.value &&
		Array.isArray(value) &&
		value.length === 2 &&
		(inline.value || (solver !== null && canSolve(props.entry, value) && roomFor(2) !== 'stacked'))
	)
})
const proportional = computed(() => isProportional(ast.value, props.entry.env))
let kept: KeptRatio | null = null
const outerKeeper = inject(RATIO_KEEPER, null)
provide(RATIO_KEEPER, (path, value) => {
	const index = proportional.value && isSizeInput(props.entry.expected) ? elementAt(props.path, path) : null
	const now = placeValue.value
	if (index === null || !Array.isArray(now)) return outerKeeper?.(path, value) ?? false
	kept = keepingRatio(kept, now as number[], index, value)
	solver?.solve(ast.value, kept.wrote, props.path)
	return true
})

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
const canHide = computed(() => actionsOf(props.entry).some(action => action.id === 'hide'))
function toggle(id: 'pin' | 'hide'): void {
	const action = actionsOf(props.entry).find(a => a.id === id)
	if (action !== undefined && 'apply' in action) emit('change', action.apply())
}

const children = computed(() =>
	view.value.head === null ? view.value.slots : [view.value.head, ...view.value.slots]
)

const alsoSelected = inject(ALSO_SELECTED, null)
const selected = computed(
	() => selection.value?.path === props.path || (alsoSelected?.().includes(props.path) ?? false)
)

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
			else void navigator.clipboard.writeText(action.written?.() ?? action.copy())
		},
	}
}

/** Put `next` in place of what is here, leaving what is said about it. */
function paste(next: AST): void {
	update(ast.value.kind === 'meta' ? new MetaAST(ast.value.metadata, next) : next)
}

const hostKey = inject(HOST_KEY, undefined)
const commandsFor = inject(COMMANDS_FOR, undefined)

const referenceItems = computed<MenuItem[]>(() =>
	linker === null || isFunction.value ? [] : referenceMenuItems(linker, props.path, paste)
)

const slotMenu = computed(() =>
	withCopyItems(
		slotMenuItems(
			props.entry,
			(parent, action) => {
				if (action.opens) open.value = true
				emit('change', parent)
			},
			commandsFor?.(props.path)
		),
		referenceItems.value
	)
)

// What the value's own field offers by itself, and the row offers on its behalf.
const menuItems = computed<MenuItem[]>(() => [
	...(isFunction.value
		? []
		: editMenuItems($value.value?.editValue ?? null, editExpression, hostKey)),
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
		if (!target.quiet) void nextTick(() => $item.value?.scrollIntoView())
	},
	{ immediate: true }
)
</script>

<template>
	<ParameterTreeItem
		ref="$item"
		v-model:open="open"
		:label="view.label ?? (titled ? titleOf(entry) : entry.label)"
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
		<div class="value-row" :class="{ stacked: inline && fit === 'stacked' }">
			<InputTranslate
				v-if="translatable"
				:modelValue="placeValue as [number, number]"
				:showOverlayLabel="!numbersInView"
				@update:modelValue="solver?.solve(ast, $event)"
			/>
			<div v-if="inline" ref="$anchor" class="inline-anchor">
				<AstInline
					:slots="view.slots"
					:parentPath="path"
					:read="read"
					:show="show"
					:fit="canStack(placeValue) ? fit : undefined"
					@change="update"
				/>
			</div>
			<AstValue
				v-else-if="!isFunction"
				ref="$value"
				:entry="entry"
				:beside="translatable ? PAD_WIDTH : 0"
				:path="path"
				:menuItems="slotMenu"
				:read="read"
				:show="show"
				@change="emit('change', $event)"
			/>
			<div v-else ref="$anchor" />
			<button
				v-if="sized"
				class="chain"
				:class="{ proportional }"
				type="button"
				aria-label="Keep Proportions"
				:aria-pressed="proportional"
				@click.stop="update(withProportional(ast, entry.env, !proportional))"
				@dblclick.stop
			>
				<Icon :icon="proportional ? 'ph:link-simple-horizontal' : 'ph:link-simple-horizontal-break'" />
			</button>
		</div>
		<AstCodePopup
			v-if="editingCode"
			:reference="$anchor"
			:ast="ast"
			@change="update"
			@close="editingCode = false"
		/>

		<template #labelEnd>
			<span class="row-path" :data-path="path" hidden />
			<span v-if="problem !== null" class="row-problem" hidden />
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
				v-if="hidden || canHide"
				v-tooltip="hidden ? 'Show' : 'Hide'"
				class="end pin"
				:class="{ reveals: !hidden }"
				type="button"
				:aria-label="hidden ? 'Show' : 'Hide'"
				@click.stop="toggle('hide')"
				@dblclick.stop
			>
				<Icon :icon="hidden ? 'mdi:eye-off-outline' : 'mdi:eye-outline'" />
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
/* There when reached for, or when it is what the row being selected would do. */
.end.reveals {
	opacity: 0;
}
.row:hover .end.reveals,
.TqParameterTreeItem.selected .end.reveals,
.end.reveals:focus-visible {
	opacity: 1;
}
.value-row {
	position: relative;
	display: flex;
	gap: var(--tq-gap-related);
	min-width: 0;
}
/* Across where the width ends and the height begins, which makes way for it. */
.value-row > .chain {
	position: absolute;
	top: 0;
	left: 50%;
	z-index: 1;
	display: grid;
	flex: none;
	place-items: center;
	width: var(--tq-input-height);
	height: var(--tq-input-height);
	padding: 0;
	border: none;
	background: none;
	color: var(--tq-color-text-subtle);
	cursor: pointer;
	transform: translateX(-50%) scale(0.8);
}
/* One above the other, it goes beside them, with the width and the height both to its left. */
.value-row.stacked > .chain {
	position: static;
	align-self: center;
	margin: 0;
	transform: none;
}
.value-row > .chain:hover {
	color: var(--tq-color-text-mute);
}
.value-row > .chain.proportional {
	color: var(--tq-color-accent);
}
.value-row:has(> .chain) :deep(.TqInputNumber:not(:first-child) .icon.left),
.value-row:has(> .chain) :deep(.value + .value .icon.left) {
	left: calc(var(--tq-input-height) * 0.3);
}
.value-row > :not(.TqInputTranslate) {
	flex: 1;
	min-width: 0;
}
.value-row > :deep(.TqInputTranslate) {
	flex: none;
}
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

<style>
/* The row is the tree's, so this says so from inside of it. */
.row:has(> .row-problem) > .name,
.row:has(> .row-problem) > .icon {
	color: var(--tq-color-error);
	opacity: 1;
}
</style>
