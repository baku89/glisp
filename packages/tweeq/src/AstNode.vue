<script setup lang="ts">
import { type AST, type Diagnostic, type Env, isHidden, isPinned, MetaAST, readByName, toAst } from '@glisp/lang'
import { Icon } from 'tweeq/Icon'
import { InputRotary } from 'tweeq/InputRotary'
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
import { editMenuItems, missingMenuItems, referenceMenuItems, slotMenuItems, withCopyItems } from './menu'
import {
	COMMANDS_FOR,
	HOST_KEY, ALSO_SELECTED, ISOLATED, LAYER_LABEL, LAYER_ROWS, LAYERS, LINKER, LOCKED, VALUE_PICKER, ROW_PICKER, OPEN_ROW, RATIO_KEEPER, RENAMER, REVEALER, SELECTION, SOLVER, TITLED, VALUE_ICON } from './selection'
import {
	actionsOf,
	slotAlong,
	canSolve,
	elementAt,
	canStack,
	holdsRows,
	numbersFit,
	type NumbersFit,
	isGroup,
	isProportional,
	isSizeInput,
	typeHintOf,
	keepingRatio,
	type KeptRatio,
	problemOf,
	titleOf,
	isAngleInput,
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
	() => problem.value ?? props.entry.doc ?? typeHintOf(props.entry.expected) ?? undefined
)

// A binding's name is edited on its label. What a call calls is an expression, so its
// code opens from the row.
const renamable = isBinding
// A row with no field of its own for it, such as these, opens it from itself.
const editingCode = ref(false)
const $anchor = useTemplateRef<HTMLElement>('$anchor')
// A row of the project shows no value to open from, so its label is what it opens from.
const $labelEnd = useTemplateRef<HTMLElement>('$labelEnd')
function editExpression(): void {
	if (locked.value) return
	// What a row of the project holds is out of view, and is nowhere to open from.
	if ($value.value === null || layers) editingCode.value = true
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
	headInField: Slot | null
}>('$value')

const bareKind = computed(() =>
	ast.value.kind === 'meta' ? ast.value.expr.kind : ast.value.kind
)
const layers = inject(LAYERS, false)

const renamer = inject(RENAMER, null)
const renaming = ref(false)

const open = ref(inject(OPEN_ROW, null)?.() === props.path)
const layerRows = inject(LAYER_ROWS, null)
const layerLabel = inject(LAYER_LABEL, null)

/** A short vector shows its elements on its own row, until it is opened. */
const tree = inject(ParameterTreeContextKey, null)
/** A point's pad, to take it by, and what is left beside it for its numbers. */
const translatable = computed(
	() => isTranslatable(props.entry.expected) && Array.isArray(placeValue.value)
)
const placeValue = computed(
	() => props.read(readByName(ast.value), props.entry.env).value
)
/** An angle's dial, to turn it by, with its number beside it. */
const turnable = computed(
	() => isAngleInput(props.entry.expected) && typeof placeValue.value === 'number'
)
const PAD_WIDTH = 26
/** Moving a pad or a dial. What is not said yet comes to be said, as there is nothing to solve for. */
const moveTo = (value: number | readonly [number, number]): void => {
	if (props.entry.absent) update(toAst(value, null))
	else solver?.solve(ast.value, value)
}
const valuePicker = inject(VALUE_PICKER, null)
/** What can be chosen by pointing at it has a way to start doing that. */
const pointable = computed(
	() => !isFunction.value && !props.entry.absent && !locked.value && (valuePicker?.wants(props.entry.expected) ?? false)
)
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
		!holdsRows(placeValue.value) &&
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

const referenceTarget = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return bare.kind === 'sym' ? (revealer?.targetOf(props.path) ?? null) : null
})
const referred = computed(() => {
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return bare.kind === 'sym' || bare.kind === 'path' ? bare : null
})
// Only a reference, which goes to what it refers to and can be pulled to another. That anything
// else is an expression is for its field to show.
const kindIcon = computed(() =>
	isFunction.value || props.entry.display !== undefined || referred.value === null
		? null
		: kindIconOf(ast.value)
)
const kindHint = computed(() => (referred.value === null ? undefined : sourceOf(referred.value)))
const expandable = computed(
	() =>
		children.value.length > 0 ||
		(!layers && (view.value.append !== null || view.value.missing.length > 0))
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
const lockedAround = inject(LOCKED, null)
/** Not to be changed from here or from the canvas, until it is unlocked. */
const locked = computed(() => pinned.value || (lockedAround?.() ?? false))
provide(LOCKED, () => locked.value)
const hidden = computed(() => isHidden(ast.value))
const canLock = computed(() => actionsOf(props.entry).some(action => action.id === 'pin'))
const canHide = computed(() => actionsOf(props.entry).some(action => action.id === 'hide'))
function toggle(id: 'pin' | 'hide'): void {
	const action = actionsOf(props.entry).find(a => a.id === id)
	if (action !== undefined && 'apply' in action) emit('change', action.apply())
}

const children = computed(() => {
	if (layers) {
		if (isGroup(ast.value)) return view.value.slots
		return (layerRows?.(props.path) ?? []).flatMap(row => {
			const slot = slotAlong(ast.value, props.entry.env, row.slice(props.path.length + 1).split('/'))
			return slot === null ? [] : [slot]
		})
	}
	// What it is a call of is said on its own row, if its field does not say.
	return view.value.head === null || $value.value?.headInField
		? view.value.slots
		: [view.value.head, ...view.value.slots]
})

const alsoSelected = inject(ALSO_SELECTED, null)
// What is selected inside of a row that is closed has nowhere else to be seen.
const selected = computed(() => {
	const also = alsoSelected?.() ?? []
	return (
		selection.value?.path === props.path ||
		also.includes(props.path) ||
		(!open.value && also.some(row => row.startsWith(`${props.path}/`)))
	)
})

// All the way to what has been gone into, which may be a part of a row that is not listed.
const isolatedRows = inject(ISOLATED, null)
const isIsolated = computed(() =>
	(isolatedRows?.() ?? []).some(row => row === props.path || row.startsWith(`${props.path}/`))
)

const picker = inject(ROW_PICKER, null)
function pick(event: MouseEvent): void {
	if (picker?.(props.path, event) !== false) select()
}

function select(): void {
	const remove = props.entry.remove
	selection.value = {
		path: props.path,
		...(remove === undefined ? {} : { remove: () => emit('change', remove()) }),
		...(renamable.value
			? { rename: () => (renaming.value = true) }
			: isFunction.value
				? { rename: () => (editingCode.value = true) }
				: $value.value?.headInField
					? { rename: editExpression }
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
	linker === null || isFunction.value || locked.value
		? []
		: props.entry.absent
			? missingMenuItems(linker, props.path.slice(0, Math.max(0, props.path.lastIndexOf('/'))), props.entry.parameter!)
			: referenceMenuItems(linker, props.path, paste)
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
	...(isFunction.value || locked.value
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
		:label="(layers && !isBinding ? layerLabel?.(path) : null) ?? view.label ?? (titled ? titleOf(entry) : entry.label)"
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
		renameSpaceAs="_"
		@rename="rename"
		:selected="selected"
		:closedGuide="bareKind === 'call'"
		:menuItems="menuItems"
		@select="pick"
	>
		<div
			class="value-row"
			:class="{ stacked: inline && fit === 'stacked', locked, isolated: isIsolated }"
			:data-row-path="entry.absent || isFunction ? undefined : path"
			:data-takes-drop="pointable ? path : undefined"
			:data-tq-takes-drag="pointable ? '' : undefined"
		>
			<InputTranslate
				v-if="translatable"
				:modelValue="placeValue as [number, number]"
				:showOverlayLabel="!numbersInView"
				@update:modelValue="moveTo($event)"
			/>
			<!-- 0 is along X, as it is on a canvas, rather than up. -->
			<InputRotary
				v-if="turnable"
				:modelValue="placeValue as number"
				:angleOffset="0"
				@update:modelValue="moveTo($event)"
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
				@select="pick"
			/>
			<div v-else ref="$anchor" />
			<button
				v-if="pointable"
				v-tooltip="'Pick from the Canvas'"
				class="point-at"
				:class="{ active: valuePicker?.isFor(path) }"
				type="button"
				aria-label="Pick from the Canvas"
				@click.stop="valuePicker?.toggle(path, $event.currentTarget as Element)"
				@dblclick.stop
			>
				<Icon icon="ph:eyedropper" />
			</button>
			<button
				v-if="sized"
				class="chain"
				:inert="locked"
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
			:reference="layers || isFunction ? $labelEnd : ($anchor ?? $labelEnd)"
			:ast="ast"
			@change="update"
			@close="editingCode = false"
		/>

		<template #labelEnd>
			<span ref="$labelEnd" class="label-end" />
			<span v-if="isFunction" class="row-function" hidden />
			<span v-if="entry.absent" class="row-absent" hidden />
			<span v-if="hidden" class="row-hidden" hidden />
			<span v-else class="row-path" :data-path="path" hidden />
			<span v-if="problem !== null" class="row-problem" hidden />
			<AstGapAdd v-if="insertBefore" @add="insertBefore" />
			<button
				v-if="pinned || canLock"
				v-tooltip="pinned ? 'Unlock' : 'Lock'"
				class="end pin"
				:class="pinned ? 'locked' : 'reveals'"
				type="button"
				:aria-label="pinned ? 'Unlock' : 'Lock'"
				@click.stop="toggle('pin')"
				@dblclick.stop
			>
				<Icon :icon="pinned ? 'mdi:lock' : 'mdi:lock-open-variant'" />
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
			<span v-else class="end kept" />
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
				:missing="layers ? [] : view.missing"
				:append="layers ? null : view.append"
				:noAddRow="layers || (bareKind === 'let' && view.slots.length > 0)"
				:read="read"
				:show="show"
				@change="update"
			/>
		</template>
	</ParameterTreeItem>
</template>

<style scoped>
/* Not drawn, and still there to be found. What says so stays as it is, to be pressed. */
:global(.TqParameterTreeItem:has(.row-hidden) > .label .row > :not(.end, .AstGapAdd)),
:global(.TqParameterTreeItem:has(.row-hidden) > .input .value-row > :not(.value)) {
	opacity: 0.5;
}
/* Not written: what it comes to anyway, until it is edited. */
:global(.TqParameterTreeItem:has(.row-absent):not(:hover, :focus-within)) {
	opacity: 0.5;
}
/* Gone into, which is not the same as being selected, and can be along with it. */
:global(.TqParameterTreeItem:has(.value-row.isolated)) {
	border-radius: var(--tq-radius-input);
	outline: 1px solid var(--tq-color-accent);
	outline-offset: -1px;
}
/* What a call is of heads what it is given, across the whole row, there being no value to show. */
:global(.TqParameterTreeItem:has(.row-function) > .label) {
	grid-column: 1 / -1;
}
:global(.TqParameterTreeItem:has(.row-function) > .input) {
	position: absolute;
	width: 0;
	height: 0;
}
:global(.TqParameterTreeItem:has(.row-function):not(.selected)::before) {
	content: '';
	position: absolute;
	inset: 0 0 0 calc(var(--depth) * var(--indent));
	z-index: -1;
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-info-soft);
	pointer-events: none;
}
/* There when reached for, or when it is what the row being selected would do. */
/* Taking no room from the name, until it is what is reached for. */
.end.reveals {
	display: none;
}
.row:hover .end.reveals,
.TqParameterTreeItem.selected .end.reveals {
	display: block;
}
/* The last column is kept for a reference, so long as there is anything else to line up. */
.end.kept {
	display: none;
}
.row:hover .end.kept,
.TqParameterTreeItem.selected .end.kept,
.pin:not(.reveals) ~ .end.kept {
	display: block;
}
/* A lock stays in its own column, whether what comes after it is showing or not. */
.end.locked:has(+ .end.reveals) {
	margin-right: var(--end-width);
}
.row:hover .end.locked:has(+ .end.reveals),
.TqParameterTreeItem.selected .end.locked:has(+ .end.reveals) {
	margin-right: 0;
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
.value-row > :not(.TqInputTranslate, .TqInputRotary, .point-at) {
	flex: 1;
	min-width: 0;
}
.value-row > :deep(.TqInputTranslate),
.value-row > :deep(.TqInputRotary) {
	flex: none;
}
/* What a row being dragged would go into, if it were let go of here. */
.value-row[data-drop-here] {
	border-radius: var(--tq-radius-input);
	outline: 2px solid var(--tq-color-accent);
	outline-offset: 1px;
}
.point-at {
	display: grid;
	flex: none;
	place-items: center;
	width: var(--tq-input-height);
	height: var(--tq-input-height);
	border-radius: var(--tq-radius-input);
	background: var(--tq-color-input);
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.point-at:hover {
	background: var(--tq-color-input-hover);
}
.point-at.active {
	background: var(--tq-color-accent);
	color: var(--tq-color-on-accent, white);
}
.point-at > * {
	width: 14px;
	height: 14px;
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
/* What comes after it is together, at the end of the label column, whatever the label's length. */
.label-end {
	/* As tall as the row, for what opens from it to open from below it. */
	align-self: stretch;
	margin-right: auto;
}
.end {
	--end-width: 15px;
	display: block;
	flex-shrink: 0;
	width: var(--end-width);
	height: var(--tq-icon-size);
	margin-top: calc((var(--tq-input-height) - var(--tq-icon-size)) / 2);
	border-radius: var(--tq-radius-input);
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
/* Only what can be said of a row, which is no more than the name beside it. */
.pin > * {
	width: 13px;
	height: 13px;
	margin: auto;
}
.kind {
	color: var(--tq-color-info);
}
.kind.pressable {
	cursor: pointer;
}
/* A name for something else, and not what this row does: a filled mark. */
.kind.reference {
	height: var(--end-width);
	margin-top: calc((var(--tq-input-height) - var(--end-width)) / 2);
	border-radius: 50%;
	color: var(--tq-color-background);
	background: var(--tq-color-info);
	transform: scale(0.78);
}
.pin.locked {
	color: var(--tq-color-warning);
}
/* Not taken hold of, but still with the focus, for what unlocks it to be of the same thing. */
.value-row.locked > :deep(.TqInputTranslate),
.value-row.locked > :deep(.TqInputRotary) {
	pointer-events: none;
}
/* What takes hold of it says as well that it cannot be taken hold of. */
.value-row.locked {
	--tq-color-accent: var(--tq-color-warning);
	--tq-color-accent-hover: var(--tq-color-warning);
	--tq-color-input: var(--tq-color-warning-soft);
	--tq-color-input-hover: var(--tq-color-warning-soft);
}
.pin:hover,
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
