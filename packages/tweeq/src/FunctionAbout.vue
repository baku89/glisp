<script setup lang="ts">
import { Icon } from 'tweeq/Icon'
import { computed } from 'vue'

/** What a function is called and what it does, above its arguments. */
const props = defineProps<{
	label: string | null
	doc: string | null
	icon: string | null
	/** The icons of several functions, shown together, in place of the one. */
	icons?: readonly string[]
}>()

const shown = computed(() => (props.icons && props.icons.length > 0 ? props.icons : props.icon === null ? [] : [props.icon]))
</script>

<template>
	<div v-if="label !== null || doc !== null" class="FunctionAbout">
		<div v-if="shown.length > 0" class="icons">
			<Icon v-for="(each, i) in shown" :key="i" class="icon" :icon="each" />
		</div>
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
.icons {
	display: flex;
	flex: none;
	gap: 2px;
}
.icons > :deep(.TqIcon) {
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
