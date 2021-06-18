<template>
	<div class="PageIndex">
		<GlobalMenu2>
			<template #left><GlobalMenu2Breadcumb /></template>
		</GlobalMenu2>
		<main class="PageIndex__main document">
			<ul v-for="page in pages" :key="page">
				<li>
					<a :href="`${page}.html`">{{ page }}</a>
				</li>
			</ul>
		</main>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {defineComponent, ref} from 'vue'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
import useScheme from '@/components/use/use-scheme'

export default defineComponent({
	name: 'PageIndex',
	components: {
		GlobalMenu2,
		GlobalMenu2Breadcumb,
	},
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

.PageIndex
	app()
	display grid
	height 100vh
	grid-template-rows auto 1fr

	&__main
		padding 2em
</style>
