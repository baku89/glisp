<template>
	<div class="PageIndex">
		<AppHeader>
			<template #left><AppHeaderBreadcumb /></template>
		</AppHeader>
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

import AppHeader, {AppHeaderBreadcumb} from '@/components/AppHeader'
import useScheme from '@/components/use/use-scheme'

export default defineComponent({
	name: 'PageIndex',
	components: {
		AppHeader,
		AppHeaderBreadcumb,
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
