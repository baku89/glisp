<script setup lang="ts">
import type { AST, Diagnostic, Env } from '@glisp/lang'
import { InputArray } from 'tweeq/InputArray'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject, ref, watch } from 'vue'

import AstInline from './AstInline.vue'
import AstNode from './AstNode.vue'
import { fitsInline, moveBetween, type Slot } from './structure'

const props = defineProps<{
	slots: readonly Slot[]
	parentPath: string
	/**
	 * The slots that can sort are a call's variadic arguments, which get a row of
	 * their own under this label, and with this to add one.
	 */
	sequence?: { readonly label: string; add(): AST }
	read: (
		ast: AST,
		env: Env
	) => { value: unknown; diagnostics: readonly Diagnostic[] }
	show: (value: unknown, env: Env) => string
}>()

/** A new parent: what an edit of one of these makes of the node holding them. */
const emit = defineEmits<{ change: [parent: AST] }>()

const sortable = computed(() => props.slots.filter(slot => slot.sort !== undefined))
const firstSortable = computed(() =>
	props.slots.findIndex(slot => slot.sort !== undefined)
)
const before = computed(() =>
	firstSortable.value < 0 ? props.slots : props.slots.slice(0, firstSortable.value)
)
const after = computed(() =>
	firstSortable.value < 0
		? []
		: props.slots.slice(firstSortable.value + sortable.value.length)
)

// A slot's key is its position, which does not follow it around. These do, so
// that a row stays open wherever it goes.
const ids: number[] = []
let nextId = 0

function keyOf(slot: Slot): string | number {
	const count = slot.sort?.count ?? 0
	while (ids.length < count) ids.push(nextId++)
	ids.length = count
	return ids[slot.sort?.index ?? 0] ?? slot.key
}

function onReorder(next: readonly Slot[]): void {
	const move = moveBetween(sortable.value, next)
	const sort = sortable.value[0]?.sort
	if (move === null || sort === undefined) return
	const [from, to] = move
	const [id] = ids.splice(from, 1)
	if (id !== undefined) ids.splice(to, 0, id)
	emit('change', sort.move(from, to))
}

// Variadic arguments sit side by side while they fit on one row, and go down the
// tree when they do not. It follows the width, unless it has been opened by hand.
const tree = inject(ParameterTreeContextKey, null)
const sequenceFits = computed(() =>
	fitsInline(sortable.value.length, tree?.valueWidth.value ?? 0)
)
const sequenceOpen = ref(!sequenceFits.value)
let openedByWidth = sequenceOpen.value
watch(sequenceFits, fits => {
	if (!fits && !sequenceOpen.value) {
		sequenceOpen.value = true
		openedByWidth = true
	} else if (fits && openedByWidth) {
		sequenceOpen.value = false
		openedByWidth = false
	}
})
function onSequenceOpen(open: boolean): void {
	sequenceOpen.value = open
	openedByWidth = false
}
const summary = computed(() => `${sortable.value.length} items`)

/** In its row of the sequence, a slot goes by its place. */
const inSequence = (slot: Slot): Slot =>
	props.sequence === undefined
		? slot
		: { ...slot, label: String(slot.sort?.index ?? 0) }

const pathOf = (slot: Slot): string =>
	props.parentPath === '' ? slot.key : `${props.parentPath}/${slot.key}`
</script>

<template>
	<AstNode
		v-for="slot in before"
		:key="slot.key"
		:entry="slot"
		:path="pathOf(slot)"
		:read="read"
		:show="show"
		@change="emit('change', $event)"
	/>
	<ParameterTreeItem
		v-if="sequence !== undefined && sortable.length > 0"
		:open="sequenceOpen"
		@update:open="onSequenceOpen"
		:label="sequence.label"
		expandable
		:addLabel="`Add ${sequence.label}`"
		@add="emit('change', sequence!.add())"
	>
		<AstInline
			v-if="!sequenceOpen && sequenceFits"
			:slots="sortable"
			:parentPath="parentPath"
			:read="read"
			:show="show"
			@change="emit('change', $event)"
		/>
		<span v-else-if="!sequenceOpen" class="summary">{{ summary }}</span>
		<template #children>
			<InputArray
				:modelValue="sortable"
				:itemKey="keyOf"
				sortable
				handleless
				@update:modelValue="onReorder"
			>
				<template #default="{ item }">
					<AstNode
						:entry="inSequence(item)"
						:path="pathOf(item)"
						:read="read"
						:show="show"
						@change="emit('change', $event)"
					/>
				</template>
			</InputArray>
		</template>
	</ParameterTreeItem>
	<InputArray
		v-else-if="sortable.length > 0"
		:modelValue="sortable"
		:itemKey="keyOf"
		sortable
		handleless
		@update:modelValue="onReorder"
	>
		<template #default="{ item }">
			<AstNode
				:entry="item"
				:path="pathOf(item)"
				:read="read"
				:show="show"
				@change="emit('change', $event)"
			/>
		</template>
	</InputArray>
	<AstNode
		v-for="slot in after"
		:key="slot.key"
		:entry="slot"
		:path="pathOf(slot)"
		:read="read"
		:show="show"
		@change="emit('change', $event)"
	/>
</template>

<style scoped>
.summary {
	line-height: var(--tq-input-height);
	color: var(--tq-color-text-mute);
}
</style>
