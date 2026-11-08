<script setup lang="ts">
import { type MenuItem } from 'tweeq/Menu'
import { Parameter, ParameterTree } from 'tweeq/ParameterGrid'
import { ScrollArea } from 'tweeq/ScrollArea'

import FunctionAbout from './FunctionAbout.vue'
import { MULTI_SELECT_HOST } from 'tweeq/stores/multiSelect'
import { computed, provide, ref, shallowRef } from 'vue'

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
	type MultiField,
	withValuesAt,
} from './multiRows'
import { SELECTION, type Selection, useDeleteInInspector } from './selection'

const props = defineProps<{
	document: GlispDocument
	rows: readonly string[]
	/** A function's icon, by how its head is written, over what it says of itself. */
	iconOfFunction?: (fn: string) => string | null
}>()

provide(MULTI_SELECT_HOST, multiSelectHostOf(props.document))
const selection = shallowRef<Selection | null>(null)
provide(SELECTION, selection)
useDeleteInInspector(selection)

const inspection = computed(() =>
	inspectRows(props.document.root.value, props.document.env.value, props.rows)
)

const problem = ref<string | null>(null)

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
			<Parameter v-for="arg in inspection.args" :key="arg.label" :label="arg.label" :icon="arg.icon ?? undefined">
				<div class="fields">
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
			</Parameter>
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
.problem {
	margin-top: var(--tq-gap-control);
	color: var(--tq-color-error);
}
</style>
