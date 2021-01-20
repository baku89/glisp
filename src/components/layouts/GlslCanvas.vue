<template>
	<canvas ref="canvasEl" />
</template>

<script lang="ts">
import {Canvas} from 'glsl-canvas-js'
import {
	defineComponent,
	onMounted,
	onUnmounted,
	PropType,
	ref,
	watchEffect,
} from 'vue'

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
				uniform vec2 u_resolution; 
				void main() {
					vec2 uv = gl_FragCoord.xy / u_resolution;
					gl_FragColor = vec4(uv, 0.0, 1.0);
				}`,
		},
		uniforms: {
			type: Object as PropType<UniformsProp>,
			default: () => ({}),
		},
	},
	setup(props) {
		const canvasEl = ref<null | HTMLCanvasElement>(null)

		let glsl: typeof Canvas

		onMounted(() => {
			if (!canvasEl.value) return

			glsl = new Canvas(canvasEl.value, {
				fragmentString: props.fragmentString,
				alpha: true,
			})

			watchEffect(() => {
				glsl.setUniforms(props.uniforms)
				glsl.render()
			})
		})

		onUnmounted(() => {
			glsl?.destroy()
		})

		return {canvasEl}
	},
})
</script>
