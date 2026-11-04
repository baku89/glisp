<script setup lang="ts">
/** Where a color would be, saying that there is none, and a button to give it one. */
defineProps<{ label: string }>()
</script>

<template>
	<button class="NoPaint" type="button" :aria-label="`Add ${label}`">
		<span class="none">None</span>
		<span class="add">Add {{ label }}</span>
	</button>
</template>

<style scoped>
.NoPaint {
	display: grid;
	place-items: center;
	box-sizing: border-box;
	width: 100%;
	height: var(--tq-input-height);
	padding: 0;
	border: 1px dashed var(--tq-color-border);
	border-radius: var(--tq-radius-input);
	background: none;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.add {
	display: none;
}
.NoPaint:hover,
.NoPaint:focus-visible {
	border-color: transparent;
	background: var(--tq-color-input-hover);
	color: var(--tq-color-text);
}
.NoPaint:hover .none,
.NoPaint:focus-visible .none {
	display: none;
}
.NoPaint:hover .add,
.NoPaint:focus-visible .add {
	display: inline;
}
</style>
