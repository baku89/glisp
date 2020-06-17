<template>
	<div class="InputSeed">
		<InputNumber class="InputSeed__el" :value="value" @input="onInput" />
		<button class="InputSeed__shuffle" @click="shuffle">
			<i class="fas fa-redo-alt" />
		</button>
	</div>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'
import InputNumber from './InputNumber.vue'

export default defineComponent({
	name: 'InputSeed',
	components: {InputNumber},
	props: {
		value: {
			type: Number,
			required: true
		}
	},
	setup(prop, context) {
		function onInput(value: number) {
			context.emit('input', value)
		}

		function shuffle() {
			onInput(Math.random())
		}

		return {
			onInput,
			shuffle
		}
	}
})
</script>

<style lang="stylus" scoped>
@import './common.styl'

.InputSeed
	display flex
	align-items center
	line-height $input-height

	&__el
		margin-right 0.5em

		&:last-child
			margin-right 0

	&__shuffle
		position relative
		margin-left 0
		width 16px
		height 16px

		.fas
			position absolute
			top 0
			left 0
			display block
			width 100%
			height 100%
			color var(--comment)
			text-align center
			line-height 16px

			&:hover
				color var(--selection)
</style>
