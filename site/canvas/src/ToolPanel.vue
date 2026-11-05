<script setup lang="ts">
import { type GlispDocument, SELECTION } from '@glisp/tweeq'
import { Icon } from 'tweeq/Icon'
import { InputCheckbox } from 'tweeq/InputCheckbox'
import { InputColor } from 'tweeq/InputColor'
import { InputNumber } from 'tweeq/InputNumber'
import { ParameterTree, ParameterTreeItem } from 'tweeq/ParameterGrid'
import { ScrollArea } from 'tweeq/ScrollArea'
import { vTooltip } from 'tweeq/Tooltip'
import { computed, provide, shallowRef } from 'vue'

import FloatPanel from './FloatPanel.vue'
import type { Paint } from './graphics'
import PaintControls from './PaintControls.vue'
import { ATTRIBUTES_OF_TOOL, PAINT_ROW, shapeAttributesOf, withAttribute, withPaintTaken } from './toolAttributes'

/**
 * What the tool in hand makes things from, over the tools. What is said here goes for what is
 * drawn from now on, and leaves what is already drawn, and the program, as they are.
 */
const props = defineProps<{
	/** Of what tools share, and not of the program. */
	document: GlispDocument
	tool: string
	label: string
	icon: string
	/** How what is selected is painted, to take for this, if one thing is. */
	paintOfSelected: Paint | null
}>()

const open = defineModel<boolean>('open', { required: true })

// What is selected in it is not selected in the program, as it is not of the program.
provide(SELECTION, shallowRef(null))

const own = computed(() => ATTRIBUTES_OF_TOOL[props.tool] ?? [])
const values = computed(() => shapeAttributesOf(props.document.root.value, props.document.env.value))

const take = (paint: Paint): void =>
	props.document.setRoot(withPaintTaken(props.document.root.value, props.document.env.value, paint))
</script>

<template>
	<FloatPanel
		v-model:open="open"
		name="glisp.canvas.tool"
		:width="280"
		label="Tool Options"
		icon="ph:palette"
		data-selects-rows
	>
		<template #header>
			<span class="title">
				<Icon class="title-icon" :icon="icon" />
				{{ label }}
			</span>
			<button
				v-if="paintOfSelected !== null"
				v-tooltip="'Take the Style of What Is Selected'"
				class="take"
				aria-label="Take the Style of What Is Selected"
				@click="take(paintOfSelected)"
			>
				<Icon icon="ph:eyedropper" />
			</button>
		</template>
		<ScrollArea>
			<ParameterTree v-if="own.length > 0" name="glisp.canvas.tool" :labelWidth="140">
				<ParameterTreeItem v-for="attribute in own" :key="attribute.name" :label="attribute.label">
					<InputCheckbox
						v-if="typeof values[attribute.name] === 'boolean'"
						:modelValue="values[attribute.name] as boolean"
						@update:modelValue="document.setRoot(withAttribute(document.root.value, attribute.name, $event))"
					/>
					<InputColor
						v-else-if="typeof values[attribute.name] === 'string'"
						alpha
						:modelValue="values[attribute.name] as string"
						@update:modelValue="document.setRoot(withAttribute(document.root.value, attribute.name, $event))"
					/>
					<InputNumber
						v-else
						:modelValue="values[attribute.name] as number"
						:min="attribute.min"
						:max="attribute.max"
						:step="attribute.step"
						@update:modelValue="document.setRoot(withAttribute(document.root.value, attribute.name, $event))"
					/>
				</ParameterTreeItem>
			</ParameterTree>
			<PaintControls treeName="glisp.canvas.tool" :labelWidth="140" :document="document" :rows="[PAINT_ROW]" />
		</ScrollArea>
	</FloatPanel>
</template>

<style scoped>
.title {
	display: flex;
	gap: 6px;
	align-items: center;
	padding-inline-start: 4px;
	font-weight: 600;
}
.title-icon {
	flex: none;
	font-size: 16px;
}
.take {
	display: grid;
	place-items: center;
	width: 24px;
	height: 24px;
	margin-inline-start: auto;
	border: none;
	border-radius: var(--tq-radius-input);
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.take:hover {
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
</style>
