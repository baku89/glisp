<template>
	<svg
		class="SvgIcon"
		:class="{inline: mode === 'inline', block: mode === 'block'}"
		viewBox="0 0 32 32"
		width="32"
		height="32"
	>
		<slot />
	</svg>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

export default defineComponent({
	name: 'SvgIcon',
	props: {
		mode: {
			type: String as PropType<'inline' | 'block'>,
			default: 'inline',
		},
	},
})
</script>

<style lang="stylus">
.SvgIcon
	fill none
	stroke currentcolor
	stroke-linecap butt
	stroke-linejoin miter
	stroke-width 2

	&.inline
		display inline-block
		width 1em
		height 1em
		vertical-align middle

	&.block
		display block
</style>
