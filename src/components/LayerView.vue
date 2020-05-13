<template>
	<div class="LayerView"></div>
</template>

<script lang="ts">
import {defineComponent} from '@vue/composition-api'
import {NonReactive} from '../utils'

export default defineComponent({
	props: {
		exp: {
			type: NonReactive,
			required: true
		}
	},
	setup(props, context) {
		return {}
	}
})
</script>

<style lang="stylus" scoped></style>
