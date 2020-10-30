<template>
	<div id="app">Hey</div>
</template>

<script lang="ts">
import 'normalize.css'

import useScheme from '@/components/use/use-scheme'
import {defineComponent} from 'vue'

export default defineComponent({
	setup() {
		useScheme()
	},
})
</script>

<style lang="stylus">
@import '../../components/style/common.styl'
@import '../../components/style/global.styl'
</style>