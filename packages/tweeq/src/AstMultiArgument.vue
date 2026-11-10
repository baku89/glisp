<script setup lang="ts">
import { type MenuItem } from 'tweeq/Menu'
import { ParameterTreeItem } from 'tweeq/ParameterGrid'
import { useMultiSelectStore } from 'tweeq/stores/multiSelect'
import { computed, onMounted, ref, shallowRef, useTemplateRef } from 'vue'

import { type MultiArgument } from './multiRows'

/**
 * An argument that several rows have, as a row of the tree: selected, it is the whole of that
 * argument in each of them, as a row of one is in an inspector. Where it is one number, that is
 * the same as its field; where it is several, as a place is, each field is one of them.
 */
const props = defineProps<{
	arg: MultiArgument
	/** What its menu offers for the whole of it. */
	items?: readonly MenuItem[]
	/** Picked out elsewhere in each of the rows, as the points chosen on a canvas are. */
	picked?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const $mark = useTemplateRef<HTMLElement>('$mark')
const $row = shallowRef<HTMLElement | null>(null)
onMounted(() => {
	$row.value = ($mark.value?.closest('.TqParameterTreeItem') as HTMLElement | null) ?? null
})

const whole = useMultiSelectStore().register({
	type: 'opaque',
	whole: true,
	el: $row,
	focusing: ref(false),
	data: computed(() => props.arg.places),
	getValue: () => '',
	setValue: () => {},
	confirm: () => {},
})
</script>

<template>
	<ParameterTreeItem
		:label="arg.label"
		:icon="arg.icon ?? undefined"
		:expandable="arg.fields.length > 1"
		:selected="picked || (whole.selected && whole.multiSelected)"
		:menuItems="items && items.length > 0 ? [...items] : undefined"
		v-model:open="open"
	>
		<template #labelEnd><span ref="$mark" class="mark" /></template>
		<slot />
		<template #children><slot name="children" /></template>
	</ParameterTreeItem>
</template>

<style scoped>
.mark {
	display: none;
}
</style>
