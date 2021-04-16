<template>
	<div class="PageUI">
		<menu class="PageUI__gmenu">
			<h1 class="PageUI__gmenu-title">'(GLISP)</h1>
		</menu>
		<splitpanes class="PageUI__content glisp-theme">
			<pane>
				<h2>Theme</h2>
				<p>
					<span style="color: var(--base04)">Base theme = </span>
					<InputDropdown
						class="theme-list"
						v-model="basePreset"
						:values="presetNames"
					/>
					<span style="color: var(--base04)"> Highlight = </span>
					<InputDropdown
						class="theme-list"
						v-model="basePresetHighlight"
						:values="['07', '08', '09', '0A', '0B', '0C', '0D', '0E', '0F']"
					/>
				</p>
				<dl class="PageUI__theme">
					<div>
						<dt class="border" style="background: var(--base00)">00</dt>
						<dd>BG</dd>
					</div>
					<div>
						<dt style="background: var(--base01)">01</dt>
						<dd>Lighter BG</dd>
					</div>
					<div>
						<dt style="background: var(--base02)">02</dt>
						<dd>Selection</dd>
					</div>
					<div>
						<dt style="background: var(--base03)">03</dt>
						<dd>Comments, Invisibles, Line Highlighting</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base04)">04</dt>
						<dd>Dark FG, Status Bar</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base05)">05</dt>
						<dd>FG, Caret, Delimiters, Operators</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base06)">06</dt>
						<dd>Light FG</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--highlight)">07</dt>
						<dd>Light BG, Highlight</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base08)">08</dt>
						<dd>Variables, Deleted</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base09)">09</dt>
						<dd>Integers, Boolean, Constants</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base0A)">0A</dt>
						<dd>Classes, Markup Bold, Search Text Background</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base0B)">0B</dt>
						<dd>Strings, Inserted</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base0C)">0C</dt>
						<dd>Support, Regular Expressions, Escape Characters</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base0D)">0D</dt>
						<dd>Functions, Headings</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base0E)">0E</dt>
						<dd>Keywords, Changed</dd>
					</div>
					<div>
						<dt class="invert" style="background: var(--base0F)">0F</dt>
						<dd>Deprecated</dd>
					</div>
				</dl>

				<!-- <section>
					<GlispEditor
						class="PageUI__glisp-editor"
						v-model="inputValues.code"
					/>
				</section> -->
			</pane>
			<pane>
				<h2>Input Components</h2>
				<dl class="PageUI__ui-list">
					<dt>String</dt>
					<dd>
						<InputString v-model="inputValues.string" :monospace="true" />
					</dd>
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
						<InputColor v-model="inputValues.color" :pickers="colorPickers" />
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
			</pane>
		</splitpanes>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {Pane, Splitpanes} from 'splitpanes'
import {computed, defineComponent, reactive} from 'vue'

// import GlispEditor from '@/components/GlispEditor'
import InputButton from '@/components/inputs/InputButton.vue'
import InputCheckbox from '@/components/inputs/InputCheckbox.vue'
import InputColor from '@/components/inputs/InputColor.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputNumber from '@/components/inputs/InputNumber.vue'
import InputRotery from '@/components/inputs/InputRotery.vue'
import InputSeed from '@/components/inputs/InputSeed.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputTranslate from '@/components/inputs/InputTranslate.vue'
import useScheme from '@/components/use/use-scheme'

export default defineComponent({
	name: 'PageUI',
	components: {
		// GlispEditor,
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
		Splitpanes,
		Pane,
	},
	setup() {
		const {basePreset, basePresetHighlight, presetNames} = useScheme()

		const inputValues = reactive({
			string: 'Hello',
			code:
				';; Glisp Code\n(style (stroke "pink" 10 :cap "round")\n  (circle [0 0] 100))',
			number: 0,
			useAlpha: true,
			colorSpace: 'svh',
			color: '#ff0000',
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
			color: string
			angle: number
			position: [number, number]
		}

		const colorPickers = computed(
			() => inputValues.colorSpace + (inputValues.useAlpha ? '|a' : '')
		)

		function action() {
			alert('Action!')
		}

		return {
			inputValues,
			basePreset,
			basePresetHighlight,
			presetNames,
			colorPickers,
			action,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

$height = 3.4em

.PageUI
	app()
	display grid
	height 100vh
	grid-template-rows $height 1fr

	&__gmenu
		position relative
		display flex
		overflow visible
		height $height
		border-bottom 1px solid var(--frame)
		user-select none

		&-title
			position relative
			overflow hidden
			margin 0 0 0 0.5em
			width $height
			height $height
			background var(--base05)
			text-align center
			text-indent 10em
			font-weight normal
			font-size 1em
			mask-image embedurl('./logo.png')
			mask-size 60% 60%
			mask-repeat no-repeat
			mask-position 50% 50%

	&__content
		overflow scroll

	&__theme
		position relative
		display grid
		grid-template-columns 100%
		grid-template-rows repeat(16, 3em)
		grid-auto-flow column
		gap 0.3em

		div
			display grid
			grid-template-columns 3em 1fr

		dt
			border-radius $border-radius
			text-align center
			font-size 1.4em
			line-height: (3em / @font-size)
			font-title()

			&.border
				border 1px solid var(--frame)

			&.invert
				color var(--base00)

		dd
			padding-left 1em

	&__glisp-editor
		height 4em
		border 1px solid var(--frame)

	&__ui-list
		display flex
		flex-wrap wrap

		& > dt
			padding-right 1em
			width 5.5em
			color var(--base04)

		& > dd
			display flex
			align-items center
			width calc(100% - 5.5em)

			& > span
				margin-left 1em
				color var(--base04)
				font-monospace()

		& > *
			margin-bottom $input-horiz-margin
			height $input-height
			line-height $input-height
</style>
