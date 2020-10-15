<template>
	<button
		class="InputRotery"
		:class="{dragging: drag.isDragging}"
		:style="{transform: `rotate(${modelValue}rad)`}"
		ref="el"
	/>
</template>

<script lang="ts">
import {defineComponent, ref, Ref} from 'vue'
import useDraggable from '@/components/use/use-draggable'
import {vec2} from 'gl-matrix'

export default defineComponent({
	name: 'InputRotery',
	props: {
		modelValue: {
			type: Number,
			required: true,
		},
	},
	setup(props, context) {
		const el: Ref<null | HTMLElement> = ref(null)

		const drag = useDraggable(el, {
			coordinate: 'center',
			onDrag({x, y, prevX, prevY}) {
				const prevAngle = Math.atan2(prevY, prevX)

				const alignedPos = vec2.rotate(
					vec2.create(),
					[x, y] as vec2,
					[0, 0],
					-prevAngle
				)
				const delta = Math.atan2(alignedPos[1], alignedPos[0])
				const modelValue = props.modelValue + delta

				context.emit('update:modelValue', modelValue)
			},
			onDragEnd() {
				context.emit('end-tweak')
			},
		})

		return {
			el,
			drag,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputRotery
	position relative
	width $button-height
	height $button-height
	border-radius 50%
	background var(--button)

	&:before
		position absolute
		top calc(50% - 0.25px)
		left 50%
		display block
		width 50%
		height 0.5px
		background var(--background)
		content ''

	&:hover, &:focus, &.dragging
		background var(--hover)

		&:before
			background var(--background)
</style>
