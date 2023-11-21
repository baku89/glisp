<template>
	<button
		ref="el"
		class="InputTranslate"
		:class="{dragging: drag.isDragging}"
		@keydown="onKeydown"
	/>
</template>

<script lang="ts" setup>
import keycode from 'keycode'
import {vec2} from 'linearly'
import {Ref, ref} from 'vue'

import {useDraggable} from '@/components/use/'

const ARROW_KEYS = new Set(['up', 'down', 'left', 'right'])

interface Props {
	value: vec2
}

const props = defineProps<Props>()

const emit = defineEmits<{
	input: [value: vec2]
	'end-tweak': []
}>()

const el: Ref<null | HTMLElement> = ref(null)

function update(deltaX: number, deltaY: number) {
	const newValue = vec2.add(props.value, [deltaX, deltaY])
	emit('input', newValue)
}

const drag = useDraggable(el, {
	onDrag({isDragging, deltaX, deltaY}) {
		if (!isDragging) return

		update(deltaX, deltaY)
	},
	onDragEnd() {
		emit('end-tweak')
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
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputTranslate
	position relative
	width $button-height
	height @width !important
	border-radius 2px
	background var(--button)
	input-transition(background)

	&:focus
		background var(--hover)

	&:hover, &.dragging
		background var(--hover)

	&:before, &:after
		position absolute
		display block
		background var(--background) !important
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
