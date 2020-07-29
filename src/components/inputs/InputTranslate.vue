<template>
	<button
		class="InputTranslate"
		:class="{dragging: drag.isDragging}"
		ref="el"
	/>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, PropType} from '@vue/composition-api'
import {useDraggable} from '@/components/use/'
import {vec2} from 'gl-matrix'

export default defineComponent({
	name: 'InputTranslate',
	props: {
		value: {
			type: [Array, Float32Array] as PropType<number[] | Float32Array>,
			required: true,
		},
	},
	setup(props, context) {
		const el: Ref<null | HTMLElement> = ref(null)

		const drag = useDraggable(el, {
			onDrag({isDragging, deltaX, deltaY}) {
				if (!isDragging) return

				const newValue = vec2.fromValues(props.value[0], props.value[1])

				newValue[0] += deltaX
				newValue[1] += deltaY

				context.emit('input', newValue)
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

.InputTranslate
	position relative
	margin-left 0.5rem
	width 1.2rem
	height @width !important
	border 1px solid var(--comment)
	border-radius 2px

	&:hover, &.dragging
		background var(--comment)

		&:before, &:after
			background var(--background)

	&:before, &:after
		position absolute
		display block
		background var(--comment)
		content ''
		transform translate(-50%, -50%)

	&:before
		top 50%
		left 50%
		width 7px
		height 1px

	&:after
		top 50%
		left 50%
		width 1px
		height 7px
</style>
