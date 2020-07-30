<template>
	<button
		class="InputTranslate"
		:class="{dragging: drag.isDragging}"
		ref="el"
		@keydown="onKeydown"
	/>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, PropType} from '@vue/composition-api'
import {useDraggable} from '@/components/use/'
import {vec2} from 'gl-matrix'
import keycode from 'keycode'

const ARROW_KEYS = new Set(['up', 'down', 'left', 'right'])

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

		function update(deltaX: number, deltaY: number) {
			const newValue = vec2.fromValues(props.value[0], props.value[1])

			newValue[0] += deltaX
			newValue[1] += deltaY

			context.emit('input', newValue)
		}

		const drag = useDraggable(el, {
			onDrag({isDragging, deltaX, deltaY}) {
				if (!isDragging) return

				update(deltaX, deltaY)
			},
			onDragEnd() {
				context.emit('end-tweak')
			},
		})

		function onKeydown(e: KeyboardEvent) {
			const key = keycode(e)

			if (ARROW_KEYS.has(key)) {
				e.preventDefault()

				let inc = 1
				if (e.altKey) {
					inc = 0.1
				} else if (e.shiftKey) {
					inc = 10
				}

				switch (key) {
					case 'left':
						update(-inc, 0)
						break
					case 'right':
						update(inc, 0)
						break
					case 'up':
						update(0, -inc)
						break
					case 'down':
						update(0, inc)
				}
			}
		}

		return {
			el,
			drag,
			onKeydown,
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

	&:focus
		border-color var(--highlight)

		&:before, &:after
			background var(--highlight)

	&:hover, &.dragging
		background var(--highlight)
		border-color var(--highlight)

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
