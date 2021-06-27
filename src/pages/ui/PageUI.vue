<template>
	<div class="PageUI">
		<GlobalMenu2>
			<template #left>
				<GlobalMenu2Breadcumb :items="[{label: 'UI'}]" />
			</template>
		</GlobalMenu2>
		<SidePane uid="globalSidePane" :mainAttr="{class: 'PageUI__content'}">
			<template #main>
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
			</template>
			<template #side>
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
						<InputSchema v-model="data" :schema="schema" />
					</template>
				</Tab>
			</template>
		</SidePane>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import _ from 'lodash'
import {defineComponent, ref} from 'vue'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
// import GlispEditor from '@/components/GlispEditor'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import MonacoEditor from '@/components/layouts/MonacoEditor'
import SidePane from '@/components/layouts/SidePane.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'
import Tab from '@/components/layouts/Tab.vue'
import useScheme from '@/components/use/use-scheme'

import InputSchema from '../raster/InputSchema/InputSchema.vue'
import {Schema} from '../raster/InputSchema/type'
import PaneDocument from './PaneDocument.vue'
import PaneSchemeViewer from './PaneSchemeViewer.vue'

export default defineComponent({
	name: 'PageUI',
	components: {
		GlobalMenu2,
		GlobalMenu2Breadcumb,
		InputDropdown,
		MonacoEditor,
		PaneDocument,
		PaneSchemeViewer,
		SidePane,
		SvgIcon,
		Tab,
		InputSchema,
	},
	setup() {
		const {basePreset, baseAccentName, presetNames} = useScheme()

		const data = ref({
			string: 'Hello',
			code: `(+ 1 2)`,
			number: 0,
			angle: 0,
			boolean: true,
			colorSpace: 'svh',
			color: 'pink',
			align: 'left',
			position: [0, 0],
			easing: [0.5, 0, 0.5, 1],
			tree: {
				child1: 0,
				child2: 'Child',
			},
		})

		const schema = ref<Schema>({
			type: 'object',
			properties: {
				string: {type: 'string'},
				code: {type: 'string', multiline: true, monospace: true},
				number: {type: 'number', ui: 'slider', min: 0, max: 100},
				angle: {type: 'number', ui: 'angle'},
				boolean: {type: 'boolean'},
				color: {type: 'color'},
				tree: {
					type: 'object',
					properties: {
						child1: {type: 'number'},
						child2: {type: 'string'},
					},
					additionalProperties: {type: 'boolean'},
					required: [],
				},
			},
			required: [],
		})

		function action() {
			alert('Action!')
		}

		return {
			data,
			schema,
			basePreset,
			baseAccentName,
			presetNames,
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
		padding 1.8em

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
