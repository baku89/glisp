<template>
	<button
		class="InputCubicEasing"
		:class="{opened}"
		@click="opened = true"
		ref="buttonEl"
		v-bind="$attrs"
	>
		<SvgIcon
			mode="block"
			class="InputCubicEasing__icon"
			:nonStrokeScaling="true"
		>
			<g transform="scale(32 32) translate(0 1) scale(1 -1)  ">
				<path :d="easingPath" />
			</g>
		</SvgIcon>
	</button>
	<Popover v-model:open="opened" :reference="buttonEl" placement="bottom">
		<div class="InputCubicEasing__popover-frame">
			<svg
				viewBox="0 0 1 1"
				class="InputCubicEasing__visual-editor"
				ref="visualEditor"
			>
				<g>
					<path :d="easingPath" />
					<line :x1="0" :y1="0" :x2="x1" :y2="y1" />
					<line :x1="1" :y1="1" :x2="x2" :y2="y2" />
					<circle :cx="x1" :cy="y1" r=".05" />
					<circle :cx="x2" :cy="y2" r=".05" />
				</g>
			</svg>
		</div>
	</Popover>
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import {computed, defineComponent, PropType, ref} from 'vue'

import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import useDraggable from '../use/use-draggable'

export default defineComponent({
	name: 'InputCubicEasing',
	components: {
		Popover,
		SvgIcon,
	},
	props: {
		modelValue: {
			type: Array as PropType<number[]>,
			required: true,
		},
	},
	emit: ['update:modelValue'],
	inheritAttrs: false,
	setup(props) {
		const buttonEl = ref<HTMLElement | null>(null)
		const opened = ref(false)

		const visualEditorEl = templateRef('visualEditor')

		useDraggable(visualEditorEl as any, {
			onDrag(drag) {
				console.log((drag.pos[0] - drag.left) / (drag.right - drag.left))
			},
		})

		const easingPath = computed(() => {
			const [x1, y1, x2, y2] = props.modelValue

			return `M 0,0 C ${x1},${y1} ${x2},${y2} 1,1`
		})

		const x1 = computed(() => props.modelValue[0])
		const y1 = computed(() => props.modelValue[1])
		const x2 = computed(() => props.modelValue[2])
		const y2 = computed(() => props.modelValue[3])

		return {buttonEl, opened, easingPath, x1, y1, x2, y2}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputCubicEasing
	position relative
	width $input-height
	height $input-height
	border-radius $input-round
	input-transition(background)
	color base16('05')

	&:focus
		background base16('01')

	&:hover, &.opened
		background base16('accent', 0.5)

	&__icon
		margin $subcontrol-margin
		width $subcontrol-height
		height $subcontrol-height
		border-radius $input-round

	&__popover-frame
		margin 0.5rem
		width 15rem
		height 15rem
		border 1px solid $color-frame
		border-radius $popup-round
		glass-bg('pane')
		position relative
		box-shadow 0 0 20px 0 base16('00', 0.9)

	&__visual-editor
		margin 0.5em
		width calc(100% - 1em)
		oveflow visible

		*
			vector-effect non-scaling-stroke

		g
			transform scaleY(-1)
			transform-origin 50% 50%

		path, line, circle
			stroke-width 2
			stroke base16('05')
			fill none

		line
			stroke base16('03')

		circle
			fill base16('00')

			&:hover
				fill base16('accent')
				stroke base16('accent')
</style>
