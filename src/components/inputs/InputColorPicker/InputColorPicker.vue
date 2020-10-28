<template>
	<div class="InputColorPicker">
		<div class="InputColorPicker__sv" ref="svBoxEl">
			<button class="InputColorPicker__circle" :style="svCircleStyle" />
			<GlslCanvas
				class="InputColorPicker__sv-canvas"
				:fragmentString="HueFragmentString"
				:uniforms="svUniforms"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import chroma from 'chroma-js'
import {defineComponent, ref, watch, computed, shallowRef} from 'vue'
import SVFragmentString from './picker-sv.frag'

import Popover from '@/components/layouts/Popover.vue'
import GlslCanvas from '@/components/layouts/GlslCanvas.vue'
import useDraggable from '@/components/use/use-draggable'

export default defineComponent({
	props: {
		modelValue: {
			type: String,
			required: true,
		},
	},
	setup(props, context) {
		const chromaInstance = ref(chroma('black'))
		watch(
			() => props.modelValue,
			() => {
				if (chroma.valid(props.modelValue)) {
					chromaInstance.value = chroma(props.modelValue)
				}
			},
			{immediate: true}
		)

		const hsv = shallowRef([0, 0, 0])
		watch(
			chromaInstance,
			() => {
				const _hsv = chromaInstance.value.hsv()
				if (isNaN(_hsv[0])) {
					_hsv[0] = hsv.value[0]
				}
				hsv.value = _hsv
			},
			{immediate: true}
		)

		// SV
		const svBoxEl = ref<null | HTMLElement>(null)

		useDraggable(svBoxEl, {
			disableClick: true,
			onDrag({pos: [x, y], top, right, bottom, left}) {
				const s = (x - left) / (right - left)
				const v = 1 - (y - top) / (bottom - top)
				console.log(s, x, left, right)
				const newValue = chroma.hsv(hsv.value[0], s, v).css()
				context.emit('update:modelValue', newValue)
			},
		})

		const svCircleStyle = computed(() => {
			const [, s, v] = hsv.value
			return {
				left: `${s * 100}%`,
				top: `${(1 - v) * 100}%`,
				background: chromaInstance.value.css(),
			}
		})

		const svUniforms = computed(() => {
			return {
				hue: hsv.value[0] / 360,
			}
		})

		return {
			SVFragmentString,
			hsv,
			svBoxEl,
			svCircleStyle,
			svUniforms,
		}
	},
})
</script>