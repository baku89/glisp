<template>
	<button class="InputRotery" :class="{tweaking: drag.isDragging}" ref="el">
		<span
			class="InputRotery__body"
			:style="{transform: `rotate(${modelValue}rad)`}"
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

				const isAbsolute = Math.abs(angle - props.modelValue) < Math.PI / 4

				tweakMode.value = isAbsolute ? 'absolute' : 'relative'
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
		display block
		width 100%
		height 100%
		pointer-events none

		&:before
			position absolute
			top calc(50% - 0.25px)
			left 50%
			display block
			width 50%
			height 0.5px
			background var(--background)
			content ''

	&:hover, &:focus, &.tweaking
		background var(--hover)

		~/__body:before
			background var(--background)
</style>
