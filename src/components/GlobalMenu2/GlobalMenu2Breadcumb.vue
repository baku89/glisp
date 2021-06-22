<template>
	<ul class="GlobalMenu2Breadcumbs">
		<li>
			<a href=".">Glisp</a>
		</li>
		<li v-for="(item, i) in items" :key="i">
			{{ item.label }}
		</li>
	</ul>
</template>

<script lang="ts">
import {defineComponent, PropType} from 'vue'

export default defineComponent({
	name: 'GlobalMenu2Breadcumb',
	props: {
		items: Array as PropType<{label: string; link?: string}[]>,
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.GlobalMenu2Breadcumbs
	font-title()
	margin-left 0.5em
	height 100% add-property
	line-height var(--height)
	-webkit-app-region no-drag

	li
		display inline-block
		font-size 1.2em

	li, a
		color base16('04') !important
		text-decoration none

	a
		cursor pointer

	a:hover
		border-radius $input-round
		background base16('01')

	li:not(:last-child):after
		color base16('02')
		content '>'
		font-size 0.8em
		font-monospace()
		margin 0 0.7em
</style>
