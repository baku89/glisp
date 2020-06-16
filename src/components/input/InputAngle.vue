<template>
	<div class="InputAngle">
		<InputNumber class="InputAngle__el" :value="value" @input="onInput" :validator="validator" />
		<button
			class="InputAngle__drag"
			:class="{dragging: drag.isDragging}"
			:style="{transform: `rotate(${value}rad)`}"
			ref="dragEl"
		/>
	</div>
</template>

<script lang="ts">
import {defineComponent, ref, Ref, watch, PropType} from '@vue/composition-api'
import {markMalVector} from '@/mal/types'
import InputNumber from './InputNumber.vue'
import {useDraggable} from '@/components/use'
import {vec2} from 'gl-matrix'

export default defineComponent({
	name: 'InputAngle',
	components: {InputNumber},
	props: {
		value: {
			type: Number,
			required: true
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false
		}
	},
	setup(prop, context) {
		const dragEl: Ref<null | HTMLElement> = ref(null)

		const onInput = (value: number) => {
			context.emit('input', value)
		}

		const drag = useDraggable(dragEl, {
			coordinate: 'center',
			onDrag({x, y, prevX, prevY}) {
				const prevAngle = Math.atan2(prevY, prevX)

				const alignedPos = vec2.rotate(
					vec2.create(),
					[x, y] as vec2,
					[0, 0],
					-prevAngle
				)
				const deltaAngle = Math.atan2(alignedPos[1], alignedPos[0])

				const value = prop.value + deltaAngle
				context.emit('input', value)
			}
		})

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

.InputAngle
	display flex
	align-items center
	line-height $input-height

	&__el
		margin-right 0.5em

		&:last-child
			margin-right 0

	&__drag
		position relative
		margin-left 0.5rem
		width 16px
		height 16px
		border 1px solid var(--comment)
		border-radius 50%

		&:hover, &.dragging
			background var(--comment)

			&:before
				background var(--background)

		&:before
			position absolute
			display block
			background var(--comment)
			content ''

		&:before
			top calc(50% - 0.25px)
			left 50%
			width 50%
			height 0.5px
</style>
