<template>
	<div class="cubic-bezier"></div>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'

export default defineComponent({
	name: 'cubic-bezier',
	props: {
		value: {
			required: true
		}
	},
	setup(props, context) {
		return {}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.cubic-bezier
	background red
	width 100px
	height 100px
</style>
