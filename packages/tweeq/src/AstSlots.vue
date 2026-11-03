<script setup lang="ts">
import type { AST, Diagnostic, Env } from '@glisp/lang'
import { InputArray } from 'tweeq/InputArray'
import { ParameterTreeContextKey, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { computed, inject } from 'vue'

import AstCase from './AstCase.vue'
import AstNode from './AstNode.vue'
import { REVEALER } from './selection'
import { fitsInline, type MissingArgument, moveBetween, type NodeView, type Slot } from './structure'

const props = defineProps<{
	slots: readonly Slot[]
	parentPath: string
	/** What can be added after these, in what holds them. */
	missing?: readonly MissingArgument[]
	append?: NodeView['append']
	/** No row at the end to add one more with, as what holds them has its own. */
	noAddRow?: boolean
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

const revealer = inject(REVEALER, null)

function revealNew(): void {
	const key = props.append?.key
	// A new binding has only a placeholder for a name.
	if (key !== undefined && revealer) {
		revealer.target.value = {
			path: props.parentPath === '' ? key : `${props.parentPath}/${key}`,
			rename: true,
		}
	}
}

function addOneMore(): void {
	if (!props.append) return
	emit('change', props.append.add())
	revealNew()
}

/** What adds a new one before `slot`, if it is one of what can grow. */
function inserterOf(slot: Slot): (() => void) | undefined {
	const { append } = props
	if (!append) return undefined
	const at = slot.key.startsWith('binding:')
		? props.slots.findIndex(other => other.key === slot.key)
		: slot.sort?.index
	if (at === undefined) return undefined
	return () => {
		// A new row has a place of its own, so that the others keep theirs.
		if (slot.sort !== undefined) ids.splice(at, 0, nextId++)
		emit('change', append.insert(at))
		revealNew()
	}
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
			:insertBefore="inserterOf(slot)"
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
				:insertBefore="inserterOf(item)"
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
	<ParameterTreeItem
		v-for="argument in missing"
		:key="`missing:${argument.name}`"
		:label="argument.name"
		icon="mdi:plus"
		@select="emit('change', argument.add())"
	/>
	<ParameterTreeItem
		v-if="append && !noAddRow"
		:label="`Add ${append.label}`"
		icon="mdi:plus"
		@select="addOneMore"
	/>
</template>
