<template>
	<div clas="InputColor">
		<input
			class="InputColor__text"
			type="text"
			:value="value"
			@input="onInputText"
			@blur="onBlurText"
		/>
		<input
			class="InputColor__color"
			type="color"
			:value="hexCode"
			@input="onInputColor"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import Color from 'color'

export default defineComponent({
	name: 'InputColor',
	props: {
		value: {
			type: String,
			required: true
		}
	},
	setup(props, context) {
		const hexCode = computed(() => {
			try {
				const color = Color(props.value)
				return color.hex()
			} catch (err) {
				return 'black'
			}
		})

		const onInputText = (e: InputEvent) => {
			const val = (e.target as HTMLInputElement).value
			try {
				Color(val)
				context.emit('input', val)
			} catch (err) {
				return
			}
		}

		const onBlurText = (e: InputEvent) => {
			if (e.target) {
				;(e.target as HTMLInputElement).value = props.value
			}
		}

		const onInputColor = (e: InputEvent) => {
			const val = (e.target as HTMLInputElement).value
			context.emit('input', val)
		}

		return {
			hexCode,
			onInputText,
			onBlurText,
			onInputColor
		}
	}
})
</script>

<style lang="stylus" scoped>
.InputColor
	display flex

	&__text
		width 8em
		border none
		border-bottom 1px dashed var(--comment)
		background transparent
		color var(--green)

	&__color
		display inline-block
		margin 0
		margin-left 0.5em
		padding 0
		width 1.3em
		height 1.3em
		outline none
		border 0
		background transparent
		vertical-align bottom
		font-size inherit
		appearance none

		&::-webkit-color-swatch-wrapper
			margin 0
			padding 0
			background transparent

		&::-webkit-color-swatch
			margin 0
			padding 0
			border none
			border 1px solid var(--comment)
			border-radius 50%
</style>
