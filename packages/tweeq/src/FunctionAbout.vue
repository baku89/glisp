<script setup lang="ts">
import { Icon } from 'tweeq/Icon'

/** What a function is called and what it does, above its arguments. */
defineProps<{
	label: string | null
	doc: string | null
	icon: string | null
}>()
</script>

<template>
	<div v-if="label !== null || doc !== null" class="FunctionAbout">
		<Icon v-if="icon !== null" class="icon" :icon="icon" />
		<div class="text">
			<p v-if="label !== null" class="label">{{ label }}</p>
			<p v-if="doc !== null" class="doc">{{ doc }}</p>
		</div>
	</div>
</template>

<style scoped>
.FunctionAbout {
	display: flex;
	gap: 8px;
	align-items: flex-start;
	/* It goes with the name above it, more than with the arguments below it. */
	margin-block: 0 14px;
	padding-inline: 3px;
}
.FunctionAbout > :deep(.TqIcon) {
	flex: none;
	width: 28px;
	height: 28px;
	font-size: 28px;
}
.text {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}
.label {
	font-weight: 600;
}
.doc {
	line-height: 1.4;
	color: var(--tq-color-text-mute);
}
</style>
