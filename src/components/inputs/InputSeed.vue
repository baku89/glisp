<template>
	<button class="InputSeed fas fa-redo-alt" @click="shuffle" />
</template>

<script lang="ts">
import {defineComponent} from 'vue'

export default defineComponent({
	name: 'InputSeed',
	setup(prop, context) {
		function shuffle() {
			context.emit('input', Math.random())
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
	color var(--button)
	text-align center
	line-height $button-height
	cursor pointer

	&:hover, &:focus
		color var(--hover)
</style>
