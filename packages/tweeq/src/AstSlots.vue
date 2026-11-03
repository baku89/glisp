<script setup lang="ts">
import type { AST, Diagnostic, Env } from '@glisp/lang'
import { InputArray } from 'tweeq/InputArray'
import { ParameterTreeContextKey } from 'tweeq/ParameterGrid'
import { computed, inject } from 'vue'

import AstCase from './AstCase.vue'
import AstNode from './AstNode.vue'
import { fitsInline, moveBetween, type Slot } from './structure'

const props = defineProps<{
	slots: readonly Slot[]
	parentPath: string
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

const tree = inject(ParameterTreeContextKey, null)
const caseFits = computed(() => fitsInline(2, tree?.valueWidth.value ?? 0))

/** Rows in order, a case with what it comes to being one. */
const pairOf = (slots: readonly Slot[]) => {
	const rows: { slot: Slot; result?: Slot }[] = []
	for (let i = 0; i < slots.length; i++) {
		const slot = slots[i]!
		const next = slots[i + 1]
		if (slot.role === 'pattern' && next?.role === 'result' && caseFits.value) {
			rows.push({ slot, result: next })
			i++
		} else {
			rows.push({ slot })
		}
	}
	return rows
}

const pathOf = (slot: Slot): string =>
	props.parentPath === '' ? slot.key : `${props.parentPath}/${slot.key}`
</script>

<template>
	<template v-for="{ slot, result } in pairOf(before)" :key="slot.key">
		<AstCase
			v-if="result"
			:pattern="slot"
			:result="result"
			:parentPath="parentPath"
			:read="read"
			:show="show"
			@change="emit('change', $event)"
		/>
		<AstNode
			v-else
			:entry="slot"
			:path="pathOf(slot)"
			:read="read"
			:show="show"
			@change="emit('change', $event)"
		/>
	</template>
	<InputArray
		v-if="sortable.length > 0"
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
