<template>
	<button class="InputButton">{{ label }}</button>
</template>

<script lang="ts">
import {defineComponent} from 'vue'

export default defineComponent({
	props: {
		label: {
			type: String,
			default: '',
		},
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputButton
	padding 0 1em
	height $input-height
	border-radius $input-round
	background base16('04')
	color base16('00')
	font-size inherit
	input-transition(all)

	&:hover, &:focus
		background base16('accent')

	&:active
		background base16('06')
</style>
