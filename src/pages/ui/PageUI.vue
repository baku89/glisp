<template>
	<div class="PageUI" :style="{...theme, background}">
		<div class="PageUI__content">
			<div class="PageUI__theme">This is Theme.</div>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {computeTheme} from '@/theme'
import {computed, defineComponent, ref} from 'vue'

export default defineComponent({
	name: 'PageUI',
	setup() {
		const background = ref('#f8f8f8')
		const theme = computed(() => computeTheme(background.value).colors)

		return {background, theme}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/global.styl'

.PageUI
	padding 2rem 0
	height 100vh

	&__content
		margin 0 auto
		max-width 40rem
</style>