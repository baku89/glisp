<template>
	<div clas="InputColor">
		<Popper
			trigger="clickToOpen"
			:append-to-body="true"
			:delay-on-mouse-out="250"
			:options="{
				placement: 'top',
				modifiers: {offset: {offset: '0px,10px'}}
			}"
			boundaries-selector="body"
		>
			<ColorPicker class="InputColor__picker" :value="value" @input="onInput" />
			<button
				class="InputColor__button"
				slot="reference"
				:style="{background: value}"
			/>
		</Popper>
	</div>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'
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
		const onInput = (e: any) => {
			context.emit('input', e)
		}

		return {
			onInput
		}
	}
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputColor
	&__button
		display inline
		margin-left 0.5em
		width 1.3em
		height 1.3em
		outline none
		border 0
		border 1px solid var(--comment)
		border-radius 50%
		vertical-align bottom
		font-size inherit

	&__picker
		z-index 1000
		border-radius 2px
		left: 100px !important
		box-shadow 0 0 20px 0 var(--translucent) !important

		&:before
			position absolute
			top 0
			left 0
			z-index 1000
			width 100%
			height 100%
			border 1px solid var(--border)
			content ''
			pointer-events none

		.vc-chrome-body
			background-color var(--opaque) !important

		.vc-chrome-fields-wrap
			display none
</style>
