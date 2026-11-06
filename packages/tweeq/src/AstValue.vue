<script setup lang="ts">
import { type AST, type Diagnostic, type Env, infer, isHidden, isPinned, readByName, UNIT, unwrapLazy, UNSET } from '@glisp/lang'
import { InputColor } from 'tweeq/InputColor'
import { InputEnum } from 'tweeq/InputEnum'
import { InputGroup } from 'tweeq/InputGroup'
import { InputNumber } from 'tweeq/InputNumber'
import { InputSeed } from 'tweeq/InputSeed'
import { vTooltip } from 'tweeq/Tooltip'
import { InputString } from 'tweeq/InputString'
import { InputSwitch } from 'tweeq/InputSwitch'
import { InputTextBase } from 'tweeq/InputTextBase'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeContextKey } from 'tweeq/ParameterGrid'
import { computed, inject, nextTick, ref, useTemplateRef, watch } from 'vue'

import AstCodePopup from './AstCodePopup.vue'
import AstLongText from './AstLongText.vue'
import AstShownField from './AstShownField.vue'
import InputUnit from './InputUnit.vue'
import { editMenuItems } from './menu'
import type { Place } from './multiRows'
import { displayedAs } from './numberField'
import { BLANK_FILLER, FUNCTION_ICON, HOST_KEY, LOCKED, RATIO_KEEPER, SOLVER } from './selection'
import {
	canSolve,
	editorOfValue,
	expressionForNumber,
	expressionFromField,
	numbersFit,
	hasValue,
	isExpression,
	elementOptionsOf,
	numberOptionsAt,
	problemOf,
	type Slot,
	sourceOf,
	summaryOf,
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
	/** Where it is in a column of them. */
	blockPosition?: InputPosition
	/** Without its icon, there being no room for one. */
	bare?: boolean
	/** How much of the row is taken by what is beside it. */
	beside?: number
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
}>()

const emit = defineEmits<{
	/** A new parent: what this slot's edit makes of the node holding it. */
	change: [parent: AST]
	/** Pressed where there is nothing to do but to have its row selected. */
	select: [event: MouseEvent]
}>()

const ast = computed(() => props.entry.ast)
// By where it is, in the program as it is now, as several can change at once: another
// of them may have changed it since this was drawn.
const lockedAround = inject(LOCKED, null)
/** Not to be changed from here or from the canvas, until it is unlocked. */
const locked = computed(() => isPinned(ast.value) || (lockedAround?.() ?? false))
const update = (next: AST): void => {
	if (locked.value) return
	if (!solver?.replaceAt(props.path, next)) emit('change', props.entry.replace(next))
}

const view = computed(() =>
	viewOf(ast.value, props.entry.env, props.entry.expected)
)

const result = computed(() =>
	view.value.editor !== null || !hasValue(ast.value)
		? null
		: // What it would come to: `#_` is shown as such, and the value is still worth seeing.
			props.read(readByName(ast.value), props.entry.env)
)
const problem = computed(() =>
	problemOf(ast.value, props.entry.env, props.entry.expected, props.read)
)

// A row with nothing expected of it goes by what it comes to.
const summary = computed(
	() =>
		summaryOf(props.entry.expected) ??
		summaryOf(infer(readByName(ast.value), props.entry.env))
)

/** Only a name or a path, which is what there is to say of it, whatever it comes to. */
const refers = computed(() => {
	const { kind } = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return (kind === 'sym' || kind === 'path') && props.entry.display === undefined
})

/** There being nothing else to edit it as. */
const onlyRefers = computed(
	() =>
		refers.value &&
		view.value.editor === null &&
		solvedEditor.value === null &&
		!hasNumber.value &&
		!solvableBoolean.value &&
		solvableNumbers.value === null
)

/** What the field shows while it is not being edited. */
const shown = computed(() => {
	if (props.entry.display !== undefined) return props.entry.display
	if (onlyRefers.value) return sourceOf(ast.value)
	if (summary.value !== null) return summary.value
	const value = result.value?.value
	if (result.value === null || typeof value === 'function') {
		return sourceOf(ast.value)
	}
	if (value === UNIT) return '()'
	if (typeof value === 'number') return String(Number(value.toFixed(4)))
	if (typeof value === 'string') return value
	// What a host has made its own type goes by that, rather than what it is made of.
	const type = infer(readByName(ast.value), props.entry.env)
	if (type !== null && unwrapLazy(type).shape.kind === 'primitive') return type.typeName
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

// What comes to nothing looks like it, as does a block of only bindings.
const isUnit = computed(() => {
	if (props.entry.display !== undefined) return false
	const bare = ast.value.kind === 'meta' ? ast.value.expr : ast.value
	return (
		view.value.editor?.kind === 'unit' ||
		(bare.kind === 'let' && bare.body === null) ||
		result.value?.value === UNIT
	)
})

// What comes to a number or a string looks like one, as a literal does.
const isNumber = computed(
	() => typeof result.value?.value === 'number' && props.entry.display === undefined
)
const isString = computed(
	() => typeof result.value?.value === 'string' && props.entry.display === undefined
)

// The node's own say goes first, over what its parameter's type says.
const numberOptions = computed(() =>
	displayedAs(iconless(numberOptionsAt(props.entry), props.bare ?? false))
)

// An expression shows its value, and its code opens from it, in room to read it. Only
// the one being edited has an editor, so that a long program stays light.
const editing = ref(false)
const editingStart = ref<string | undefined>(undefined)

// What is typed that is not a number is an expression, once it is let go of: with it in
// place, this would be another field, which would have lost what is being typed.
let typedExpression: AST | null = null

function typeExpression(text: string): string | null {
	const result = expressionForNumber(text, props.entry.env, props.read)
	typedExpression = 'ast' in result ? result.ast : null
	return 'problem' in result ? result.problem : null
}

/** A number after all, and not what was being typed before it. */
function onNumberTyped(apply: () => unknown): void {
	typedExpression = null
	apply()
}

function confirmExpression(): void {
	const typed = typedExpression
	typedExpression = null
	if (typed !== null) update(typed)
}

// Typing `=` first in a number or the like turns it into an expression, as in a
// spreadsheet. A string can begin with `=`, so it stays a string.
function onFieldKey(event: KeyboardEvent): void {
	if (locked.value) {
		if (event.key !== 'Tab') event.preventDefault()
		return
	}
	if (event.key === 'Escape') typedExpression = null
	// A click only selects what is shown by what it is a call of, and this goes into it.
	const onlyShown = headInField.value !== null || onlyRefers.value
	if (onlyShown && !editing.value && (event.key === 'Enter' || event.key === 'F2' || event.key === '=')) {
		event.preventDefault()
		event.stopPropagation()
		;(event.target as HTMLElement).blur()
		editExpression()
		return
	}
	const { kind } = view.value.editor ?? {}
	// A string can begin with `=`, whatever it comes from.
	const takesCode = solvable.value && solvedEditor.value?.kind !== 'string'
	if (
		event.key !== '=' ||
		event.isComposing ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey ||
		(kind !== 'number' && kind !== 'color' && kind !== 'boolean' && kind !== 'enum' && !takesCode)
	) {
		return
	}
	const target = event.target as HTMLElement
	if (takesCode) {
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
	// With nothing left to go on from, it starts from what it is, and not from nothing.
	editingStart.value = start === '' ? undefined : start
	editing.value = true
}

// What comes out of an expression is a number like any other. Editing it changes
// what it comes from, and what it is written as is gone into on purpose.
const solver = inject(SOLVER, null)
const keepRatio = inject(RATIO_KEEPER, null)
const solvable = computed(
	() => solver !== null && canSolve(props.entry, result.value?.value)
)
/** What it comes to is edited as such a value would be, if it can be sent back. */
const solvedEditor = computed(() =>
	solvable.value ? editorOfValue(result.value?.value, props.entry.expected) : null
)
const solvableNumber = computed(
	() =>
		solvable.value &&
		typeof result.value?.value === 'number' &&
		solvedEditor.value?.kind !== 'enum'
)
const solvableBoolean = computed(
	() => solvable.value && typeof result.value?.value === 'boolean'
)
// Side by side while they fit, and otherwise as text, as anything else that long.
const tree = inject(ParameterTreeContextKey, null)
const solvableNumbers = computed(() => {
	const value = result.value?.value
	return solvable.value &&
		Array.isArray(value) &&
		solvableFit.value !== 'stacked'
		? (value as number[])
		: null
})
const solvableFit = computed(() => {
	const value = result.value?.value
	return numbersFit(
		Array.isArray(value) ? value.length : 0,
		Math.max(0, (tree?.valueWidth.value ?? 0) - (props.beside ?? 0))
	)
})
const iconless = <T extends { leftIcon?: string }>(options: T, bare: boolean): Omit<T, 'leftIcon'> => {
	if (!bare) return options
	const { leftIcon: _, ...rest } = options
	return rest
}
function solveElement(index: number, next: number): void {
	const numbers = solvableNumbers.value
	if (keepRatio?.(`${props.path}/${index}`, next)) return
	if (numbers !== null) {
		// The others can follow along, as what they come from may be the same.
		solver?.solve(ast.value, numbers.map((_, i) => (i === index ? next : UNSET)), props.path)
	}
}
const hasNumber = computed(
	() => view.value.editor?.kind === 'number' || solvableNumber.value
)

/**
 * What it is a call of, if the field has nothing better to say of it than that: a value it can
 * show or be edited as is more to the point, and leaves that to a row of its own.
 */
const headInField = computed(() => {
	const { head, editor } = view.value
	if (head === null || props.entry.display !== undefined || editor !== null) return null
	if (solvedEditor.value !== null || solvableNumbers.value !== null || isUnit.value) return null
	const value = result.value?.value
	return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? null : head
})
const iconOfFunction = inject(FUNCTION_ICON, null)
const headIcon = computed(() => {
	const head = headInField.value
	if (head === null || props.bare) return undefined
	return iconOfFunction?.(sourceOf(head.ast)) ?? head.icon ?? undefined
})

const $root = useTemplateRef<HTMLElement>('$root')

function editValue(): void {
	// After a menu has closed, which gives the focus back to where it was.
	void nextTick(() => $root.value?.querySelector('input')?.select())
}

function editExpression(): void {
	if (editing.value || locked.value) return
	editingStart.value = undefined
	editing.value = true
}

// Where nothing is, what fits there is chosen, where a host has that, rather than written.
const fillBlank = inject(BLANK_FILLER, null)
function onBlank(): void {
	if (fillBlank === null || locked.value || $root.value === null) editExpression()
	else fillBlank(props.path, $root.value)
}

const hostKey = inject(HOST_KEY, undefined)
const editItems = computed(() =>
	locked.value ? [] : editMenuItems(hasNumber.value ? editValue : null, editExpression, hostKey)
)
const fieldMenu = computed<MenuItem[]>(() => [...editItems.value, ...props.menuItems])

defineExpose({
	editValue: computed(() => (hasNumber.value && !locked.value ? editValue : null)),
	editExpression,
	headInField,
})

// What each input stands for, so that what is selected can be edited as one.
const place = computed<Place | undefined>(() =>
	props.entry.absent || locked.value ? undefined : { path: props.path, element: null }
)

const label = (value: unknown): string =>
	typeof value === 'string' ? value : String(value)
</script>

<template>
	<div
		ref="$root"
		class="value"
		:data-path="entry.absent ? undefined : path"
		:class="{
			expression: !isCallee && isExpression(ast),
			callee: isCallee,
			hidden: isHidden(ast),
			locked,
			error: problem !== null,
		}"
		v-tooltip="problem ?? headInField?.doc ?? undefined"
		:title="problem === null && !headInField?.doc && (summary === null || isExpression(ast)) ? sourceOf(ast) : undefined"
		@keydown.capture="onFieldKey"
	>
		<InputSeed
			v-if="view.editor?.kind === 'number' && view.editor.seed"
			:modelValue="view.editor.value"
			:menuItems="fieldMenu"
			@update:modelValue="update(withLiteral(ast, $event))"
		/>
		<InputNumber
			v-else-if="view.editor?.kind === 'number'"
			v-bind="numberOptions"
			:modelValue="view.editor.value"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			:blockPosition="blockPosition"
			:multiSelectData="place"
			:expression="typeExpression"
			@confirm="confirmExpression"
			@update:modelValue="onNumberTyped(() => keepRatio?.(path, $event) || update(withLiteral(ast, $event)))"
		/>
		<InputEnum
			v-else-if="solvedEditor?.kind === 'enum'"
			:modelValue="solvedEditor.value"
			:options="[...solvedEditor.options]"
			:icons="solvedEditor.icons"
			:labelizer="label"
			@update:modelValue="solver?.solve(ast, $event, path)"
		/>
		<InputColor
			v-else-if="solvedEditor?.kind === 'color'"
			alpha
			:modelValue="solvedEditor.value"
			:inlinePosition="inlinePosition"
			@update:modelValue="solver?.solve(ast, $event, path)"
		/>
		<AstLongText
			v-else-if="solvedEditor?.kind === 'longText'"
			:value="solvedEditor.value"
			:label="solvedEditor.label"
			:icon="solvedEditor.icon"
			:language="solvedEditor.language"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			@change="solver?.solve(ast, $event, path)"
		/>
		<InputString
			v-else-if="solvedEditor?.kind === 'string'"
			:modelValue="solvedEditor.value"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			:multiSelectData="place"
			@update:modelValue="solver?.solve(ast, $event, path)"
		/>
		<InputNumber
			v-else-if="solvableNumber"
			v-bind="numberOptions"
			:modelValue="result?.value as number"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			:blockPosition="blockPosition"
			:multiSelectData="place"
			:expression="typeExpression"
			@confirm="confirmExpression"
			@update:modelValue="onNumberTyped(() => keepRatio?.(path, $event) || solver?.solve(ast, $event, path))"
		/>
		<InputGroup v-else-if="solvableNumbers !== null">
			<InputNumber
				v-for="(number, i) in solvableNumbers"
				:key="i"
				v-bind="displayedAs(iconless(elementOptionsOf(entry.expected, i), solvableFit !== 'side'))"
				:modelValue="number"
				:menuItems="fieldMenu"
				:multiSelectData="{ path, element: i }"
				@update:modelValue="solveElement(i, $event)"
			/>
		</InputGroup>
		<InputSwitch
			v-else-if="solvableBoolean"
			:modelValue="result?.value as boolean"
			:multiSelectData="place"
			@update:modelValue="solver?.solve(ast, $event, path)"
		/>
		<AstLongText
			v-else-if="view.editor?.kind === 'longText'"
			:value="view.editor.value"
			:label="view.editor.label"
			:icon="view.editor.icon"
			:language="view.editor.language"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			@change="update(withLiteral(ast, $event))"
		/>
		<InputString
			v-else-if="view.editor?.kind === 'string'"
			:modelValue="view.editor.value"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			:multiSelectData="place"
			@update:modelValue="update(withLiteral(ast, $event))"
		/>
		<InputColor
			v-else-if="view.editor?.kind === 'color'"
			alpha
			:modelValue="view.editor.value"
			:inlinePosition="inlinePosition"
			@update:modelValue="update(withLiteral(ast, $event))"
		/>
		<InputSwitch
			v-else-if="view.editor?.kind === 'boolean'"
			:modelValue="view.editor.value"
			:multiSelectData="place"
			@update:modelValue="update(withLiteral(ast, $event))"
		/>
		<InputEnum
			v-else-if="view.editor?.kind === 'enum'"
			:modelValue="view.editor.value"
			:options="[...view.editor.options]"
			:icons="view.editor.icons"
			:labelizer="label"
			@update:modelValue="update(withLiteral(ast, $event as never))"
		/>
		<InputUnit
			v-else-if="isUnit"
			:menuItems="fieldMenu"
			:inlinePosition="inlinePosition"
			@edit="onBlank"
		/>
		<AstShownField
			v-else-if="place !== undefined"
			:source="sourceOf(ast)"
			:place="place"
			:pressEdits="headInField === null && !onlyRefers"
			:font="isNumber ? 'numeric' : isString || summary !== null || headInField !== null ? undefined : 'monospace'"
			:leftIcon="headIcon"
			:align="isNumber ? 'center' : undefined"
			:inlinePosition="inlinePosition"
			:menuItems="fieldMenu"
			@edit="editExpression"
			@press="headInField !== null ? emit('select', $event) : onlyRefers ? undefined : editExpression()"
		>
			<span class="shown">{{ headInField?.label ?? shown }}</span>
			<span v-if="upToNow !== null" class="up-to-now">{{ upToNow }}</span>
		</AstShownField>
		<InputTextBase
			v-else
			:modelValue="sourceOf(ast)"
			:font="isNumber ? 'numeric' : isString || summary !== null || headInField !== null ? undefined : 'monospace'"
			:leftIcon="headIcon"
			:align="isNumber ? 'center' : undefined"
			:inlinePosition="inlinePosition"
			ignoreInput
			:menuItems="fieldMenu"
			@click="headInField === null ? editExpression() : emit('select', $event)"
			@focus="headInField === null && editExpression()"
		>
			<template #inactiveContent>
				<span class="shown">{{ headInField?.label ?? shown }}</span>
				<span v-if="upToNow !== null" class="up-to-now">{{ upToNow }}</span>
			</template>
		</InputTextBase>
		<AstCodePopup
			v-if="editing"
			:reference="$root"
			:ast="ast"
			:start="editingStart"
			@change="update"
			@close="editing = false"
		/>
	</div>
</template>

<style scoped>
/* However long it is, one line of it, until it is what is being written. */
.value:not(:focus-within) > :deep(.TqInputString.multiline .input) {
	overflow: hidden;
	height: var(--tq-input-height);
	white-space: nowrap;
}
.value {
	display: grid;
	min-width: 0;
}
/* As wide as it looks, for what opens from it. A color's parts have widths of their own. */
.value > :deep(.TqInputGroup:not(.TqInputColor) > *) {
	flex: 1 1 0;
}
/* As wide as a switch looks, for what opens from it. */
.value:has(> :deep(.TqInputSwitch)) {
	justify-self: start;
	width: fit-content;
}
/* As a parameter driven by an expression is in After Effects or Houdini. */
.expression {
	--tq-color-text: var(--tq-color-info);
	--tq-color-input: var(--tq-color-info-soft);
	--tq-color-input-hover: var(--tq-color-info-soft);
	--tq-color-accent: var(--tq-color-info);
	--tq-color-accent-hover: var(--tq-color-info);
}
.locked {
	--tq-color-text: var(--tq-color-warning);
	--tq-color-input: var(--tq-color-warning-soft);
	--tq-color-input-hover: var(--tq-color-warning-soft);
	--tq-color-accent: var(--tq-color-warning);
	--tq-color-accent-hover: var(--tq-color-warning);
}
/* Seen, but not taken hold of. */
.locked > * {
	pointer-events: none;
}
.hidden {
	opacity: 0.5;
}
.callee :deep(.TqInputTextBase) {
	background: transparent;
	box-shadow: inset 0 0 0 1px var(--tq-color-border);
}
.callee :deep(.TqInputTextBase:hover) {
	background: var(--tq-color-input-hover);
}
/* As an input with focus looks. */
.value.link-target {
	border-radius: var(--tq-radius-input);
	box-shadow: 0 0 0 1px var(--tq-color-accent);
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
