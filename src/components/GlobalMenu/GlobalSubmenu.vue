<template>
	<div class="GlobalSubmenu">
		<div
			class="GlobalSubmenu__item"
			v-for="[label, command] in menu"
			@click="$emit('click', command)"
			:key="label"
		>
			{{ label }}
		</div>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

import {MalVal} from '@/mal/types'

export default defineComponent({
	name: 'GlobalSubmenu',
	props: {
		menu: {
			required: true,
			type: Array as PropType<[string, MalVal][]>,
		},
	},
})
</script>

<style lang="stylus" scoped>
.GlobalSubmenu
	position relative
	z-index 100
	border 1px solid $color-frame
	border-radius 0.3rem
	background var(--opaque)
	white-space nowrap
	user-select none

	&__item
		padding 0 1rem
		height 3.2rem
		border-bottom 1px dotted $color-frame
		color base16('03')
		// background red
		line-height 3.2rem
		cursor pointer

		&:hover
			color base16('accent')

		&:last-child
			border none
</style>
