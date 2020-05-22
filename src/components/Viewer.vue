<template>
	<div class="Viewer" ref="el">
		<canvas class="Viewer__canvas" ref="canvas" />
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	Ref,
	onMounted,
	onBeforeMount,
	watch,
	ref
} from '@vue/composition-api'
import ResizeSensor from 'resize-sensor'

import {MalVal, LispError} from '@/mal/types'
import {printer} from '@/mal/printer'
import {NonReactive} from '@/utils'
import createCanvasRender, {CanvasRendererType} from '@/renderer/CanvasRenderer'

interface Props {
	exp: NonReactive<MalVal> | null
	guideColor: string
}

function useResizeSensor(el: Ref<HTMLElement | null>, callback: () => any) {
	let sensor: any

	onMounted(() => {
		if (!el.value) return

		sensor = new ResizeSensor(el.value, callback)
	})

	onBeforeMount(() => {
		if (sensor) {
			sensor.detach()
		}
	})
}

export default defineComponent({
	props: {
		exp: {
			required: true
		},
		guideColor: {
			type: String,
			required: true
		}
	},
	setup(props: Props, context) {
		let renderer: CanvasRendererType | null = null

		const el: Ref<HTMLElement | null> = ref(null)
		const canvas: Ref<HTMLCanvasElement | null> = ref(null)

		let initialExp: MalVal

		async function onResized() {
			if (!el.value || !renderer) return

			const width = el.value.clientWidth
			const height = el.value.clientHeight
			const dpi = window.devicePixelRatio || 1
			await renderer.resize(width, height, dpi)

			context.emit('resize', [width, height])
		}

		useResizeSensor(el, onResized)

		onMounted(async () => {
			if (!canvas.value) {
				return
			}

			renderer = await createCanvasRender(canvas.value)
			onResized()
			console.log('renderer setup finished')
			if (initialExp) {
				render(initialExp)
			}
		})

		// onBeforeMount(() => {
		// 	this.renderer.dispose()
		// })

		async function render(exp: MalVal) {
			const options = {
				...(props.guideColor ? {guideColor: props.guideColor} : {})
			}
			let sidefxs

			try {
				sidefxs = await (renderer as CanvasRendererType).render(exp, options)
			} catch (err) {
				if (err instanceof LispError) {
					printer.error(err.message)
				} else {
					printer.error(err)
				}
				context.emit('render', false)
				return
			}

			for (const [cmd, params] of sidefxs) {
				switch (cmd) {
					case 'set-background':
						context.emit('set-background', params)
						break
					// case 'enable-animation': {
					// 	const check = () => {
					// 		this.renderer.isRendering
					// 			? requestAnimationFrame(check)
					// 			: this.update()
					// 	}
					// 	requestAnimationFrame(check)
					// 	break
					// }
				}
			}

			context.emit('render', true)
		}

		watch(
			() => props.exp,
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
			canvas
		}
	}
})
</script>

<style lang="stylus" scoped>
.Viewer
	position relative
	height 100%

	&__canvas
		width 100%
		height 100%
</style>
