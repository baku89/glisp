<template>
	<button
		class="InputRotery"
		:class="{dragging: drag.isDragging}"
		:style="{transform: `rotate(${value}rad)`}"
		ref="el"
	/>
</template>

<script lang="ts">
import {defineComponent, ref, Ref} from '@vue/composition-api'
import {useDraggable} from '@/components/use/'
import {vec2} from 'gl-matrix'

export default defineComponent({
	name: 'InputRotery',
	props: {
		value: {
			type: Number,
			required: true
		}
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
				const value = props.value + delta

				context.emit('input', value)
			}
		})

		return {
			el,
			drag
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.InputRotery
	position relative
	width 16px
	height 16px
	border 1px solid var(--comment)
	border-radius 50%

	&:before
		position absolute
		display block
		background var(--comment)
		content ''
		top calc(50% - 0.25px)
		left 50%
		width 50%
		height 0.5px

	&:hover, &.dragging
		background var(--comment)

		&:before
			background var(--background)
</style>
