<template>
	<button class="InputSeed fas fa-redo-alt" @click="shuffle" />
</template>

<script lang="ts">
import {defineComponent} from 'vue'

export default defineComponent({
	name: 'InputSeed',
	props: {
		min: {
			type: Number,
			default: 0,
		},
		max: {
			type: Number,
			default: 1,
		},
	},
	setup(props, context) {
		function shuffle() {
			const t = Math.random()
			const {max, min} = props
			context.emit('update:modelValue', t * (max - min) + min)
		}

		return {shuffle}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputSeed
	display block
	padding 0
	width $button-height
	height $button-height
	color var(--base04)
	text-align center
	line-height $button-height
	cursor pointer

	&:hover, &:focus
		color var(--highlight)
</style>
