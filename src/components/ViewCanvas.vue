<template>
	<div class="ViewCanvas" ref="el">
		<canvas class="ViewCanvas__canvas" ref="canvas" />
	</div>
</template>

<script lang="ts">
import {defineComponent, onMounted, watch, ref, PropType, shallowRef} from 'vue'

import {MalVal, MalError} from '@/mal/types'
import {printer} from '@/mal/printer'
import createCanvasRender, {CanvasRenderer} from '@/renderer/canvas-renderer'
import {mat2d} from 'gl-matrix'
import useResizeSensor from '@/components/use/use-resize-sensor'

export default defineComponent({
	props: {
		exp: {
			type: Object as PropType<MalVal | undefined>,
			required: true,
		},
		guideColor: {
			type: String,
			required: true,
		},
		viewTransform: {
			type: Object as PropType<mat2d>,
			default: () => mat2d.identity(mat2d.create()),
		},
	},
	setup(props, context) {
		let renderer = shallowRef<CanvasRenderer | null>(null)

		const el = ref<HTMLElement | null>(null)
		const canvas = ref<HTMLCanvasElement | null>(null)

		async function updateCanvasSize(el: HTMLElement) {
			if (!renderer.value) return

			const width = el.clientWidth
			const height = el.clientHeight
			const dpi = window.devicePixelRatio || 1
			await renderer.value.resize(width, height, dpi)
		}

		useResizeSensor(el, updateCanvasSize)

		onMounted(async () => {
			if (!canvas.value || !el.value) return

			renderer.value = await createCanvasRender(canvas.value)
			updateCanvasSize(el.value)
		})

		async function render() {
			if (!renderer.value) return

			const options = {
				viewTransform: props.viewTransform,
				...(props.guideColor ? {guideColor: props.guideColor} : {}),
			}

			try {
				await renderer.value.render(props.exp, options)
			} catch (err) {
				if (err instanceof MalError) {
					printer.error(err.message)
				} else {
					printer.error(err)
				}
				context.emit('render', false)
				return
			}

			context.emit('render', true)
		}

		watch(
			() => [props.exp, props.viewTransform, renderer.value],
			async () => {
				if (!props.exp || !renderer.value) {
					return
				}

				await render()
			}
		)

		return {
			el,
			canvas,
		}
	},
})
</script>

<style lang="stylus" scoped>
.ViewCanvas
	position relative
	height 100%

	&__canvas
		width 100%
		height 100%
</style>
