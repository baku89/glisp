<template>
	<div class="PageUI" :style="{...theme.colors, background}">
		<div class="PageUI__content">
			<section class="PageUI__section">
				<h2>Theme</h2>
				<ui class="PageUI__theme">
					<li
						style="
							background: var(--background);
							border: 1px solid var(--border);
						"
					>
						BG
					</li>
					<li style="background: var(--foreground); color: var(--background)">
						FG
					</li>
					<li style="background: var(--currentline)">Current Line</li>
					<li style="background: var(--selection)">Selection</li>
					<li style="background: var(--red)">Red</li>
					<li style="background: var(--orange)">Orange</li>
					<li style="background: var(--yellow)">Yellow</li>
					<li style="background: var(--green)">Green</li>
					<li style="background: var(--aqua)">Aqua</li>
					<li style="background: var(--blue)">Blue</li>
					<li style="background: var(--purple)">Purple</li>
				</ui>
			</section>

			<section class="PageUI__section">
				<h2>Input Components</h2>
				<div class="PageUI__ui-list">
					<InputString v-model="background" />
					<InputNumber v-model="inputValues.number" />
					<InputSlider v-model="inputValues.number" :min="0" :max="100" />
				</div>
			</section>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {computeTheme} from '@/theme'
import {defineComponent, reactive, ref, watch} from 'vue'
import InputNumber from '@/components/inputs/InputNumber.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import InputString from '@/components/inputs/InputString.vue'

export default defineComponent({
	name: 'PageUI',
	components: {InputNumber, InputSlider, InputString},
	setup() {
		const background = ref('#f8f8f8')
		const theme = ref(computeTheme(background.value))

		watch(background, () => {
			const ret = computeTheme(background.value)
			if (ret) {
				theme.value = ret
			}
		})

		const inputValues = reactive({
			string: 'Hello',
			number: 0,
		})

		return {background, theme, inputValues}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/global.styl'
@import '../../components/style/common.styl'

.PageUI
	padding 2rem 0
	height 100vh
	color var(--foreground)

	&__content
		translucent-bg()
		margin 0 auto
		padding 1rem
		max-width 50rem

	&__section
		margin-bottom 4rem

		& > h2
			font-size 1.5rem

	&__theme
		display flex
		flex-wrap wrap
		list-style none
		gap 1rem

		& > li
			flex-basis calc(((100% - 3rem) / 4))
			padding 1rem
			height 4rem
			border-radius $border-radius
			text-align center
			line-height 2rem

	&__ui-list > *
		margin-bottom $input-horiz-margin
</style>