<script setup lang="ts">
import { InputButton } from 'tweeq/InputButton'
import { InputColor } from 'tweeq/InputColor'
import { InputNumber } from 'tweeq/InputNumber'
import { computed } from 'vue'

import type { GlispDocument } from '@glisp/tweeq'

import { NO_PAINT, type Paint } from './graphics'
import { paintAt, withPaint } from './scene'

const props = defineProps<{
	document: GlispDocument
	/** What it paints. With several, it shows the first, and paints them all. */
	rows: readonly string[]
}>()

const paint = computed<Paint>(() => {
	const [first] = props.rows
	return first === undefined
		? NO_PAINT
		: (paintAt(props.document.root.value, props.document.env.value, first) ?? NO_PAINT)
})

function set(part: Partial<Paint>): void {
	const { root, env } = props.document
	const next = props.rows.reduce(
		(program, row) => withPaint(program, env.value, row, part),
		root.value as Parameters<typeof withPaint>[0]
	)
	if (next.kind === 'let' && next !== root.value) props.document.setRoot(next)
}

const DEFAULT_COLOR = '#000000'
const DEFAULT_WIDTH = 1
</script>

<template>
	<div class="PaintControls" data-selects-rows>
		<template v-for="kind in ['fill', 'stroke'] as const" :key="kind">
			<span class="label">{{ kind === 'fill' ? 'Fill' : 'Stroke' }}</span>
			<div class="field">
				<template v-if="paint[kind] !== 'none'">
					<InputColor
						class="color"
						:modelValue="paint[kind]"
						@update:modelValue="set({ [kind]: $event })"
					/>
					<InputNumber
						v-if="kind === 'stroke'"
						class="width"
						leftIcon="ph:line-weight"
						:modelValue="paint.width"
						:min="0"
						@update:modelValue="set({ width: $event })"
					/>
					<InputButton
						icon="mdi:close"
						subtle
						narrow
						tooltip="None"
						@click="set({ [kind]: 'none' })"
					/>
				</template>
				<InputButton
					v-else
					icon="mdi:plus"
					label="Add"
					subtle
					@click="
						set(
							kind === 'fill'
								? { fill: DEFAULT_COLOR }
								: { stroke: DEFAULT_COLOR, width: paint.width || DEFAULT_WIDTH }
						)
					"
				/>
			</div>
		</template>
	</div>
</template>

<style scoped>
.PaintControls {
	display: grid;
	grid-template-columns: 110px minmax(0, 1fr);
	gap: var(--tq-gap-related) var(--tq-gap-control);
	align-items: center;
	margin-bottom: var(--tq-gap-control);
	padding-bottom: var(--tq-gap-control);
	padding-inline: 3px;
	border-bottom: 1px solid var(--tq-color-border);
}
.label {
	color: var(--tq-color-text-mute);
}
.field {
	display: flex;
	gap: var(--tq-gap-related);
	min-width: 0;
}
.field > :deep(*) {
	min-width: 0;
}
.field > .color {
	flex: 1;
}
.field > .width {
	flex: 0 0 64px;
}
</style>
