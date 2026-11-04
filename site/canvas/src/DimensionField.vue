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
	/** What comes of typing something other than a number, and what is wrong with it. */
	expression: (dimension: Dimension, text: string) => string | null
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
				:class="{ expression: dimension.expression }"
				:expression="text => expression(dimension, text)"
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
/* As it is in the inspector, as a parameter driven by an expression is in After Effects. */
.DimensionField :deep(.expression) {
	--tq-color-text: var(--tq-color-info);
	--tq-color-input: var(--tq-color-info-soft);
	--tq-color-input-hover: var(--tq-color-info-soft);
	--tq-color-accent: var(--tq-color-info);
	--tq-color-accent-hover: var(--tq-color-info);
}
/* One bar, as a gap between them would show the paper as a line of its own. */
.DimensionField :deep(.TqInputGroup) {
	gap: 0;
}
.DimensionField :deep(.TqInputNumber) {
	width: 84px;
}
</style>
