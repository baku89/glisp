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
				<dl class="PageUI__ui-list">
					<dt>String</dt>
					<dd><InputString v-model="background" /></dd>
					<dt>Number</dt>
					<dd><InputNumber v-model="inputValues.number" /></dd>
					<dt>Slider</dt>
					<dd>
						<InputSlider v-model="inputValues.number" :min="0" :max="100" />
					</dd>
					<dt>Dropdown</dt>
					<dd>
						<InputDropdown
							v-model="inputValues.dropdown"
							:values="['Apple', 'Banana', 'Orange']"
						/>
					</dd>
					<dt>Boolean</dt>
					<dd>
						<InputBoolean v-model="inputValues.boolean" label="Label" />
					</dd>
					<dt>Rotery</dt>
					<dd>
						<InputRotery v-model="inputValues.angle" />
					</dd>
					<dt>Seed</dt>
					<dd>
						<InputSeed v-model="inputValues.number" :min="0" :max="100" />
					</dd>
					<dt>Translate</dt>
					<dd>
						<InputTranslate
							v-model="inputValues.position"
							:min="0"
							:max="100"
						/>
						<span> Value: [{{ inputValues.position.join(' ') }}]</span>
					</dd>
					<dt>Button</dt>
					<dd>
						<InputButton label="Action" @click="action" />
					</dd>
				</dl>
			</section>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {computeTheme} from '@/theme'
import {computed, defineComponent, reactive, ref, watch} from 'vue'
import InputNumber from '@/components/inputs/InputNumber.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputButton from '@/components/inputs/InputButton.vue'
import InputBoolean from '@/components/inputs/InputBoolean.vue'
import InputRotery from '@/components/inputs/InputRotery.vue'
import InputSeed from '@/components/inputs/InputSeed.vue'
import InputTranslate from '@/components/inputs/InputTranslate.vue'

export default defineComponent({
	name: 'PageUI',
	components: {
		InputNumber,
		InputDropdown,
		InputSlider,
		InputString,
		InputButton,
		InputBoolean,
		InputRotery,
		InputSeed,
		InputTranslate,
	},
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
			boolean: true,
			dropdown: 'Apple',
			angle: computed({
				get: () => (inputValues.number / 180) * Math.PI,
				set: x => (inputValues.number = (x / Math.PI) * 180),
			}),
			position: [0, 0],
		}) as {
			string: string
			number: number
			dropdown: string
			boolean: boolean
			angle: number
			position: [number, number]
		}

		function action() {
			alert('Action!')
		}

		return {background, theme, inputValues, action}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/global.styl'
@import '../../components/style/common.styl'

::selection
	background var(--selection)

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

	&__ui-list
		display flex
		flex-wrap wrap

		& > dt
			padding-right 1em
			width 5.5rem
			color var(--comment)

		& > dd
			display flex
			align-items center
			margin 0
			width calc(100% - 5.5rem)

			& > span
				margin-left 1em
				color var(--comment)
				font-monospace()

		& > *
			margin-bottom $input-horiz-margin
			height $input-height
			line-height $input-height
</style>