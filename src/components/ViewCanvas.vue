<template>
	<div ref="el" class="ViewCanvas">
		<canvas ref="canvas" class="ViewCanvas__canvas" />
	</div>
</template>

<script lang="ts" setup>
import {mat2d} from 'linearly'
import {onMounted, Ref, ref, watch} from 'vue'

import {useResizeSensor} from '@/components/use'
import {Expr, GlispError, printer} from '@/glisp'
import createCanvasRender, {
	CanvasRendererType,
} from '@/renderer/canvas-renderer'

interface Props {
	exp: Expr | null
	guideColor: string
	viewTransform: mat2d
}

const props = defineProps<Props>()

const emit = defineEmits<{
	render: [success: boolean]
}>()

let renderer: CanvasRendererType | null = null

const el: Ref<HTMLElement | null> = ref(null)
const canvas: Ref<HTMLCanvasElement | null> = ref(null)

let initialExp: Expr

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

let prevExp: Expr | undefined = undefined

async function render(_exp: Expr) {
	const options = {
		viewTransform: props.viewTransform,
		...(props.guideColor ? {guideColor: props.guideColor} : {}),
	}

	const exp = prevExp === _exp ? undefined : _exp
	prevExp = _exp

	try {
		await (renderer as CanvasRendererType).render(exp, options)
	} catch (err) {
		if (err instanceof GlispError) {
			printer.error(err.message)
		} else {
			printer.error(err)
		}
		emit('render', false)
		return
	}

	emit('render', true)
}

watch(
	() => [props.exp, props.viewTransform],
	async () => {
		if (!props.exp) {
			return
		}

		if (!renderer) {
			initialExp = props.exp
			return
		}

		const exp = props.exp

		await render(exp)
	}
)
</script>

<style lang="stylus" scoped>
.ViewCanvas
	position relative
	height 100%

	&__canvas
		width 100%
		height 100%
</style>
@/glis[/printer@/glis[/types
