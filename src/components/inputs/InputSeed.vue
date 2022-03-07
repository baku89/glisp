<template>
	<button class="InputSeed" @click="shuffle">
		<SvgIcon
			mode="block"
			class="InputSeed__icon"
			:style="{transform: `rotate(${iconRot}deg)`}"
		>
			<circle v-show="iconNum === 1" cx="16" cy="16" r="1" />
			<g v-show="iconNum === 2">
				<circle cx="11" cy="21" r="1" />
				<circle cx="21" cy="11" r="1" />
			</g>
			<g v-show="iconNum === 3">
				<circle cx="16" cy="16" r="1" />
				<circle cx="10" cy="22" r="1" />
				<circle cx="22" cy="10" r="1" />
			</g>
			<g v-show="iconNum === 4">
				<circle cx="10" cy="22" r="1" />
				<circle cx="22" cy="10" r="1" />
				<circle cx="10" cy="10" r="1" />
				<circle cx="22" cy="22" r="1" />
			</g>
			<g v-show="iconNum === 5">
				<circle cx="16" cy="16" r="1" />
				<circle cx="10" cy="22" r="1" />
				<circle cx="22" cy="10" r="1" />
				<circle cx="10" cy="10" r="1" />
				<circle cx="22" cy="22" r="1" />
			</g>
			<g v-show="iconNum === 6">
				<circle cx="10" cy="10" r="1" />
				<circle cx="10" cy="16" r="1" />
				<circle cx="10" cy="22" r="1" />
				<circle cx="22" cy="10" r="1" />
				<circle cx="22" cy="16" r="1" />
				<circle cx="22" cy="22" r="1" />
			</g>
			<path
				d="M24,29H8c-2.8,0-5-2.2-5-5V8c0-2.8,2.2-5,5-5h16c2.8,0,5,2.2,5,5v16C29,26.8,26.8,29,24,29z"
			/>
		</SvgIcon>
	</button>
</template>

<script lang="ts">
import _ from 'lodash'
import {defineComponent, ref} from 'vue'

import SvgIcon from '@/components/layouts/SvgIcon.vue'

export default defineComponent({
	name: 'InputSeed',
	components: {
		SvgIcon,
	},
	props: {
		min: {
			type: Number,
			default: 0,
		},
		max: {
			type: Number,
			default: 1,
		},
	},
	setup(props, context) {
		const iconRot = ref(0)
		const iconNum = ref(3)

		function shuffle() {
			iconRot.value += 90
			const v = _.random(props.min, props.max, true)

			const t = (v - props.min) / (props.max - props.min)
			iconNum.value = _.clamp(Math.floor(t * 6) + 1, 1, 6)

			context.emit('update:modelValue', v)
		}

		return {shuffle, iconRot, iconNum}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputSeed
	display block
	padding 0
	width $input-height
	height $input-height
	border-radius $input-round
	background-size 100% 100%
	color base16('06')
	text-align center
	cursor pointer

	&__icon
		margin $subcontrol-margin
		width $subcontrol-height
		height $subcontrol-height
		transition transform 0.3s cubic-bezier(0.19, 1.6, 0.42, 1)

	&:hover, &:focus
		background base16('02')
</style>
