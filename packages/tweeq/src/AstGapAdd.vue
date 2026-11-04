<script setup lang="ts">
import { Icon } from 'tweeq/Icon'

/** Adds a new one here, in a gap between rows. */
defineEmits<{ add: [] }>()
</script>

<template>
	<button
		class="AstGapAdd"
		type="button"
		aria-label="Add Here"
		@click.stop="$emit('add')"
		@dblclick.stop
		@pointerdown.stop
	>
		<Icon icon="mdi:plus" />
	</button>
</template>

<style scoped>
/* In the gap above what holds it, and there when reached for, so it moves nothing. */
.AstGapAdd {
	position: absolute;
	top: calc(var(--tq-gap-related) * -1);
	right: 0;
	left: calc((var(--depth, 0) + 1) * var(--indent, 0px));
	z-index: 2;
	height: var(--tq-gap-related);
	cursor: pointer;
	opacity: 0;
	transition: opacity var(--tq-hover-transition-duration);
}
.AstGapAdd:hover,
.AstGapAdd:focus-visible {
	opacity: 1;
}
.AstGapAdd::before {
	content: '';
	position: absolute;
	top: 50%;
	right: 0;
	left: 0;
	height: 2px;
	border-radius: 1px;
	background: var(--tq-color-text-subtle);
	transform: translateY(-50%);
}
.AstGapAdd > * {
	position: absolute;
	top: 50%;
	left: 50%;
	width: 12px;
	height: 12px;
	border-radius: 50%;
	color: var(--tq-color-background);
	background: var(--tq-color-text-subtle);
	transform: translate(-50%, -50%);
}
</style>

<style>
/* Not while something else is being done with the rows. */
.glisp-linking .AstGapAdd,
.TqParameterTree.dragging .AstGapAdd {
	display: none;
}
</style>
