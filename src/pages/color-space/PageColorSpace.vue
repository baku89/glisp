<template>
	<div class="PageColorSpace"></div>
</template>

<script lang="ts">
import 'normalize.css'

import {defineComponent} from 'vue'

import useScheme from '@/components/use/use-scheme'

export default defineComponent({
	name: 'PageColorSpace',
	setup() {
		useScheme()
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'

.PageColorSpace
	app()
	overflow-x hidden
	padding 2rem 0
	height 100vh
</style>
