<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { InputNumber } from 'tweeq/InputNumber'
import { type MenuItem, Menu } from 'tweeq/Menu'
import { Parameter, ParameterTree } from 'tweeq/ParameterGrid'
import { Popover } from 'tweeq/Popover'
import { ScrollArea } from 'tweeq/ScrollArea'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, ref, shallowRef } from 'vue'

import { type GlispDocument } from './document'
import {
	extractedField,
	inspectRows,
	isMixed,
	type Merge,
	merged,
	MERGES,
	type MultiField,
	withFieldValues,
} from './multiRows'

const props = defineProps<{
	document: GlispDocument
	rows: readonly string[]
}>()

const inspection = computed(() =>
	inspectRows(props.document.root.value, props.document.env.value, props.rows)
)

const problem = ref<string | null>(null)

function setValues(field: MultiField, values: readonly number[]): void {
	const { ast, problem: why } = withFieldValues(
		props.document.root.value,
		props.document.env.value,
		props.rows,
		field,
		values
	)
	problem.value = why
	if (ast?.kind === 'let') props.document.setRoot(ast)
}

/** What it shows: the one value, or if they differ, what they come to on average. */
const shown = (field: MultiField): number => merged(field.values, 'ave')

/** They go together, by as much, so that how they differ is kept. */
function shift(field: MultiField, next: number): void {
	const by = next - shown(field)
	setValues(
		field,
		isMixed(field.values)
			? field.values.map(value => Math.round((value + by) * 1000) / 1000)
			: field.values.map(() => next)
	)
}

function merge(field: MultiField, how: Merge): void {
	const value = merged(field.values, how)
	setValues(field, field.values.map(() => value))
}

function extract(field: MultiField, how: Merge): void {
	const result = extractedField(
		props.document.root.value,
		props.document.env.value,
		props.rows,
		field,
		merged(field.values, how)
	)
	problem.value = result === null ? 'that cannot be pulled out from here' : null
	if (result?.ast.kind === 'let') props.document.setRoot(result.ast)
}

const LABELS: Readonly<Record<Merge, string>> = {
	first: 'First',
	last: 'Last',
	ave: 'Average',
	min: 'Minimum',
	max: 'Maximum',
}

const menuOf = (field: MultiField): MenuItem[] => [
	...(isMixed(field.values)
		? MERGES.map(
				(how): MenuItem => ({
					label: `Merge to ${LABELS[how]}`,
					icon: 'mdi:call-merge',
					perform: () => merge(field, how),
				})
			)
		: []),
	...(field.canExtract
		? [
				{ separator: true as const },
				...(isMixed(field.values) ? MERGES : (['first'] as const)).map(
					(how): MenuItem => ({
						label: isMixed(field.values)
							? `Extract ${LABELS[how]} as Parameter`
							: 'Extract as Parameter',
						icon: 'mdi:variable',
						perform: () => extract(field, how),
					})
				),
			]
		: []),
]

const menu = shallowRef<{
	items: MenuItem[]
	at: [number, number]
	reference: HTMLElement
} | null>(null)

function openMenu(field: MultiField, event: MouseEvent): void {
	menu.value = {
		items: menuOf(field),
		at: [event.clientX, event.clientY],
		reference: event.currentTarget as HTMLElement,
	}
}

/** How far apart they are, when asked. Rounded, as they can be as long as they like. */
function range(values: readonly number[]): string {
	const short = (n: number) => Math.round(n * 100) / 100
	return `${short(Math.min(...values))} – ${short(Math.max(...values))}`
}
</script>

<template>
	<div v-if="inspection" class="AstMultiInspector" data-selects-rows>
		<p v-if="inspection.doc !== null" class="doc">{{ inspection.doc }}</p>
		<ScrollArea>
		<ParameterTree name="glisp.inspector" :labelWidth="90">
			<Parameter v-for="arg in inspection.args" :key="arg.label" :label="arg.label">
				<div class="fields">
					<div
						v-for="field in arg.fields"
						:key="field.name"
						v-tooltip="isMixed(field.values) ? range(field.values) : undefined"
						class="field"
						:class="{ mixed: isMixed(field.values) }"
						@contextmenu.prevent.stop="openMenu(field, $event)"
					>
						<InputNumber
							v-bind="field.options"
							:modelValue="shown(field)"
							@update:modelValue="shift(field, $event)"
						/>
						<span v-if="isMixed(field.values)" class="multiple">Mixed</span>
						<button
							v-if="isMixed(field.values)"
							class="merge"
							type="button"
							aria-label="Merge"
							@click.stop="openMenu(field, $event)"
						>
							<Icon icon="mdi:call-merge" />
						</button>
					</div>
				</div>
			</Parameter>
		</ParameterTree>
		</ScrollArea>
		<p v-if="problem !== null" class="problem">Cannot do that: {{ problem }}</p>
		<Popover
			v-if="menu"
			:reference="menu.reference"
			:placement="menu.at"
			:open="true"
			teleport=".TqViewport"
			@update:open="$event || (menu = null)"
		>
			<Menu :items="menu.items" @close="menu = null" />
		</Popover>
	</div>
</template>

<style scoped>
.AstMultiInspector {
	display: flex;
	flex-direction: column;
	min-height: 0;
}
.doc {
	margin-bottom: var(--tq-gap-control);
	padding-inline: 3px;
	line-height: 1.4;
	color: var(--tq-color-text-mute);
}
.fields {
	display: flex;
	gap: var(--tq-gap-related);
	min-width: 0;
}
.field {
	position: relative;
	flex: 1;
	min-width: 0;
}
/* Saying only that they differ, in place of any one of them, as C4D does. */
.mixed :deep(.display-at-inactive) {
	visibility: hidden;
}
.multiple {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	overflow: hidden;
	color: var(--tq-color-text-mute);
	white-space: nowrap;
	pointer-events: none;
}
.field:has(input:focus) .multiple {
	visibility: hidden;
}
.merge {
	position: absolute;
	top: 0;
	right: 0;
	display: grid;
	place-items: center;
	width: 18px;
	height: 100%;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.merge:hover {
	color: var(--tq-color-text);
}
.problem {
	margin-top: var(--tq-gap-control);
	color: var(--tq-color-error);
}
</style>
