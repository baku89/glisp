<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { InputColor } from 'tweeq/InputColor'
import { InputEnum } from 'tweeq/InputEnum'
import { InputString } from 'tweeq/InputString'
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTree, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject, ref, watch } from 'vue'

import { type GlispDocument, MixedNumber, SELECTION } from '@glisp/tweeq'
import { isMixed } from '@glisp/tweeq/multiRows'
import { capitalCase, enumIconsOf } from '@glisp/tweeq/structure'

import { LINE_CAPS, LINE_JOINS, lineCapType, lineJoinType, NO_PAINT, type Paint } from './graphics'
import NoPaint from './NoPaint.vue'
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

/** What `part` says of each row, with `partOf` having what differs from one to the next. */
function setEach(rows: readonly string[], partOf: (i: number) => Partial<Paint>): void {
	const { root, env } = props.document
	const next = rows.reduce(
		(program, row, i) => withPaint(program, env.value, row, partOf(i)),
		root.value as Parameters<typeof withPaint>[0]
	)
	if (next.kind === 'let' && next !== root.value) props.document.setRoot(next)
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

/** Deleting one is having none of it, or as much as a line has without being told. */
const remove = (key: keyof Paint): void => set({ [key]: NO_PAINT[key] })

function select(key: keyof Paint): void {
	selection.value = { path: pathOf(key), remove: () => remove(key) }
}

const menuOf = (key: keyof Paint): MenuItem[] => [
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
</script>

<template>
	<div class="PaintControls" data-selects-rows>
		<ParameterTree name="glisp.inspector" :labelWidth="110">
			<ParameterTreeItem
				v-if="paint.fill !== 'none'"
				label="Fill"
				icon="ph:paint-bucket"
				:selected="isSelected('fill')"
				:menuItems="menuOf('fill')"
				@select="select('fill')"
			>
				<div class="color" :class="{ mixed: mixed('fill') }">
					<InputColor :modelValue="paint.fill" @update:modelValue="set({ fill: $event })" />
					<span v-if="mixed('fill')" class="multiple">Mixed</span>
				</div>
			</ParameterTreeItem>
			<ParameterTreeItem
				v-else
				class="absent"
				label="Fill"
				icon="ph:paint-bucket"
				@select="set({ fill: DEFAULT_COLOR })"
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
					<div class="color" :class="{ mixed: mixed('stroke') }">
						<InputColor
							:modelValue="paint.stroke"
							@update:modelValue="set({ stroke: $event })"
						/>
						<span v-if="mixed('stroke')" class="multiple">Mixed</span>
					</div>
					<div class="width">
						<MixedNumber
							leftIcon="ph:line-weight"
							:values="valuesOf('width')"
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
						<InputEnum
							:modelValue="(mixed('cap') ? null : paint.cap) as Paint['cap']"
							:options="[...LINE_CAPS]"
							:icons="capIcons"
							:labelizer="capitalCase"
							@update:modelValue="set({ cap: $event })"
						/>
					</ParameterTreeItem>
					<ParameterTreeItem
						label="Join"
						:selected="isSelected('join')"
						:menuItems="menuOf('join')"
						@select="select('join')"
					>
						<InputEnum
							:modelValue="(mixed('join') ? null : paint.join) as Paint['join']"
							:options="[...LINE_JOINS]"
							:icons="joinIcons"
							:labelizer="capitalCase"
							@update:modelValue="set({ join: $event })"
						/>
					</ParameterTreeItem>
					<ParameterTreeItem
						v-if="valuesOf('join').includes('miter')"
						label="Miter"
						:selected="isSelected('miterLimit')"
						:menuItems="menuOf('miterLimit')"
						@select="select('miterLimit')"
					>
						<MixedNumber
							:values="valuesOf('miterLimit')"
							:min="1"
							@update:values="setNumbers('miterLimit', $event)"
						/>
					</ParameterTreeItem>
					<ParameterTreeItem
						label="Dash"
						:selected="isSelected('dash')"
						:menuItems="menuOf('dash')"
						@select="select('dash')"
					>
						<InputString
							:modelValue="dashText"
							:placeholder="mixed('dash') ? 'Mixed' : 'Solid'"
							@update:modelValue="setDash"
						/>
					</ParameterTreeItem>
					<ParameterTreeItem
						v-if="valuesOf('dash').some(dash => dash.length > 0)"
						label="Offset"
						:selected="isSelected('dashOffset')"
						:menuItems="menuOf('dashOffset')"
						@select="select('dashOffset')"
					>
						<MixedNumber
							:values="valuesOf('dashOffset')"
							@update:values="setNumbers('dashOffset', $event)"
						/>
					</ParameterTreeItem>
				</template>
			</ParameterTreeItem>
			<ParameterTreeItem
				v-else
				class="absent"
				label="Stroke"
				icon="ph:line-segment"
				@select="addStroke"
			>
				<NoPaint label="Stroke" @click="addStroke" />
			</ParameterTreeItem>
		</ParameterTree>
	</div>
</template>

<style scoped>
.PaintControls {
	margin-bottom: var(--tq-gap-control);
	padding-bottom: var(--tq-gap-control);
	border-bottom: 1px solid var(--tq-color-border);
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
