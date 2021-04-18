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
						:key="index"
					>
						<dt>{{ p.label }}</dt>
						<dd>
							<InputShaderSlider
								class="PageColorSpace__slider-input"
								:modelValue="color[index]"
								@update:modelValue="color[index] = $event"
								:uniforms="viewerUniforms"
								:sliderFragmentString="sliderFragmentStrings[index]"
								:knobFragmentString="solidFragmentString"
							/>
						</dd>
					</div>
				</dl>
			</div>

			<div class="PageColorSpace__update-action">
				<span class="label">Preset&nbsp;</span>
				<InputDropdown
					class="PageColorSpace__preset-dropdown"
					:modelValue="basePreset"
					:values="presetNames"
					@update:modelValue="updateColorSpace($event)"
				/>
				<InputButton label="Update Color Space" @click="updateColorSpace()" />
			</div>
		</div>

		<div class="PageColorSpace__grid">
			<h2>Color Space <small>JSON5</small></h2>
			<GlispEditor
				class="PageColorSpace__code"
				v-model="edits.colorSpace"
				lang="json"
			/>
		</div>

		<div class="PageColorSpace__grid">
			<h2>Viewer Options <small>JSON5</small></h2>
			<GlispEditor
				class="PageColorSpace__code"
				v-model="edits.viewerOptions"
				lang="json"
			/>
		</div>

		<div class="PageColorSpace__grid">
			<h2>Render Function <small>GLSL</small></h2>
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

import JSON5 from 'json5'
import {computed, defineComponent, reactive, ref, watchEffect} from 'vue'

import GlispEditor from '@/components/GlispEditor/GlispEditor.vue'
import InputButton from '@/components/inputs/InputButton.vue'
import InputDropdown from '@/components/inputs/InputDropdown.vue'
import InputShaderSlider from '@/components/inputs/InputShaderSlider.vue'
import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import useScheme from '@/components/use/use-scheme'

import Presets from './presets'

type GLSLType = 'vec4' | 'vec3' | 'vec2' | 'float'

type ColorSpaceType = {
	type: GLSLType
	name: string
	labels: string[]
}[]

type ViewerOptionsType = {
	type: 'color' | 'vec2' | 'float'
	name: string
	default: number | number[]
}[]

function getElementCountOfGLSLType(type: GLSLType) {
	return type === 'vec4' ? 4 : type === 'vec3' ? 3 : type === 'vec2' ? 2 : 1
}

function generateRandomColor(colorSpace: ColorSpaceType): number[] {
	return colorSpace.flatMap(c => {
		const count = getElementCountOfGLSLType(c.type)
		return new Array(count).fill(0).map(Math.random)
	})
}

export default defineComponent({
	name: 'PageColorSpace',
	components: {
		GlslCanvas,
		InputShaderSlider,
		GlispEditor,
		InputButton,
		InputDropdown,
	},
	setup() {
		useScheme()

		// Edits
		const edits = reactive({...Presets['RGBA']})

		const colorSpace = ref<ColorSpaceType>(JSON5.parse(edits.colorSpace))

		const color = ref(generateRandomColor(colorSpace.value))

		const colorPicker = computed(() =>
			colorSpace.value.flatMap(c =>
				c.labels.map((label, index) => ({
					label,
					accessor: c.type === 'float' ? c.name : `${c.name}[${index}]`,
				}))
			)
		)

		const viewerOptions = ref<ViewerOptionsType>(
			JSON5.parse(edits.viewerOptions)
		)

		const viewerUniforms = computed(() => {
			let offset = 0

			const colorUniforms = colorSpace.value.map(cs => {
				const uniform = `colorValue.${cs.name}`
				const count = getElementCountOfGLSLType(cs.type)
				const value = color.value.slice(offset, offset + count)

				offset += count

				return [uniform, value]
			})

			const viewerOptionsUniforms = viewerOptions.value.map(s => [
				s.name,
				s.default,
			])

			return Object.fromEntries([...colorUniforms, ...viewerOptionsUniforms])
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
					colorSpace.value.map(s => `\t${s.type} ${s.name};`).join('\n') +
					`\n};`
			),
		})

		const commonFragSnippet = computed(
			() =>
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

uniform Color colorValue;`
		)

		const renderFragmentString = ref(edits.renderFunc)

		const solidFragmentString = computed(
			() =>
				`${commonFragSnippet.value}

void main() {
	gl_FragColor = vec4(render(colorValue), 1.0);
}`
		)

		const sliderFragmentStrings = computed(() => {
			return colorPicker.value.map(
				picker =>
					`${commonFragSnippet.value}

void main() {
	Color c = colorValue;
	c.${picker.accessor} = gl_FragCoord.x / u_resolution.x;

	gl_FragColor = vec4(render(c), 1.0);
}`
			)
		})

		// Logging
		watchEffect(() => {
			const frag = solidFragmentString.value

			const fragLog = frag
				.split('\n')
				.map((l, i) => `${('   ' + i).substr(-4)}: ${l}`)
				.join('\n')

			console.log(`New Fragment shader:\n${fragLog}`)
		})

		// Actions
		const basePreset = ref('RGBA')

		const presets = reactive(Presets)

		const presetNames = computed(() => Object.keys(presets))

		function updateColorSpace(presetName?: keyof typeof presets) {
			if (presetName) {
				const preset = presets[presetName]

				edits.colorSpace = preset.colorSpace
				edits.viewerOptions = preset.viewerOptions
				edits.renderFunc = preset.renderFunc
			}

			colorSpace.value = JSON5.parse(edits.colorSpace)
			viewerOptions.value = JSON5.parse(edits.viewerOptions)
			renderFragmentString.value = edits.renderFunc

			color.value = generateRandomColor(colorSpace.value)
		}

		return {
			color,
			colorSpace,
			colorPicker,
			viewerUniforms,
			renderFragmentString,
			solidFragmentString,
			sliderFragmentStrings,

			// Edits
			edits,

			// Actions
			basePreset,
			presetNames,
			updateColorSpace,
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

	h2 > small
		color base16('03')
		vertical-align middle
		font-weight normal
		font-size 0.7em

	&__picker
		display flex

	&__pad
		width 8rem
		height 8rem
		border-radius $input-round

	&__sliders
		flex-grow 1
		margin 0 0 0 2rem

	&__grid
		padding 1.5rem

		&:nth-child(2n+1)
			border-right 1px solid $color-frame

		&:nth-child(-n + 2)
			border-bottom 1px solid $color-frame

	&__slider
		display flex
		margin-bottom $picker-gap

		& > dt
			flex-grow 0
			width 6rem

		& > dd
			flex-grow 1
			margin 0
			font-size 1.5rem

	&__update-action
		text-align right
		font-size 1.2rem

		& > .label
			color base16('03')

	&__preset-dropdown
		margin-right 1em
		width 8em

	&__code
		margin-bottom 1rem
</style>
