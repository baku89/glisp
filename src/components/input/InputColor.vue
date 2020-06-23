<template>
	<div clas="InputColor">
		<input
			class="InputColor__text"
			type="text"
			:value="value"
			@input="onInputText"
			@blur="onBlurText"
		/>
		<Popper
			trigger="clickToOpen"
			:append-to-body="true"
			:options="{
				placement: 'top',
				modifiers: {offset: {offset: '0,10px'}}
			}"
		>
			<ColorPicker
				class="InputColor__picker"
				:value="value"
				@input="onInputColor"
			/>
			<button
				class="InputColor__button"
				slot="reference"
				:style="{background: value}"
			/>
		</Popper>
	</div>
</template>

<script lang="ts">
import {defineComponent, computed} from '@vue/composition-api'
import Color from 'color'
import {Chrome as ColorPicker} from 'vue-color'
import Popper from 'vue-popperjs'

export default defineComponent({
	name: 'InputColor',
	components: {
		ColorPicker,
		Popper
	},
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
			} catch (err) {
				return
			}
			context.emit('input', val)
		}

		const onBlurText = (e: InputEvent) => {
			if (e.target) {
				;(e.target as HTMLInputElement).value = props.value
			}
		}

		const onInputColor = (e: any) => {
			// const val = (e.target as HTMLInputElement).value
			context.emit('input', e.hex)
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

<style lang="stylus">
@import "../style/common.styl"

.InputColor

	&__text
		width 8em
		border none
		border-bottom 1px dashed var(--comment)
		background transparent
		color var(--syntax-string)
		font-monospace()

	&__button
		display inline
		margin-left 0.5em
		width 1.3em
		height 1.3em
		outline none
		border 0
		vertical-align bottom
		font-size inherit
		border 1px solid var(--comment)
		border-radius 50%

	&__picker
		z-index 1000
		font-family 'Fira Code', monospace !important

		.vc-chrome-body
			background-color var(--background) !important
</style>
