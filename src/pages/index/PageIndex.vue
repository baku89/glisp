<template>
	<div class="PageIndex document">
		<h1>Glisp</h1>
		<ul v-for="page in pages" :key="page">
			<li>
				<a :href="`${page}.html`">{{ page }}</a>
			</li>
		</ul>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {defineComponent, ref} from 'vue'

import useScheme from '@/components/use/use-scheme'

export default defineComponent({
	setup() {
		useScheme()

		const pages = ref(__PAGES__)

		return {pages}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

html
	font-size 18px

.PageIndex
	app()
	padding 2rem
	min-height 100vh
</style>
