<template>
	<button class="InputSeed fas fa-redo-alt" @click="shuffle" />
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'
import InputNumber from './InputNumber.vue'

export default defineComponent({
	name: 'InputSeed',
	components: {InputNumber},
	setup(prop, context) {
		function shuffle() {
			context.emit('input', Math.random())
		}

		return {
			shuffle,
		}
	},
})
</script>

<style lang="stylus">
.InputSeed
	display block
	padding 0
	width 1.4rem
	height 1.4rem
	color var(--comment)
	text-align center
	line-height 1.4rem
	cursor pointer

	&:hover, &:focus
		color var(--hover)
</style>
