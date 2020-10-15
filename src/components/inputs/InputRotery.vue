<template>
	<button class="InputRotery" :class="{tweaking: drag.isDragging}" ref="el">
		<span
			class="InputRotery__body"
			@mouseenter="tweakMode = 'absolute'"
			@mouseleave="!drag.isDragging ? (tweakMode = 'relative') : null"
			:style="{
				transform: `rotate(${modelValue}rad)`,
				background: tweakMode === 'absolute' ? 'red !important' : 'none',
			}"
		/>
	</button>
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
	emits: ['update:modelValue', 'end-tweak'],
	setup(props, context) {
		const el: Ref<null | HTMLElement> = ref(null)

		const tweakMode = ref<'relative' | 'absolute'>('relative')

		const drag = useDraggable(el, {
			coordinate: 'center',
			disableClick: true,
			onDragStart({pos}) {
				const angle = Math.atan2(pos[1], pos[0])
			},
			onDrag({pos, prevPos}) {
				let newValue: number

				if (tweakMode.value === 'relative') {
					// Relative
					const prevAngle = Math.atan2(prevPos[1], prevPos[0])
					const alignedPos = vec2.rotate(vec2.create(), pos, [0, 0], -prevAngle)
					const delta = Math.atan2(alignedPos[1], alignedPos[0])
					newValue = props.modelValue + delta
				} else {
					// Absolute
					newValue = Math.atan2(pos[1], pos[0])
				}
				context.emit('update:modelValue', newValue)
			},
			onDragEnd() {
				tweakMode.value = 'relative'
				context.emit('end-tweak')
			},
		})

		return {
			el,
			drag,
			tweakMode,
		}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputRotery
	position relative
	overflow hidden
	padding 0
	width $button-height
	height $button-height
	border-radius 50%
	background var(--button)
	transition all 0.1s cubic-bezier(0.25, 0.1, 0, 1)

	&:hover, &.tweaking
		opacity 0.8
		transform scale(3)

	&__body
		position absolute
		top 30%
		left 50%
		display block
		width 52%
		height 40%
		border-radius 50% 0 0 50%
		background rgba(0, 0, 255, 0.1)
		transform-origin 0 50%

		// pointer-events none
		&:before
			position absolute
			top calc(50% - 0.25px)
			left 0
			display block
			width 100%
			height 0.5px
			background var(--background)
			content ''
			pointer-events none

	&:hover, &:focus, &.tweaking
		background var(--hover)

		~/__body:before
			background var(--background)
</style>
