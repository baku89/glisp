<template>
	<div class="ViewCanvas" ref="el">
		<canvas class="ViewCanvas__canvas" ref="canvas" />
	</div>
</template>

<script lang="ts">
import {defineComponent, Ref, onMounted, watch, ref} from '@vue/composition-api'

import {MalVal, MalError} from '@/mal/types'
import {printer} from '@/mal/printer'
import {NonReactive} from '@/utils'
import createCanvasRender, {
	CanvasRendererType,
} from '@/renderer/canvas-renderer'
import {mat2d} from 'gl-matrix'
import {useResizeSensor} from '@/components/use'

interface Props {
	exp: NonReactive<MalVal> | null
	guideColor: string
	viewTransform: mat2d
}

export default defineComponent({
	props: {
		exp: {
			required: true,
		},
		guideColor: {
			type: String,
			required: true,
		},
		viewTransform: {
			default: () => mat2d.identity(mat2d.create()),
		},
	},
	setup(props: Props, context) {
		let renderer: CanvasRendererType | null = null

		const el: Ref<HTMLElement | null> = ref(null)
		const canvas: Ref<HTMLCanvasElement | null> = ref(null)

		let initialExp: MalVal

		async function onResized(el: HTMLElement) {
			if (!renderer) return

			const width = el.clientWidth
			const height = el.clientHeight
			const dpi = window.devicePixelRatio || 1
			await renderer.resize(width, height, dpi)

			if (prevExp) render(prevExp)
		}

		useResizeSensor(el, onResized)

		onMounted(async () => {
			if (!canvas.value || !el.value) {
				return
			}

			renderer = await createCanvasRender(canvas.value)
			onResized(el.value)
			if (initialExp) {
				render(initialExp)
			}
		})

		// onBeforeMount(() => {
		// 	this.renderer.dispose()
		// })

		let prevExp: MalVal | undefined = undefined

		async function render(_exp: MalVal) {
			const options = {
				viewTransform: props.viewTransform,
				...(props.guideColor ? {guideColor: props.guideColor} : {}),
			}

			const exp = prevExp === _exp ? undefined : _exp
			prevExp = _exp

			try {
				await (renderer as CanvasRendererType).render(exp, options)
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
			() => [props.exp, props.viewTransform],
			async () => {
				if (!props.exp) {
					return
				}

				if (!renderer) {
					initialExp = props.exp.value
					return
				}

				const exp = props.exp.value

				await render(exp)
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
