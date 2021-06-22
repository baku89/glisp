<template>
	<div class="PageUI">
		<GlobalMenu2>
			<template #left>
				<GlobalMenu2Breadcumb :items="[{label: 'UI'}]" />
			</template>
		</GlobalMenu2>
		<Splitpanes class="PageUI__content glisp-theme">
			<Pane>
				<section style="margin-bottom: 2em">
					<h2>Theme</h2>
					<p>
						<span style="color: base16('04')">Base theme = </span>
						<InputDropdown
							v-model="basePreset"
							:items="presetNames"
							:style="{width: '10em'}"
						>
						</InputDropdown>
						<span style="color: base16('04')">&nbsp;&nbsp;Highlight = </span>
						<InputDropdown
							v-model="baseAccentName"
							:items="['07', '08', '09', '0A', '0B', '0C', '0D', '0E', '0F']"
						>
							<template v-slot:option="{value, string}">
								<li class="style-default">
									<div
										class="PageUI__accent-preview"
										:style="{background: `rgb(var(--base${value}))`}"
									/>
									<span v-html="string" />
								</li>
							</template>
						</InputDropdown>
					</p>
				</section>
				<section style="margin-bottom: 2em">
					<PaneSchemeViewer :baseAccentName="baseAccentName" />
				</section>

				<PaneDocument />

				<!-- <section>
					<GlispEditor
						class="PageUI__glisp-editor"
						v-model="data.code"
					/>
				</section> -->
			</Pane>
			<Pane class="no-padding">
				<Tab :tabs="['inputs', 'code']" initialTab="inputs">
					<template #head-inputs>
						<SvgIcon mode="inline" style="font-size: 1.2em">
							<path
								d="M28 6 L4 6 M28 16 L4 16 M28 26 L4 26 M24 3 L24 9 M8 13 L8 19 M20 23 L20 29"
							/>
						</SvgIcon>
						Inputs
					</template>
					<template #head-code>
						<SvgIcon mode="inline" style="font-size: 1.2em">
							<path d="M10 9 L3 17 10 25 M22 9 L29 17 22 25 M18 7 L14 27" />
						</SvgIcon>
						Code
					</template>
					<template #panel-code>
						<MonacoEditor v-model="data.code" />
					</template>
					<template #panel-inputs>
						<h2>Input Components</h2>
						<dl class="PageUI__ui-list">
							<dt>String</dt>
							<dd>
								<InputString v-model="data.string" />
							</dd>
							<dt>Textarea</dt>
							<dd>
								<InputString
									v-model="data.code"
									:multiline="true"
									:monospace="true"
								/>
							</dd>
							<dt>Number</dt>
							<dd><InputNumber v-model="data.number" /></dd>
							<dt>Slider</dt>
							<dd>
								<InputSlider v-model="data.number" :min="0" :max="100" />
							</dd>
							<dt>Dropdown</dt>
							<dd>
								<InputDropdown
									v-model="data.colorSpace"
									:items="[
										{value: 'r,g,b', label: 'RGB'},
										{value: 'svh', label: 'SVH'},
										{value: 'hsv', label: 'HSV'},
										{value: 'hvs', label: 'HVS'},
										{value: 'hsvr', label: 'Radial'},
									]"
								/>
							</dd>
							<dt>Checkbox</dt>
							<dd>
								<InputCheckbox v-model="data.useAlpha" label="Use Alpha" />
							</dd>
							<dt>Radio</dt>
							<dd>
								<InputRadio
									v-model="data.align"
									:items="['left', 'center', 'right']"
									:labelize="capitalize"
								>
									<template v-slot:option="{label, value}">
										<div class="style-default">
											<SvgIcon
												mode="inline"
												style="
													font-size: 1.3em;
													margin-bottom: 0.2em;
													margin-right: 0.4em;
												"
											>
												<path
													v-if="value === 'left'"
													d="M4 8 L28 8 M4 16 L18 16 M4 24 L18 24"
												/>
												<path
													v-else-if="value === 'center'"
													d="M4 8 L28 8 M9 16 L23 16 M9 24 L23 24"
												/>
												<path
													v-else
													d="M4 8 L28 8 M14 16 L28 16 M14 24 L28 24"
												/>
											</SvgIcon>
											<span>{{ label }}</span>
										</div>
									</template>
								</InputRadio>
							</dd>
							<dt>Rotery</dt>
							<dd>
								<InputRotery v-model="angle" />
							</dd>
							<dt>Seed</dt>
							<dd>
								<InputSeed v-model="data.number" :min="0" :max="100" />
							</dd>
							<dt>Color</dt>
							<dd>
								<InputColor v-model="data.color" :pickers="colorPickers" />
							</dd>
							<dt>Translate</dt>
							<dd>
								<InputTranslate v-model="data.position" :min="0" :max="100" />
								<span class="comment" style="white-space: nowrap">
									Value: [{{ positionStr }}]
								</span>
							</dd>
							<dt>Easing</dt>
							<dd>
								<InputCubicEasing v-model="data.easing" />
							</dd>
							<dt>Button</dt>
							<dd>
								<InputButton label="Action" @click="action" />
							</dd>
						</dl>
					</template>
				</Tab>
			</Pane>
		</Splitpanes>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import _ from 'lodash'
import {Pane, Splitpanes} from 'splitpanes'
import {computed, defineComponent, reactive} from 'vue'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
// import GlispEditor from '@/components/GlispEditor'
import InputButton from '@/components/inputs/InputButton.vue'
import InputCheckbox from '@/components/inputs/InputCheckbox.vue'
import InputColor from '@/components/inputs/InputColor.vue'
import InputCubicEasing from '@/components/inputs/InputCubicEasing.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputNumber from '@/components/inputs/InputNumber.vue'
import InputRadio from '@/components/inputs/InputRadio.vue'
import InputRotery from '@/components/inputs/InputRotery.vue'
import InputSeed from '@/components/inputs/InputSeed.vue'
import InputSlider from '@/components/inputs/InputSlider.vue'
import InputString from '@/components/inputs/InputString.vue'
import InputTranslate from '@/components/inputs/InputTranslate.vue'
import MonacoEditor from '@/components/layouts/MonacoEditor'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import Tab from '@/components/layouts/Tab.vue'
import useScheme from '@/components/use/use-scheme'

import PaneDocument from './PaneDocument.vue'
import PaneSchemeViewer from './PaneSchemeViewer.vue'

export default defineComponent({
	name: 'PageUI',
	components: {
		GlobalMenu2,
		GlobalMenu2Breadcumb,
		InputNumber,
		InputDropdown,
		InputSlider,
		InputString,
		InputButton,
		InputCheckbox,
		InputRotery,
		InputSeed,
		InputRadio,
		InputTranslate,
		InputCubicEasing,
		InputColor,
		MonacoEditor,
		Pane,
		PaneDocument,
		PaneSchemeViewer,
		Splitpanes,
		SvgIcon,
		Tab,
	},
	setup() {
		const {basePreset, baseAccentName, presetNames} = useScheme()

		const data = reactive({
			string: 'Hello',
			code: `;; Glisp Code
(let #square (=> [x::Number] (* x x)::PosNumber)
     #w 20
     #c "Pink"::Color
     #p [0 0]::Color}
  (style (fill c)
    (ellipse p [(vec2/x ../center) (square w)])))`,
			number: 0,
			useAlpha: true,
			colorSpace: 'svh',
			color: 'pink',
			align: 'left',
			position: [0, 0],
			easing: [0.5, 0, 0.5, 1],
		})

		// Computed
		const angle = computed({
			get: () => (data.number / 180) * Math.PI,
			set: x => (data.number = (x / Math.PI) * 180),
		})

		const positionStr = computed(() =>
			[...data.position].map(v => v.toFixed(1)).join(', ')
		)

		const colorPickers = computed(
			() => data.colorSpace + (data.useAlpha ? ',a' : '')
		)

		function action() {
			alert('Action!')
		}

		return {
			data,
			angle,
			positionStr,
			basePreset,
			baseAccentName,
			presetNames,
			colorPickers,
			action,

			capitalize: _.capitalize,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/global.styl'
@import '~@/components/style/common.styl'

.PageUI
	app()
	display grid
	height 100vh
	grid-template-rows auto 1fr

	&__content
		overflow scroll

	&__glisp-editor
		height 4em
		border 1px solid $color-frame

	&__ui-list
		display grid
		grid-template-columns minmax(5em, min-content) 1fr
		gap $input-horiz-margin

		& > dt
			height $input-height
			color base16('04')
			line-height $input-height

		& > dd
			display flex
			align-items center
			line-height $input-height

			& > span
				margin-left 1em
				color base16('04')
				font-monospace()

	&__accent-preview
		display inline-block
		margin-right 0.4em
		width 1em
		height 1em
		border-radius $input-round
		box-shadow 0 0 0 1px base16('00')
		vertical-align middle
</style>
