<template>
	<canvas ref="canvas" />
</template>

<script lang="ts">
import _ from 'lodash'
import Regl from 'regl'
import REGL from 'regl'
import {
	computed,
	defineComponent,
	onMounted,
	onUnmounted,
	PropType,
	ref,
	watch,
} from 'vue'

import {REGL_QUAD_DEFAULT} from '@/lib/webgl'

interface UniformsProp {
	[name: string]: number[] | string
}

export default defineComponent({
	name: 'GlslCnavas',
	props: {
		fragmentString: {
			type: String,
			default: `
				precision mediump float;
				varying vec2 uv;
				void main() { gl_FragColor = vec4(uv, 0, 1); }`,
		},
		uniforms: {
			type: Object as PropType<UniformsProp>,
			default: () => ({}),
		},
	},
	setup(props) {
		const canvas = ref<null | HTMLCanvasElement>(null)

		const regl = ref<null | REGL.Regl>(null)

		onMounted(() => {
			if (!canvas.value) {
				return
			}

			regl.value = Regl({
				attributes: {
					depth: false,
					premultipliedAlpha: false,
				},
				canvas: canvas.value,
			})
		})

		onUnmounted(() => regl.value?.destroy())

		const uniformKeys = ref(_.keys(props.uniforms))

		const drawCommand = computed(() => {
			if (!regl.value) return null

			const prop = regl.value.prop as any

			const uniforms = _.fromPairs(uniformKeys.value.map(k => [k, prop(k)]))

			return regl.value({
				...REGL_QUAD_DEFAULT,
				frag: props.fragmentString,
				uniforms,
			})
		})

		watch(
			() => [regl.value, drawCommand.value, props.uniforms],
			() => {
				drawCommand.value && drawCommand.value(props.uniforms)
			}
		)

		return {canvas}
	},
})
</script>
