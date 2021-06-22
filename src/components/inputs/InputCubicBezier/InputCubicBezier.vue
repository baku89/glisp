<template>
	<button
		class="InputCubicBezier"
		:class="{opened}"
		@click="opened = true"
		ref="buttonEl"
		v-bind="$attrs"
	>
		<svg class="InputCubicBezier__icon" viewBox="0 0 1 1">
			<path :d="easingPath" />
		</svg>
	</button>
	<Popover v-model:open="opened" :reference="buttonEl" placement="bottom">
		<div class="InputCubicBezier__popover-frame">
			<InputCubicBezierPicker
				:modelValue="modelValue"
				@update:modelValue="$emit('update:modelValue', $event)"
			/>
		</div>
	</Popover>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref} from 'vue'

import Popover from '@/components/layouts/Popover.vue'
import SvgIcon from '@/components/layouts/SvgIcon.vue'

import InputCubicBezierPicker from './InputCubicBezierPicker.vue'

export default defineComponent({
	name: 'InputCubicBezier',
	components: {
		InputCubicBezierPicker,
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

		const easingPath = computed(() => {
			const [x1, y1, x2, y2] = props.modelValue

			return `M 0,0 C ${x1},${y1} ${x2},${y2} 1,1`
		})

		return {buttonEl, opened, easingPath}
	},
})
</script>

<style lang="stylus">
@import '../../style/common.styl'

.InputCubicBezier
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
		background base16('accent')

		path
			transform scaleY(-1)
			transform-origin 50% 50%
			stroke-width 1.5
			stroke base16('00')
			stroke-linecap round
			fill none
			vector-effect non-scaling-stroke

	&__popover-frame
		margin 0.5rem
		width 15rem
		height 15rem
		border 1px solid $color-frame
		border-radius $popup-round
		glass-bg('pane')
		position relative
		box-shadow 0 0 20px 0 base16('00', 0.9)
</style>
