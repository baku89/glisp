<template>
	<button class="InputSeed fas fa-redo-alt" @click="shuffle" />
</template>

<script lang="ts" setup>
const emit = defineEmits<{
	input: [value: number]
}>()

function shuffle() {
	emit('input', Math.random())
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputSeed
	display block
	padding 0
	width $button-height
	height $button-height
	color var(--button)
	text-align center
	line-height $button-height
	cursor pointer

	&:hover, &:focus
		color var(--hover)
</style>
