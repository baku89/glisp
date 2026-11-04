<script setup lang="ts">
import { Icon } from 'tweeq/Icon'

import type { Crumb } from './rows'

defineProps<{
	/** The rows gone through to what is being edited, the last being that. */
	crumbs: readonly Crumb[]
}>()

const emit = defineEmits<{
	/** One level out, or out altogether from the first. */
	back: []
	/** Back out to one of `crumbs`. */
	go: [index: number]
}>()
</script>

<template>
	<nav class="IsolationBar" aria-label="Isolated">
		<button class="back" type="button" title="Back One Level" @click="emit('back')">
			<Icon icon="mdi:arrow-left" />
		</button>
		<template v-for="(crumb, i) in crumbs" :key="crumb.row">
			<Icon v-if="i > 0" class="between" icon="mdi:chevron-right" />
			<button
				class="crumb"
				type="button"
				:disabled="i === crumbs.length - 1"
				:title="crumb.label"
				@click="emit('go', i)"
			>
				{{ crumb.label }}
			</button>
		</template>
	</nav>
</template>

<style scoped>
.IsolationBar {
	position: absolute;
	top: 8px;
	left: 50%;
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 2px;
	max-width: min(50%, calc(100% - 640px));
	min-width: 160px;
	padding: 2px 10px 2px 2px;
	translate: -50% 0;
	overflow: hidden;
	color: #fff;
	white-space: nowrap;
	background: var(--tq-color-accent);
	border-radius: 999px;
	box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}
button {
	color: inherit;
	font: inherit;
	background: none;
	border: none;
	border-radius: 999px;
	cursor: pointer;
}
button:not(:disabled):hover {
	background: rgb(255 255 255 / 0.2);
}
.back {
	display: grid;
	flex: none;
	place-items: center;
	width: 24px;
	height: 24px;
	padding: 0;
}
.between {
	flex: none;
	opacity: 0.7;
}
.crumb {
	min-width: 0;
	padding: 2px 6px;
	overflow: hidden;
	text-overflow: ellipsis;
}
.crumb:disabled {
	flex: none;
	font-weight: bold;
	cursor: default;
}
</style>
