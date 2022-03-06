<template>
	<div class="InputCubicBezierPicker">
		<svg viewBox="0 0 1 1" class="InputCubicBezierPicker__editor" ref="editor">
			<g>
				<line :x1="0" :y1="0" :x2="x1" :y2="y1" />
				<line :x1="1" :y1="1" :x2="x2" :y2="y2" />
				<path :d="easingPath" />
				<circle @mousedown="draggingPoint = 0" :cx="x1" :cy="y1" r=".035" />
				<circle @mousedown="draggingPoint = 1" :cx="x2" :cy="y2" r=".035" />
			</g>
		</svg>
	</div>
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import {clamp} from 'lodash'
import {computed, defineComponent, PropType, ref} from 'vue-demi'

import useDraggable from '@/components/use/use-draggable'

export default defineComponent({
	name: 'InputCubicBezierPicker',
	props: {
		modelValue: {
			type: Array as PropType<number[]>,
			required: true,
		},
	},
	emit: ['update:modelValue'],
	setup(props, context) {
		const editorEl = templateRef<HTMLElement>('editor')

		useDraggable(editorEl, {
			onDrag({pos, left, right, top, bottom}) {
				if (draggingPoint.value === null) return

				let x = (pos[0] - left) / (right - left)
				let y = 1 - (pos[1] - top) / (bottom - top)

				x = clamp(x, 0, 1)
				y = clamp(y, 0, 1)

				const newValue = [...props.modelValue]

				newValue[draggingPoint.value * 2 + 0] = x
				newValue[draggingPoint.value * 2 + 1] = y

				context.emit('update:modelValue', newValue)
			},
			onDragEnd() {
				draggingPoint.value = null
			},
		})

		const easingPath = computed(() => {
			const [x1, y1, x2, y2] = props.modelValue
			return `M 0,0 C ${x1},${y1} ${x2},${y2} 1,1`
		})

		const x1 = computed(() => props.modelValue[0])
		const y1 = computed(() => props.modelValue[1])
		const x2 = computed(() => props.modelValue[2])
		const y2 = computed(() => props.modelValue[3])

		const draggingPoint = ref<number | null>(null)

		return {easingPath, x1, y1, x2, y2, draggingPoint}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputCubicBezierPicker
	&__editor
		overflow visible
		margin 0.8em
		width calc(100% - 1.6em)

		*
			vector-effect non-scaling-stroke

		g
			transform scaleY(-1)
			transform-origin 50% 50%

		path, line, circle
			fill none
			stroke-linecap round

		path, circle
			stroke-width 2
			stroke base16('05')

		line
			stroke-width 1
			stroke base16('03')

		circle
			fill base16('00')

			&:hover
				fill base16('accent')
				stroke base16('accent')
</style>
