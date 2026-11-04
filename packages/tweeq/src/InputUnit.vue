<script setup lang="ts">
import { InputTextBase } from 'tweeq/InputTextBase'
import { type MenuItem } from 'tweeq/Menu'

defineProps<{
	menuItems?: MenuItem[]
	inlinePosition?: 'start' | 'middle' | 'end'
}>()

/** There is nothing to edit but what it is written as. */
defineEmits<{ edit: [] }>()
</script>

<template>
	<!-- Nothing, which fits any slot by turning into what that wants: an empty mold. -->
	<InputTextBase
		class="InputUnit"
		modelValue="()"
		ignoreInput
		font="monospace"
		align="center"
		:menuItems="menuItems"
		:inlinePosition="inlinePosition"
		@click="$emit('edit')"
		@focus="$emit('edit')"
	>
		<template #inactiveContent>
			<span class="shown">()</span>
		</template>
	</InputTextBase>
</template>

<style scoped>
.InputUnit {
	color: var(--tq-color-text-mute);
	background: repeating-linear-gradient(
		-45deg,
		transparent 0 3px,
		color-mix(in srgb, currentColor 14%, transparent) 3px 4px
	);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 30%, transparent);
	cursor: text;
}
.InputUnit:hover {
	box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 60%, transparent);
}
.shown {
	display: block;
	line-height: var(--tq-input-height);
	color: currentColor;
	pointer-events: none;
}
</style>
