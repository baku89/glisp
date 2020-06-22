<template>
	<div class="MalInputAngle">
		<MalInputNumber class="MalInputAngle__el" :value="value" @input="onInput" :validator="validator" />
		<button
			class="MalInputAngle__drag"
			:class="{dragging: drag.isDragging}"
			:style="{transform: `rotate(${evaluated}rad)`}"
			ref="dragEl"
		/>
	</div>
</template>

<script lang="ts">
import {
	defineComponent,
	ref,
	Ref,
	PropType,
	computed
} from '@vue/composition-api'
import MalInputNumber from './MalInputNumber.vue'
import {useDraggable} from '@/components/use'
import {vec2} from 'gl-matrix'
import {getMeta, isList, MalNodeSeq, MalSymbol, M_EVAL} from '../../mal/types'
import {getMapValue, reverseEval} from '../../mal-utils'

export default defineComponent({
	name: 'MalInputAngle',
	components: {MalInputNumber},
	props: {
		value: {
			type: [Number, Array, Object] as PropType<
				number | MalNodeSeq | MalSymbol
			>,
			required: true
		},
		validator: {
			type: Function as PropType<(v: number) => number | null>,
			required: false
		}
	},
	setup(props, context) {
		const dragEl: Ref<null | HTMLElement> = ref(null)

		const evaluated = computed(() => {
			if (typeof props.value === 'number') {
				return props.value as number
			} else if (isList(props.value) && M_EVAL in props.value) {
				return props.value[M_EVAL] as number
			}
			return 0
		})

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
				const newAngle = evaluated.value + deltaAngle

				const value = reverseEval(newAngle, props.value)

				context.emit('input', value)
			}
		})

		return {
			dragEl,
			evaluated,
			drag,
			onInput
		}
	}
})
</script>

<style lang="stylus" scoped>
@import '../style/common.styl'

.MalInputAngle
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
