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
	border-radius 2px
	background var(--base04)
	color var(--background)
	font-size inherit
	input-transition(all)

	&:hover, &:focus
		background var(--highlight)
</style>
