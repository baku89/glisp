<script setup lang="ts">
import type { AST } from '@glisp/lang'
import { useEventListener } from '@vueuse/core'
import { InputColor } from 'tweeq/InputColor'
import { InputEnum } from 'tweeq/InputEnum'
import { InputString } from 'tweeq/InputString'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTree, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject, ref, watch } from 'vue'

import { type GlispDocument, LINKER, MixedNumber, SELECTION } from '@glisp/tweeq'
import { isMixed } from '@glisp/tweeq/multiRows'
import { capitalCase, enumIconsOf, parseSource } from '@glisp/tweeq/structure'

import { LINE_CAPS, LINE_JOINS, lineCapType, lineJoinType, NO_PAINT, type Paint } from './graphics'
import NoPaint from './NoPaint.vue'
import { paintArgument, paintReferringTo, paintSource, paintWritten, withPaintThrough } from './paintArguments'
import { paintAt, withPaint } from './scene'

const props = defineProps<{
	document: GlispDocument
	/** What it paints, all of them at once, saying so where they differ. */
	rows: readonly string[]
}>()

const paints = computed<ReadonlyArray<{ row: string; paint: Paint }>>(() =>
	props.rows.map(row => ({
		row,
		paint: paintAt(props.document.root.value, props.document.env.value, row) ?? NO_PAINT,
	}))
)

/** Only those with a line have anything to say of how it goes. */
const lined = computed(() => paints.value.filter(({ paint }) => paint.stroke !== 'none'))

/** What to show of them: the first, and the first color of any that has one. */
const paint = computed<Paint>(() => ({
	...(lined.value[0]?.paint ?? paints.value[0]?.paint ?? NO_PAINT),
	fill: paints.value.find(({ paint }) => paint.fill !== 'none')?.paint.fill ?? 'none',
}))

const paintsOf = (key: keyof Paint) =>
	key === 'fill' || key === 'stroke' ? paints.value : lined.value

const valuesOf = <K extends keyof Paint>(key: K): Array<Paint[K]> =>
	paintsOf(key).map(({ paint }) => paint[key])

const mixed = (key: keyof Paint): boolean =>
	isMixed(valuesOf(key).map(value => (Array.isArray(value) ? value.join() : value)))

/**
 * What `part` says of each row, with `partOf` having what differs from one to the next.
 * What an argument refers to comes to it, unless it is being told otherwise by `write`.
 */
function setEach(
	rows: readonly string[],
	partOf: (i: number) => Partial<Paint>,
	write: typeof withPaint = withPaintThrough
): void {
	const { root, env } = props.document
	const next = rows.reduce(
		(program, row, i) => write(program, env.value, row, partOf(i)),
		root.value as Parameters<typeof withPaint>[0]
	)
	setProgram(next)
}

function setProgram(next: AST | null): boolean {
	if (next?.kind !== 'let') return false
	if (next !== props.document.root.value) props.document.setRoot(next)
	return true
}

function set(part: Partial<Paint>): void {
	const [key] = Object.keys(part) as Array<keyof Paint>
	setEach(paintsOf(key!).map(({ row }) => row), () => part)
}

/** Each of those with a line, to its own value. */
const setNumbers = (key: 'width' | 'miterLimit' | 'dashOffset', values: readonly number[]): void =>
	setEach(lined.value.map(({ row }) => row), i => ({ [key]: values[i]! }))

const DEFAULT_COLOR = '#000000'
const DEFAULT_WIDTH = 1

const addStroke = (): void =>
	set({ stroke: DEFAULT_COLOR, width: paint.value.width || DEFAULT_WIDTH })

/** Pressing what is not there adds it, while opening its menu is only that. */
const addBy = (event: MouseEvent, add: () => void): void => {
	if (event.type !== 'contextmenu') add()
}

const capIcons = enumIconsOf(lineCapType) ?? undefined
const joinIcons = enumIconsOf(lineJoinType) ?? undefined

/** Whether all there is to a line is out. Most of the time its color and width will do. */
const lineOpen = ref(false)

const dashesIn = (text: string): number[] =>
	text
		.split(/[\s,]+/)
		.map(Number.parseFloat)
		.filter(length => length >= 0)

/** As it is typed, since `4 ` is on its way to `4 2`, though it comes to the same as `4`. */
const dashText = ref('')
watch(
	() => (mixed('dash') ? null : paint.value.dash),
	dash => {
		if (dash === null) dashText.value = ''
		else if (dashesIn(dashText.value).join() !== dash.join()) dashText.value = dash.join(' ')
	},
	{ immediate: true }
)

function setDash(text: string): void {
	dashText.value = text
	set({ dash: dashesIn(text) })
}

/** One selection with the rows of what holds these, so that only one row is ever selected. */
const selection = inject(SELECTION)!

const PATH = 'paint:'
const pathOf = (key: keyof Paint): string => `${PATH}${key}`
const isSelected = (key: keyof Paint): boolean => selection.value?.path === pathOf(key)
const ownSelection = (): boolean => selection.value?.path.startsWith(PATH) ?? false

/**
 * Deleting one is having none of it, or as much as a line has without being told. What it
 * may refer to stays as it was.
 */
const remove = (key: keyof Paint): void =>
	setEach(paintsOf(key).map(({ row }) => row), () => ({ [key]: NO_PAINT[key] }), withPaint)

const linker = inject(LINKER, null)

/** One at a time: a reference is to one place, and these can be saying it of several. */
const only = computed(() => (linker !== null && props.rows.length === 1 ? props.rows[0]! : null))

const argumentOf = (key: keyof Paint): string | null =>
	only.value && paintArgument(props.document.root.value, props.document.env.value, only.value, key)

const copyReference = (key: keyof Paint): boolean => {
	const at = argumentOf(key)
	return at !== null && linker!.copy(at)
}

const pasteReference = (key: keyof Paint, target: string): boolean =>
	only.value !== null &&
	setProgram(
		paintReferringTo(props.document.root.value, props.document.env.value, only.value, key, target)
	)

/** What it says of the first of them, as code, to go on the clipboard. */
const sourceOf = (key: keyof Paint): string | null => {
	const row = paintsOf(key)[0]?.row ?? props.rows[0]
	return row === undefined
		? null
		: paintSource(props.document.root.value, props.document.env.value, row, key)
}

/** What is on the clipboard said of this by all of them, a reference being one from each. */
function pasteText(key: keyof Paint, text: string): boolean {
	const { root, env, copiedReference } = props.document
	const target = copiedReference.value?.written === text ? copiedReference.value.path : null
	const code = target === null ? parseSource(text) : null
	if (target === null && code === null) return false
	let program: AST | null = root.value
	for (const row of props.rows) {
		if (program === null) return false
		program =
			target === null
				? paintWritten(program, env.value, row, key, code!)
				: paintReferringTo(program, env.value, row, key, target)
	}
	return setProgram(program)
}

const pasteFromClipboard = async (key: keyof Paint): Promise<void> =>
	void pasteText(key, await navigator.clipboard.readText())

function select(key: keyof Paint): void {
	selection.value = {
		path: pathOf(key),
		remove: () => remove(key),
		...(only.value === null
			? {}
			: {
					reference: {
						copy: () => copyReference(key),
						paste: (target: string) => pasteReference(key, target),
					},
				}),
	}
}

/** What can be done of one, which being said or not has a say in. */
const referenceMenuOf = (key: keyof Paint): MenuItem[] => [
	{
		label: 'Paste',
		icon: 'mdi:clipboard-text-outline',
		bindIcon: ['⌘', 'V'],
		perform: () => void pasteFromClipboard(key),
	},
	...(argumentOf(key) === null
		? []
		: [
				{
					label: 'Copy Reference',
					icon: 'mdi:link-variant',
					bindIcon: ['⌘', '⌥', 'C'],
					perform: () => void copyReference(key),
				},
			]),
]

const copySource = (key: keyof Paint): void => {
	const source = sourceOf(key)
	if (source !== null) void navigator.clipboard.writeText(source)
}

const menuOf = (key: keyof Paint): MenuItem[] => [
	{
		label: 'Copy',
		icon: 'mdi:content-copy',
		bindIcon: ['⌘', 'C'],
		perform: () => copySource(key),
	},
	...referenceMenuOf(key),
	{ label: 'Delete', icon: 'mdi:delete-outline', bindIcon: ['⌫'], perform: () => remove(key) },
]

function deselect(): void {
	if (ownSelection()) selection.value = null
}

watch(() => props.rows, deselect)

// Reaching for anything else is no longer being at the row, as a color's popup would have it.
useEventListener(window, 'pointerdown', (event: PointerEvent) => {
	const target = event.target as Element | null
	if (!target?.closest('.TqParameterTreeItem .row, [popover]')) deselect()
})

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
	if (event.key === 'Escape') deselect()
})

/** The row of one that is selected, while a key is for it and not for text being typed. */
function keyOfSelected(event: Event): keyof Paint | null {
	if (!ownSelection()) return null
	const target = event.target as Element | null
	if (target?.closest?.('input, textarea, [contenteditable]')) return null
	return selection.value!.path.slice(PATH.length) as keyof Paint
}

// Of the row selected here, and not of the shape it is the style of, which stays selected.
useEventListener(
	window,
	'keydown',
	(event: KeyboardEvent) => {
		const letter = event.key.toLowerCase()
		if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
		if (letter !== 'c' && letter !== 'x') return
		const key = keyOfSelected(event)
		if (key === null || !getSelection()?.isCollapsed) return
		event.preventDefault()
		event.stopPropagation()
		copySource(key)
		if (letter === 'x') remove(key)
	},
	{ capture: true }
)

useEventListener(
	window,
	'paste',
	(event: ClipboardEvent) => {
		const key = keyOfSelected(event)
		if (key === null || event.defaultPrevented) return
		event.preventDefault()
		event.stopPropagation()
		pasteText(key, event.clipboardData?.getData('text') ?? '')
	},
	{ capture: true }
)
</script>

<template>
	<div class="PaintControls" data-selects-rows>
		<h3 class="heading">Style</h3>
		<ParameterTree name="glisp.inspector" :labelWidth="110">
			<ParameterTreeItem
				v-if="paint.fill !== 'none'"
				label="Fill"
				icon="ph:paint-bucket"
				:selected="isSelected('fill')"
				:menuItems="menuOf('fill')"
				@select="select('fill')"
			>
				<div class="color" :class="{ mixed: mixed('fill') }" data-takes-reference @focusin="select('fill')">
					<InputColor :modelValue="paint.fill" @update:modelValue="set({ fill: $event })" />
					<span v-if="mixed('fill')" class="multiple">Mixed</span>
				</div>
			</ParameterTreeItem>
			<ParameterTreeItem
				v-else
				class="absent"
				label="Fill"
				icon="ph:paint-bucket"
				:menuItems="referenceMenuOf('fill')"
				@select="addBy($event, () => set({ fill: DEFAULT_COLOR }))"
			>
				<NoPaint label="Fill" @click="set({ fill: DEFAULT_COLOR })" />
			</ParameterTreeItem>
			<ParameterTreeItem
				v-if="paint.stroke !== 'none'"
				v-model:open="lineOpen"
				label="Stroke"
				icon="ph:line-segment"
				expandable
				:selected="isSelected('stroke')"
				:menuItems="menuOf('stroke')"
				@select="select('stroke')"
			>
				<div class="field">
					<div class="color" :class="{ mixed: mixed('stroke') }" data-takes-reference @focusin="select('stroke')">
						<InputColor
							:modelValue="paint.stroke"
							@update:modelValue="set({ stroke: $event })"
						/>
						<span v-if="mixed('stroke')" class="multiple">Mixed</span>
					</div>
					<div class="width" data-takes-reference @focusin="select('width')">
						<MixedNumber
							leftIcon="ph:line-weight"
							:values="valuesOf('width')"
							:items="menuOf('width')"
							:min="0"
							@update:values="setNumbers('width', $event)"
						/>
					</div>
				</div>
				<template #children>
					<ParameterTreeItem
						label="Cap"
						:selected="isSelected('cap')"
						:menuItems="menuOf('cap')"
						@select="select('cap')"
					>
						<div data-takes-reference @focusin="select('cap')">
							<InputEnum
								:modelValue="(mixed('cap') ? null : paint.cap) as Paint['cap']"
								:options="[...LINE_CAPS]"
								:icons="capIcons"
								:labelizer="capitalCase"
								@update:modelValue="set({ cap: $event })"
							/>
						</div>
					</ParameterTreeItem>
					<ParameterTreeItem
						label="Join"
						:selected="isSelected('join')"
						:menuItems="menuOf('join')"
						@select="select('join')"
					>
						<div data-takes-reference @focusin="select('join')">
							<InputEnum
								:modelValue="(mixed('join') ? null : paint.join) as Paint['join']"
								:options="[...LINE_JOINS]"
								:icons="joinIcons"
								:labelizer="capitalCase"
								@update:modelValue="set({ join: $event })"
							/>
						</div>
					</ParameterTreeItem>
					<ParameterTreeItem
						v-if="valuesOf('join').includes('miter')"
						label="Miter"
						:selected="isSelected('miterLimit')"
						:menuItems="menuOf('miterLimit')"
						@select="select('miterLimit')"
					>
						<div data-takes-reference @focusin="select('miterLimit')">
							<MixedNumber
								:values="valuesOf('miterLimit')"
								:min="1"
								@update:values="setNumbers('miterLimit', $event)"
							/>
						</div>
					</ParameterTreeItem>
					<ParameterTreeItem
						label="Dash"
						:selected="isSelected('dash')"
						:menuItems="menuOf('dash')"
						@select="select('dash')"
					>
						<div data-takes-reference @focusin="select('dash')">
							<InputString
								:modelValue="dashText"
								:placeholder="mixed('dash') ? 'Mixed' : 'Solid'"
								@update:modelValue="setDash"
							/>
						</div>
					</ParameterTreeItem>
					<ParameterTreeItem
						v-if="valuesOf('dash').some(dash => dash.length > 0)"
						label="Offset"
						:selected="isSelected('dashOffset')"
						:menuItems="menuOf('dashOffset')"
						@select="select('dashOffset')"
					>
						<div data-takes-reference @focusin="select('dashOffset')">
							<MixedNumber
								:values="valuesOf('dashOffset')"
								@update:values="setNumbers('dashOffset', $event)"
							/>
						</div>
					</ParameterTreeItem>
				</template>
			</ParameterTreeItem>
			<ParameterTreeItem
				v-else
				class="absent"
				label="Stroke"
				icon="ph:line-segment"
				:menuItems="referenceMenuOf('stroke')"
				@select="addBy($event, addStroke)"
			>
				<NoPaint label="Stroke" @click="addStroke" />
			</ParameterTreeItem>
		</ParameterTree>
	</div>
</template>

<style scoped>
/* After what it is a style of, if there is anything to say of that. */
.PaintControls:not(:first-child) {
	margin-top: var(--tq-gap-control);
	padding-top: var(--tq-gap-control);
	border-top: 1px solid var(--tq-color-border);
}
.heading {
	margin: 0 0 var(--tq-gap-related);
	padding-inline: 3px;
	font: inherit;
	font-weight: 600;
}
.absent :deep(.icon),
.absent :deep(.name) {
	color: var(--tq-color-text-mute);
}
.field {
	display: flex;
	gap: var(--tq-gap-related);
	min-width: 0;
}
.field > :deep(*) {
	min-width: 0;
}
.color {
	position: relative;
	flex: 1;
	min-width: 0;
}
/* Saying only that they differ, in place of a color code that is any one of them. */
.color.mixed :deep(.color-code textarea:not(:focus)) {
	color: transparent;
}
.color.mixed:has(.color-code textarea:focus) .multiple {
	visibility: hidden;
}
.multiple {
	position: absolute;
	top: 0;
	bottom: 0;
	left: calc(var(--tq-input-height) * 1.25);
	display: flex;
	align-items: center;
	color: var(--tq-color-text-mute);
	pointer-events: none;
}
.field > .width {
	flex: 0 0 76px;
}
</style>
