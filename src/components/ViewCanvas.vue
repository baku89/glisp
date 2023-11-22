<template>
	<div ref="$root" class="ViewCanvas">
		<canvas ref="$canvas" class="canvas" />
	</div>
</template>

<script lang="ts" setup>
import {useElementSize} from '@vueuse/core'
import {useThemeStore} from 'tweeq'
import {computed, onMounted, Ref, ref, watch} from 'vue'

import {printer} from '@/glisp'
import createCanvasRender, {
	Canvas,
	CanvasRenderOptions,
} from '@/renderer/canvas-renderer'
import {useSketchStore} from '@/stores/sketch'
import {useViewportStore} from '@/stores/viewport'

const sketch = useSketchStore()
const viewport = useViewportStore()
const theme = useThemeStore()

const guideColor = computed(() => {
	return theme.colorPrimary
})

const renderer = ref(null) as Ref<Canvas | null>

const $root: Ref<HTMLElement | null> = ref(null)
const $canvas: Ref<HTMLCanvasElement | null> = ref(null)

const {width, height} = useElementSize($root)

onMounted(async () => {
	if (!$canvas.value || !$root.value) {
		return
	}

	renderer.value = await createCanvasRender($canvas.value)
})

watch(
	() =>
		[
			sketch.evaluated,
			viewport.transform,
			renderer.value,
			width.value,
			height.value,
		] as const,
	async ([evaluated, transform, renderer, w, h], [, , , wOld, hOld]) => {
		if (!evaluated || !renderer) {
			return
		}

		if (w !== wOld || h !== hOld) {
			const dpi = window.devicePixelRatio || 1
			await renderer.resize(w, h, dpi)
		}

		const options: CanvasRenderOptions = {
			transform,
			guideColor: guideColor.value,
		}

		try {
			await renderer.render(evaluated, options)
		} catch (err) {
			printer.error(err)
		}
	}
)
</script>

<style lang="stylus" scoped>
.ViewCanvas
	position relative
	height 100%
	pointer-events none
	z-index -10

.canvas
	width 100%
	height 100%
</style>
@/glis[/printer@/glis[/types
