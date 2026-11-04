<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { InputGroup } from 'tweeq/InputGroup'
import { InputNumber } from 'tweeq/InputNumber'
import { computed, useTemplateRef } from 'vue'

import type { Vec } from './graphics'
import { type Dimension, placedBeside, type PlacedDimension } from './scene'

const props = defineProps<{
	placed: PlacedDimension
	room: Vec
	editing: boolean
}>()

const emit = defineEmits<{ set: [dimension: Dimension, value: number] }>()

const $root = useTemplateRef<HTMLElement>('$root')
const { width, height } = useElementSize($root, undefined, { box: 'border-box' })

/** What it is, in the one place for that: its own icon, or else how its name begins. */
const iconOf = ({ options, label }: Dimension): string =>
	options.leftIcon ?? `char:${label.charAt(0)}`

const place = computed(() => {
	const { at, side } = props.placed
	const [left, top] = placedBeside(at, side, [width.value, height.value], props.room)
	return { left: `${left}px`, top: `${top}px` }
})
</script>

<template>
	<div
		ref="$root"
		class="DimensionField"
		:class="{ editing }"
		:style="place"
	>
		<InputGroup>
			<InputNumber
				v-for="dimension in placed.dimensions"
				:key="dimension.index"
				v-bind="dimension.options"
				:title="dimension.label"
				:leftIcon="iconOf(dimension)"
				:modelValue="dimension.value"
				@update:modelValue="emit('set', dimension, $event)"
			/>
		</InputGroup>
	</div>
</template>

<style scoped>
.DimensionField {
	position: absolute;
	display: flex;
	align-items: center;
	width: max-content;
	border-radius: var(--tq-radius-input);
	/* Only the input, floating, with the paper under it to read over anything. */
	background: var(--tq-color-background);
	box-shadow: 0 1px 6px 0 var(--tq-color-shadow);
	font-size: 11px;
	pointer-events: none;
}
.DimensionField.editing {
	pointer-events: auto;
}
.DimensionField :deep(.TqInputNumber) {
	width: 84px;
}
</style>
