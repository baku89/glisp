<template>
	<i class="InputSeed fas fa-redo-alt" @click="shuffle" />
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
			shuffle
		}
	}
})
</script>

<style lang="stylus">
.InputSeed
	display block
	width 16px
	height 16px
	color var(--comment)
	text-align center
	line-height 16px
	cursor pointer

	&:hover
		color var(--hover)
</style>
