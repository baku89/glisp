<template>
	<div class="PageUI">
		<div class="PageUI__content">
			<section class="PageUI__section">
				<h2>Theme</h2>
				<p>
					<span class="comment">Base theme =</span>
					{{ schemeName }}
				</p>
				<ul class="PageUI__theme">
					<li class="b00" style="background: var(--background)">background</li>
					<li class="b00">translucent</li>
					<li style="background: var(--input)">input</li>
					<li style="background: var(--frame)">frame</li>
					<li class="dark" style="background: var(--button)">button</li>
					<li style="background: var(--comment)">comment</li>
					<li class="dark" style="background: var(--textcolor)">textcolor</li>
					<li class="dark" style="background: var(--highlight)">highlight</li>
					<li class="dark" style="background: var(--guide)">guide</li>
					<li class="dark" style="background: var(--error)">error</li>
					<li class="dark" style="background: var(--constant)">constant</li>
					<li class="dark" style="background: var(--string)">string</li>
					<li class="dark" style="background: var(--keyword)">keyword</li>
					<li class="dark" style="background: var(--function)">function</li>
				</ul>
			</section>

			<section class="PageUI__section">
				<GlispEditor class="PageUI__glisp-editor" v-model="inputValues.code" />
			</section>

			<section class="PageUI__section">
				<h2>Input Components</h2>
				<dl class="PageUI__ui-list">
					<dt>String</dt>
					<dd><InputString v-model="background" :monospace="true" /></dd>
					<dt>Number</dt>
					<dd><InputNumber v-model="inputValues.number" /></dd>
					<dt>Slider</dt>
					<dd>
						<InputSlider v-model="inputValues.number" :min="0" :max="100" />
					</dd>
					<dt>Dropdown</dt>
					<dd>
						<InputDropdown
							v-model="inputValues.colorSpace"
							:values="['r|g|b', 'svh', 'hsv', 'hvs', 'hsvr']"
							:labels="['RGB', 'SVH', 'HSV', 'HVS', 'Radial']"
						/>
					</dd>
					<dt>Boolean</dt>
					<dd>
						<InputCheckbox v-model="inputValues.useAlpha" label="Use Alpha" />
					</dd>
					<dt>Rotery</dt>
					<dd>
						<InputRotery v-model="inputValues.angle" />
					</dd>
					<dt>Seed</dt>
					<dd>
						<InputSeed v-model="inputValues.number" :min="0" :max="100" />
					</dd>
					<dt>Color</dt>
					<dd>
						<InputColor v-model="background" :pickers="colorPickers" />
					</dd>
					<dt>Translate</dt>
					<dd>
						<InputTranslate
							v-model="inputValues.position"
							:min="0"
							:max="100"
						/>
						<span class="comment">
							Value: [{{ inputValues.position.join(' ') }}]</span
						>
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

import useScheme from '@/components/use/use-scheme'

import {computed, defineComponent, reactive} from 'vue'
import GlispEditor from '@/components/GlispEditor'
import InputNumber from '@/components/inputs/InputNumber.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputButton from '@/components/inputs/InputButton.vue'
import InputCheckbox from '@/components/inputs/InputCheckbox.vue'
import InputRotery from '@/components/inputs/InputRotery.vue'
import InputSeed from '@/components/inputs/InputSeed.vue'
import InputTranslate from '@/components/inputs/InputTranslate.vue'
import InputColor from '@/components/inputs/InputColor.vue'

export default defineComponent({
	name: 'PageUI',
	components: {
		GlispEditor,
		InputNumber,
		InputDropdown,
		InputSlider,
		InputString,
		InputButton,
		InputCheckbox,
		InputRotery,
		InputSeed,
		InputTranslate,
		InputColor,
	},
	setup() {
		const {background, name: schemeName} = useScheme()

		const inputValues = reactive({
			string: 'Hello',
			code:
				';; Glisp Code\n(style (stroke "pink" 10 :cap "round")\n  (circle [0 0] 100))',
			number: 0,
			useAlpha: true,
			colorSpace: 'svh',
			angle: computed({
				get: () => (inputValues.number / 180) * Math.PI,
				set: x => (inputValues.number = (x / Math.PI) * 180),
			}),
			position: [0, 0],
		}) as {
			string: string
			number: number
			colorSpace: string
			useAlpha: boolean
			angle: number
			position: [number, number]
		}

		const colorPickers = computed(
			() => inputValues.colorSpace + (inputValues.useAlpha ? '|a' : '')
		)

		function action() {
			alert('Action!')
		}

		return {background, inputValues, action, schemeName, colorPickers}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/global.styl'
@import '../../components/style/common.styl'

.PageUI
	app()
	padding 2rem 0
	min-height 100vh

	.comment
		color var(--comment)

	&__content
		translucent-bg()
		margin 0 auto
		padding 1rem
		max-width 50rem
		border 1px solid var(--frame)

	&__section
		margin-bottom 4rem

		& > h2
			font-size 1.5rem

	&__theme
		display flex
		flex-wrap wrap
		list-style none
		gap 0.5rem

		& > li
			flex-basis calc(((100% - 1.5rem) / 4))
			padding 1rem
			height 3rem
			border-radius $border-radius
			text-align center
			line-height 1rem

			&.b00
				border 1px solid var(--frame)

			&.dark
				color var(--background)

	&__glisp-editor
		height 4em
		border 1px solid var(--frame)

	&__ui-list
		display flex
		flex-wrap wrap

		& > dt
			padding-right 1em
			width 5.5rem
			color var(--label)

		& > dd
			display flex
			align-items center
			margin 0
			width calc(100% - 5.5rem)

			& > span
				margin-left 1em
				color var(--label)
				font-monospace()

		& > *
			margin-bottom $input-horiz-margin
			height $input-height
			line-height $input-height
</style>