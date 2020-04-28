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
			:value="inputColorValue"
			@input="onInputColor"
		/>
	</div>
</template>

<script lang="ts">
import {Component, Prop, Vue} from 'vue-property-decorator'
import Color from 'color'

@Component({
	name: 'InputColor'
})
export default class InputColor extends Vue {
	@Prop({type: String, required: true}) private value!: string

	private get inputColorValue() {
		try {
			const color = Color(this.value)
			return color.hex()
		} catch (err) {
			return 'black'
		}
	}

	onInputText(e: InputEvent) {
		const val = (e.target as HTMLInputElement).value
		try {
			Color(val)
			this.$emit('input', val)
		} catch (err) {
			return
		}
	}

	onBlurText(e: InputEvent) {
		if (e.target) {
			;(e.target as HTMLInputElement).value = this.value
		}
	}

	onInputColor(e: InputEvent) {
		const val = (e.target as HTMLInputElement).value
		this.$emit('input', val)
	}
}
</script>

<style lang="stylus" scoped>
.InputColor
	display flex

	&__text
		width 8em
		border none
		border-bottom 1px dashed var(--comment)
		background var(--background)
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
