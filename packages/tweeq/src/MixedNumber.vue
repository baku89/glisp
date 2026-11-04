<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { InputNumber } from 'tweeq/InputNumber'
import { type MenuItem, Menu } from 'tweeq/Menu'
import { Popover } from 'tweeq/Popover'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, shallowRef } from 'vue'

import { MERGE_LABELS } from './multiInputs'
import { isMixed, merged, MERGES, type Merge } from './multiRows'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
	/** What each of those it stands for has. */
	values: readonly number[]
	/** What else its menu offers, after merging. */
	items?: readonly MenuItem[]
}>()

const emit = defineEmits<{ 'update:values': [values: readonly number[]] }>()

const mixed = computed(() => isMixed(props.values))

/** What it shows: the one value, or if they differ, what they come to on average. */
const shown = computed(() => merged(props.values, 'ave'))

/** They go together, by as much, so that how they differ is kept. */
function shift(next: number): void {
	const by = next - shown.value
	emit(
		'update:values',
		mixed.value
			? props.values.map(value => Math.round((value + by) * 1000) / 1000)
			: props.values.map(() => next)
	)
}

function merge(how: Merge): void {
	const value = merged(props.values, how)
	emit('update:values', props.values.map(() => value))
}

const menuItems = computed<MenuItem[]>(() => [
	...(mixed.value
		? [
				{
					label: 'Merge',
					icon: 'mdi:call-merge',
					children: MERGES.map(how => ({
						label: MERGE_LABELS[how],
						perform: () => merge(how),
					})),
				},
			]
		: []),
	...(props.items ?? []),
])

const menu = shallowRef<{ at: [number, number]; reference: HTMLElement } | null>(null)

function openMenu(event: MouseEvent): void {
	if (menuItems.value.length === 0) return
	menu.value = {
		at: [event.clientX, event.clientY],
		reference: event.currentTarget as HTMLElement,
	}
}

/** How far apart they are, when asked. Rounded, as they can be as long as they like. */
const range = computed(() => {
	const short = (n: number) => Math.round(n * 100) / 100
	return `${short(Math.min(...props.values))} – ${short(Math.max(...props.values))}`
})
</script>

<template>
	<div
		v-tooltip="mixed ? range : undefined"
		class="MixedNumber"
		:class="{ mixed }"
		@contextmenu.prevent.stop="openMenu"
	>
		<InputNumber v-bind="$attrs" :modelValue="shown" @update:modelValue="shift" />
		<span v-if="mixed" class="multiple">Mixed</span>
		<button
			v-if="mixed"
			class="merge"
			type="button"
			aria-label="Merge"
			@click.stop="openMenu"
		>
			<Icon icon="mdi:call-merge" />
		</button>
		<Popover
			v-if="menu"
			:reference="menu.reference"
			:placement="menu.at"
			:open="true"
			teleport=".TqViewport"
			@update:open="$event || (menu = null)"
		>
			<Menu :items="menuItems" @close="menu = null" />
		</Popover>
	</div>
</template>

<style scoped>
.MixedNumber {
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
.MixedNumber:has(input:focus) .multiple {
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
</style>
