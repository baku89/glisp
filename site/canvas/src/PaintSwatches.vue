<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { InputColorPad } from 'tweeq/InputColor'
import { vTooltip } from 'tweeq/Tooltip'
import { ref } from 'vue'

/**
 * A fill and a line as two squares, one over the other, each a pad for its color: pressed for
 * a picker, and dragged to change it. The one last reached for is in front, and is what None
 * is about. A line is hollow, as a line is, and one that is not there has a red line through it.
 */
const props = defineProps<{
	fill: string
	stroke: string
	mixedFill?: boolean
	mixedStroke?: boolean
}>()

const emit = defineEmits<{
	'update:fill': [color: string]
	'update:stroke': [color: string]
	swap: []
}>()

const NONE = 'none'
/** What there is to start from where there is no color yet. */
const FIRST_COLOR = '#000000'

const front = ref<'fill' | 'stroke'>('fill')

const padColor = (color: string): string => (color === NONE ? FIRST_COLOR : color)
const colorStyle = (color: string) => (color === NONE ? {} : { '--color': color })

const none = (): void => {
	if (front.value === 'fill') emit('update:fill', NONE)
	else emit('update:stroke', NONE)
}
</script>

<template>
	<div class="PaintSwatches" :class="`front-${front}`">
		<div
			class="swatch fill"
			:class="{ none: fill === NONE, mixed: mixedFill }"
			:style="colorStyle(fill)"
			:title="mixedFill ? 'Fill: Mixed' : 'Fill'"
			@pointerdown.capture="front = 'fill'"
		>
			<InputColorPad
				alpha
				aria-label="Fill"
				:modelValue="padColor(fill)"
				@update:modelValue="emit('update:fill', $event)"
			>
				<span class="square" />
			</InputColorPad>
		</div>
		<div
			class="swatch stroke"
			:class="{ none: stroke === NONE, mixed: mixedStroke }"
			:style="colorStyle(stroke)"
			:title="mixedStroke ? 'Stroke: Mixed' : 'Stroke'"
			@pointerdown.capture="front = 'stroke'"
		>
			<InputColorPad
				alpha
				aria-label="Stroke"
				:modelValue="padColor(stroke)"
				@update:modelValue="emit('update:stroke', $event)"
			>
				<span class="square" />
			</InputColorPad>
		</div>
		<button
			v-tooltip="'Swap Fill and Stroke'"
			class="swap"
			aria-label="Swap Fill and Stroke"
			type="button"
			@click="emit('swap')"
		>
			<Icon icon="mdi:swap-horizontal" />
		</button>
		<button
			class="to-none"
			:title="front === 'fill' ? 'No Fill' : 'No Stroke'"
			:aria-label="front === 'fill' ? 'No Fill' : 'No Stroke'"
			type="button"
			@click="none"
		/>
	</div>
</template>

<style scoped>
.PaintSwatches {
	--size: 26px;
	--line: 7px;
	--off: 14px;
	--none: linear-gradient(
		to top right,
		transparent calc(50% - 1px),
		#e5252a calc(50% - 1px),
		#e5252a calc(50% + 1px),
		transparent calc(50% + 1px)
	);
	position: relative;
	flex: none;
	width: calc(var(--size) + var(--off));
	height: calc(var(--size) + var(--off));
}
.swatch {
	position: absolute;
	width: var(--size);
	height: var(--size);
}
.square {
	position: relative;
	display: block;
	box-sizing: border-box;
	width: var(--size);
	height: var(--size);
	border: 1px solid var(--tq-color-border);
	border-radius: 3px;
	cursor: pointer;
}
.square:hover {
	border-color: var(--tq-color-accent);
}
.fill {
	top: 0;
	left: 0;
	z-index: 1;
}
.fill .square {
	background: var(--color, white);
}
.stroke {
	right: 0;
	bottom: 0;
	z-index: 2;
}
.front-fill .fill {
	z-index: 3;
}
/* Hollow, with what is behind it seen through. */
.stroke .square::before {
	content: '';
	position: absolute;
	inset: 0;
	border: var(--line) solid var(--color, white);
	border-radius: 2px;
}
.stroke .square::after {
	content: '';
	position: absolute;
	inset: var(--line);
	border: 1px solid var(--tq-color-border);
}
.stroke.none .square {
	background: white;
}
.stroke.none .square::after {
	display: none;
}
/* From corner to corner, as it has always been said. */
.swatch.none .square::before {
	content: '';
	position: absolute;
	inset: 0;
	border: none;
	background: var(--none);
}
.fill.mixed .square,
.stroke.mixed .square::before {
	opacity: 0.6;
}
.swap,
.to-none {
	position: absolute;
	display: grid;
	place-items: center;
	padding: 0;
	cursor: pointer;
}
.swap {
	top: -1px;
	right: -1px;
	width: 14px;
	height: 14px;
	border: none;
	background: none;
	color: var(--tq-color-text-mute);
	font-size: 13px;
}
.swap:hover {
	color: var(--tq-color-accent);
}
.to-none {
	bottom: 0;
	left: 0;
	width: 11px;
	height: 11px;
	border: 1px solid var(--tq-color-border);
	background: var(--none), white;
}
.to-none:hover {
	border-color: var(--tq-color-accent);
}
</style>
