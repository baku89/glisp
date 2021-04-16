<template>
	<button class="InputSeed" @click="shuffle">
		<svg
			class="InputSeed__icon"
			viewBox="0 0 32 32"
			width="32"
			height="32"
			fill="none"
			stroke="currentcolor"
			stroke-linecap="butt"
			stroke-linejoin="miter"
			stroke-width="3"
		>
			<circle cx="16" cy="16" r="1" />
			<circle cx="10" cy="22" r="1" />
			<circle cx="22" cy="10" r="1" />
			<path
				d="M24,29H8c-2.8,0-5-2.2-5-5V8c0-2.8,2.2-5,5-5h16c2.8,0,5,2.2,5,5v16C29,26.8,26.8,29,24,29z"
			/>
		</svg>
	</button>
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
	background-size 100% 100%
	color var(--base04)
	text-align center
	line-height $button-height
	cursor pointer

	&__icon
		width 100%
		height 100%

	&:hover, &:focus
		color var(--highlight)
</style>
