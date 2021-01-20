<template>
	<div class="PageColorSpace">
		<div class="PageColorSpace__grid">
			<h2>Programmable Color Picker</h2>
			<div class="PageColorSpace__picker">
				<GlslCanvas
					class="PageColorSpace__pad"
					:fragmentString="solidFragmentString"
					:uniforms="viewerUniforms"
				/>
				<dl class="PageColorSpace__sliders">
					<div
						class="PageColorSpace__slider"
						v-for="(p, index) in colorPicker"
						:key="p.name"
					>
						<dt>{{ capital(p.name) }}</dt>
						<dd>
							<InputShaderSlider
								class="PageColorSpace__slider-input"
								v-model="colorValue[index]"
								:uniforms="viewerUniforms"
								:sliderFragmentString="sliderFragmentStrings[index]"
								:knobFragmentString="solidFragmentString"
							/>
						</dd>
					</div>
				</dl>
			</div>

			<InputButton
				label="Update Color Space"
				style="margin-left: auto; display: block; font-size: 1.2rem"
			/>
		</div>

		<div class="PageColorSpace__grid">
			<h2>Color Space</h2>
			<GlispEditor
				class="PageColorSpace__code"
				v-model="edits.colorSpace"
				lang="json"
			/>
		</div>

		<div class="PageColorSpace__grid">
			<h2>Viewer Settings</h2>
			<GlispEditor
				class="PageColorSpace__code"
				v-model="edits.viewerOptions"
				lang="json"
			/>
		</div>

		<div class="PageColorSpace__grid">
			<h2>Render Function</h2>
			<GlispEditor
				class="PageColorSpace__code"
				v-model="edits.renderFunc"
				lang="glsl"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {capital} from 'case'
import JSON5 from 'json5'
import {computed, defineComponent, reactive, ref} from 'vue'

import GlispEditor from '@/components/GlispEditor/GlispEditor.vue'
import InputButton from '@/components/inputs/InputButton.vue'
import InputShaderSlider from '@/components/inputs/InputShaderSlider.vue'
import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import useScheme from '@/components/use/use-scheme'

import {PresetRGBA} from './presets'

type ColorSpaceType = {
	type: 'vec4' | 'vec3' | 'vec2' | 'float'
	name: string
	labels: string[]
}[]

type ViewerOptionsType = {
	type: 'color' | 'vec2' | 'float'
	name: string
	default: number | number[]
}[]

export default defineComponent({
	name: 'PageColorSpace',
	components: {
		GlslCanvas,
		InputShaderSlider,
		GlispEditor,
		InputButton,
	},
	setup() {
		useScheme()

		// Edits
		const edits = reactive({...PresetRGBA})

		const colorValue = reactive([1.0, 0.7, 0.2, 0.5])

		const colorSpace = ref<ColorSpaceType>(JSON5.parse(edits.colorSpace))

		const colorPicker = computed(() =>
			colorSpace.value
				.map(c =>
					c.labels.map((label, index) => {
						return {
							label,
							accessor: c.type === 'float' ? c.name : `${c.name}[${index}]`,
						}
					})
				)
				.flat()
		)

		const viewerOptions = ref<ViewerOptionsType>(
			JSON5.parse(edits.viewerOptions)
		)

		const viewerUniforms = computed(() => {
			return {
				...Object.fromEntries(
					viewerOptions.value.map(s => [s.name, s.default])
				),
				'colorValue.rgba': colorValue,
			}
		})

		// Shader generator
		const fragSnippets = reactive({
			viewerUniforms: computed(() =>
				viewerOptions.value
					.map(s => {
						const glslType = s.type === 'color' ? 'vec3' : s.type
						return `uniform ${glslType} ${s.name};`
					})
					.join('\n')
			),
			colorStruct: computed(
				() =>
					`struct Color {\n` +
					colorSpace.value.map(s => `\t${s.type} ${s.name};\n`) +
					`};`
			),
		})

		const renderFragmentString = ref(edits.renderFunc)

		const solidFragmentString = computed(
			() =>
				`precision mediump float;

/*** Start color struct ***/
${fragSnippets.colorStruct}
/*** End color struct ***/

/*** Start viewport uniforms ***/
${fragSnippets.viewerUniforms}
/*** End viewport uniforms ***/

/*** Start render function ***/
${renderFragmentString.value}
/*** End render function ***/

uniform Color colorValue;

void main() {
	gl_FragColor = vec4(render(colorValue), 1.0);
}`
		)

		console.log(solidFragmentString.value)

		const sliderFragmentStrings = computed(() => {
			return colorPicker.value.map(
				picker =>
					`precision mediump float;

uniform vec2 u_resolution;

/*** Start color struct ***/
${fragSnippets.colorStruct}
/*** End color struct ***/

/*** Start viewport uniforms ***/
${fragSnippets.viewerUniforms}
/*** End viewport uniforms ***/

/*** Start render function ***/
${renderFragmentString.value}
/*** End render function ***/

uniform Color colorValue;

void main() {
	float t = gl_FragCoord.x / u_resolution.x;

	Color c = colorValue;
	c.${picker.accessor} = t;

	gl_FragColor = vec4(render(c), 1.0);
}`
			)
		})

		return {
			colorValue,
			colorSpace,
			colorPicker,
			viewerUniforms,
			renderFragmentString,
			solidFragmentString,
			sliderFragmentStrings,

			// Edits
			edits,

			// Util functions
			capital,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'
@import '~@/components/inputs/InputColorPicker/common.styl'

.PageColorSpace
	app()
	display grid
	overflow hidden
	height 100vh
	grid-template-rows 50vh 50vh
	grid-template-columns 50vw 50vw

	&__picker
		display flex
		align-items stretch

	&__pad
		width 8rem

	&__sliders
		flex-grow 1
		margin-left 2rem

	&__grid
		padding 1.5rem

	&__slider
		display flex
		margin-bottom $picker-gap

		& > dt
			flex-grow 0
			width 4.5rem

		& > dd
			flex-grow 1
			margin 0

	&__code
		margin-bottom 1rem
</style>
