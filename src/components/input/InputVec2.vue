<template>
	<div class="InputVec2">
		[
		<InputNumber class="InputVec2__el" :value="value[0]" @input="onInput(0, $event)" />
		<InputNumber class="InputVec2__el" :value="value[1]" @input="onInput(1, $event)" />]
		<button class="InputVec2__drag" :class="{dragging: drag.isDragging}" ref="dragEl" />
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	computed,
	onBeforeUnmount,
	onMounted,
	ref,
	Ref,
	watch,
	reactive
} from '@vue/composition-api'
import {createMalVector, markMalVector} from '@/mal/types'
import InputNumber from './InputNumber.vue'

interface Props {
	value: [number, number]
}

function markDraggable(el: Ref<null | HTMLElement>) {
	const drag = reactive({
		x: 0,
		y: 0,
		deltaX: 0,
		deltaY: 0,
		isDragging: false,
		startX: 0,
		startY: 0
	})

	let prevX: number, prevY: number

	function onMousedrag(e: MouseEvent) {
		const {clientX, clientY} = e

		drag.x = clientX - drag.startX
		drag.y = clientY - drag.startY
		drag.deltaX = clientX - prevX
		drag.deltaY = clientY - prevY
		prevX = clientX
		prevY = clientY
	}

	function onMouseup() {
		drag.isDragging = false
		drag.x = 0
		drag.y = 0
		drag.deltaX = 0
		drag.deltaY = 0
		drag.startX = 0
		drag.startY = 0
		window.removeEventListener('mousemove', onMousedrag)
		window.removeEventListener('mouseup', onMouseup)
	}

	function onMousedown(e: MouseEvent) {
		const {clientX, clientY} = e

		drag.isDragging = true
		drag.startX = clientX
		drag.startY = clientY
		prevX = clientX
		prevY = clientY

		window.addEventListener('mousemove', onMousedrag)
		window.addEventListener('mouseup', onMouseup)
	}

	onBeforeUnmount(onMouseup)

	watch(el, el => {
		if (!(el instanceof HTMLElement)) return
		el.addEventListener('mousedown', onMousedown)
	})

	return {drag}
}

export default defineComponent({
	name: 'InputVec2',
	components: {InputNumber},
	props: {
		value: {
			type: Array,
			required: true
		}
	},
	setup(props: Props, context) {
		const dragEl: Ref<null | HTMLElement> = ref(null)

		const onInput = (i: number, v: number) => {
			const value = createMalVector([...props.value])
			value[i] = v

			context.emit('input', value)
		}

		const {drag} = markDraggable(dragEl)

		watch(
			() => [drag.isDragging, drag.deltaX, drag.deltaY],
			([isDragging, x, y]) => {
				if (!isDragging) return

				const newValue = markMalVector([...props.value]) as number[]
				newValue[0] += x as number
				newValue[1] += y as number
				context.emit('input', newValue)
			}
		)

		return {
			dragEl,
			onInput,
			drag
		}
	}
})
</script>

<style lang="stylus" scoped>
@import './common.styl'

.InputVec2
	display flex
	line-height $input-height

	&__el
		margin-right 0.5em
		width 5em

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 1.1rem
		height @width
		border 1px solid var(--comment)

		&:hover, &.dragging
			background var(--comment)

			&:before, &:after
				background var(--background)

		&:before, &:after
			position absolute
			display block
			background var(--comment)
			content ''

		&:before
			top 2px
			left calc(50% - 0.5px)
			width 1px
			height calc(100% - 4px)

		&:after
			top calc(50% - 0.5px)
			left 2px
			width calc(100% - 4px)
			height 1px
</style>
