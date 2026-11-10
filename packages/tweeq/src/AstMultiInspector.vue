<script setup lang="ts">
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTree, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { ScrollArea } from 'tweeq/ScrollArea'

import AstMultiArgument from './AstMultiArgument.vue'
import FunctionAbout from './FunctionAbout.vue'
import { MULTI_SELECT_HOST, useMultiSelectStore } from 'tweeq/stores/multiSelect'
import { computed, nextTick, provide, ref, shallowRef, watch } from 'vue'

import { displayedAs } from './numberField'
import { type GlispDocument } from './document'
import MixedNumber from './MixedNumber.vue'
import { MERGE_LABELS, multiSelectHostOf } from './multiInputs'
import {
	extractedAt,
	inspectRows,
	isMixed,
	type Merge,
	merged,
	MERGES,
	type MultiArgument,
	type MultiField,
	nameFor,
	withValuesAt,
} from './multiRows'
import { SELECTION, type Selection, useDeleteInInspector } from './selection'

const props = defineProps<{
	document: GlispDocument
	rows: readonly string[]
	/** A function's icon, by how its head is written, over what it says of itself. */
	iconOfFunction?: (fn: string) => string | null
	/** Rows of arguments picked out elsewhere, as handles on a canvas, whose fields are then selected here. */
	picked?: readonly string[]
}>()

provide(MULTI_SELECT_HOST, multiSelectHostOf(props.document))
const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)
useDeleteInInspector(selection)

const inspection = computed(() =>
	inspectRows(props.document.root.value, props.document.env.value, props.rows)
)

/** What a field stands for: a place, or several, as a field of several rows does. */
const placesOf = (data: unknown): readonly { path: string; element: number | null }[] =>
	Array.isArray(data) ? (data as { path: string; element: number | null }[]) : data ? [data as { path: string; element: number | null }] : []
/** Whether a place is among the rows picked: as a whole, or as the one number of it that is. */
const isPicked =
	(picked: readonly string[]) =>
	({ path, element }: { path: string; element: number | null }): boolean =>
		picked.includes(path) || (element !== null && picked.includes(`${path}/${element}`))

const multiSelect = useMultiSelectStore()
// Once the fields are there to be selected, which is after what they are of has been drawn.
watch(
	() => [props.picked ?? [], inspection.value] as const,
	async ([picked], before) => {
		if (picked.length === 0 || (before && picked.join() === before[0].join() && inspection.value === before[1])) return
		// Once the fields are there to be selected, which is after what they are of has been drawn.
		await nextTick()
		// A place picked as a whole is its row, as one thing, and not each number of it as well: a
		// number is selected by itself only where that one number is what is picked.
		const rows = new Set<unknown>(inspection.value?.args.map(arg => arg.places) ?? [])
		multiSelect.selectWhere(data =>
			rows.has(data)
				? placesOf(data).length > 0 && placesOf(data).every(isPicked(picked))
				: placesOf(data).some(({ path, element }) => element !== null && picked.includes(`${path}/${element}`))
		)
	},
	{ immediate: true }
)

const problem = ref<string | null>(null)

/** Which arguments are open, each into a row for each of its numbers, by what they are called. */
const opened = ref<Record<string, boolean>>({})

function setValues(field: MultiField, values: readonly number[]): void {
	const { ast, problem: why } = withValuesAt(
		props.document.root.value,
		props.document.env.value,
		field.places,
		values
	)
	problem.value = why
	if (ast?.kind === 'let') props.document.setRoot(ast)
}

function extract(field: MultiField, how: Merge): void {
	const result = field.canExtract
		? extractedAt(
				props.document.root.value,
				props.document.env.value,
				field.places,
				merged(field.values, how),
				field.name
			)
		: null
	problem.value = result === null ? 'that cannot be pulled out from here' : null
	if (result?.ast.kind === 'let') props.document.setRoot(result.ast)
}

/** The whole of an argument, by one name, where all of the rows have the same written for it. */
function extractWhole(arg: MultiArgument): void {
	const root = props.document.root.value
	const env = props.document.env.value
	const result = arg.shared === null ? null : extractedAt(root, env, arg.places, arg.shared, nameFor(root, env, arg.places))
	problem.value = result === null ? 'that cannot be pulled out from here' : null
	if (result?.ast.kind === 'let') props.document.setRoot(result.ast)
}

/**
 * What the row of an argument offers for the whole of it. Of one number, that is what its field
 * offers, as the row and the field are the same thing; of several, it is the whole vector.
 */
const argumentItems = (arg: MultiArgument): MenuItem[] =>
	arg.fields.length === 1 && arg.fields[0]!.places.every(({ element }) => element === null)
		? extractItems(arg.fields[0]!)
		: arg.shared !== null
			? [{ label: 'Extract Parameter', icon: 'mdi:variable', perform: () => extractWhole(arg) }]
			: []

const extractItems = (field: MultiField): MenuItem[] =>
	field.canExtract
		? [
				isMixed(field.values)
					? {
							label: 'Extract Parameter',
							icon: 'mdi:variable',
							children: MERGES.map(how => ({
								label: MERGE_LABELS[how],
								perform: () => extract(field, how),
							})),
						}
					: {
							label: 'Extract Parameter',
							icon: 'mdi:variable',
							perform: () => extract(field, 'first'),
						},
			]
		: []
</script>

<template>
	<div class="AstMultiInspector" data-selects-rows>
		<ScrollArea class="tree">
		<template v-if="inspection">
		<FunctionAbout
			:label="inspection.label"
			:doc="inspection.doc"
			:icon="iconOfFunction?.(inspection.fn) ?? inspection.icon"
			:icons="inspection.heads.flatMap(head => { const icon = iconOfFunction?.(head.fn) ?? head.icon; return icon === null ? [] : [icon] })"
		/>
		<ParameterTree name="glisp.inspector" :labelWidth="110">
			<AstMultiArgument
				v-for="arg in inspection.args"
				:key="arg.label"
				:arg="arg"
				:items="argumentItems(arg)"
				:open="opened[arg.label] ?? false"
				:picked="arg.places.length > 0 && arg.places.every(isPicked(picked ?? []))"
				@update:open="opened[arg.label] = $event"
			>
				<!-- What has no numbers says what it is, and is selected and pulled out by its row. -->
				<span v-if="arg.fields.length === 0" class="summary" :class="{ mixed: arg.shared === null }">{{ arg.summary }}</span>
				<div v-else class="fields">
					<MixedNumber
						v-for="field in arg.fields"
						:key="field.name"
						v-bind="displayedAs(field.options)"
						:multiSelectData="field.places"
						:values="field.values"
						:workedOut="field.workedOut"
						:items="extractItems(field)"
						@update:values="setValues(field, $event)"
					/>
				</div>
				<!-- Each of its numbers as a row of its own, as a vector's are for one row. -->
				<template #children>
					<ParameterTreeItem
						v-for="field in arg.fields"
						:key="field.name"
						:label="field.label ?? field.name"
						:icon="field.icon ?? undefined"
					>
						<MixedNumber
							v-bind="displayedAs(field.options)"
							:multiSelectData="field.places"
							:values="field.values"
							:workedOut="field.workedOut"
							:items="extractItems(field)"
							@update:values="setValues(field, $event)"
						/>
					</ParameterTreeItem>
				</template>
			</AstMultiArgument>
		</ParameterTree>
		</template>
		<!-- What a host has to say of them too, in rows of its own. -->
		<slot />
		</ScrollArea>
		<p v-if="inspection && problem !== null" class="problem">Cannot do that: {{ problem }}</p>
	</div>
</template>

<style scoped>
.AstMultiInspector {
	display: flex;
	flex-direction: column;
	min-height: 0;
}
/* Room for the ring of a focused input, and a selected row's color, as an inspector has. */
.tree {
	margin: -1px;
	padding: 3px;
}
.fields {
	display: flex;
	gap: var(--tq-gap-related);
	min-width: 0;
}
.summary {
	overflow: hidden;
	color: var(--tq-color-text);
	text-overflow: ellipsis;
	white-space: nowrap;
}
.summary.mixed {
	color: var(--tq-color-text-mute);
}
.problem {
	margin-top: var(--tq-gap-control);
	color: var(--tq-color-error);
}
</style>
