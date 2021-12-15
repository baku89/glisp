<template lang="pug">
ul.ParameterControl
	li.ParameterControl__param(v-for='{type, name, label} in scheme')
		label.ParameterControl__label {{label || name}}

		input.ParameterControl__input(
			v-if='type === "float"',
			type='number',
			:value.number='modelValue[name]',
			@change='onChange(name, parseFloat($event.target.value))'
		)

		input.ParameterControl__input(
			v-if='type === "color"',
			type='text',
			:value='modelValue[name]',
			:class='{light: isLight(modelValue[name])}',
			:style='{backgroundColor: modelValue[name]}',
			@change='onChange(name, $event.target.value)'
		)
</template>

<script lang="ts">
import {defineComponent, PropType} from '@vue/runtime-core'
import Color from 'color'

import {ParamScheme} from '../Tool'

export default defineComponent({
	props: {
		modelValue: {
			type: Object as PropType<Record<string, number | string>>,
			required: true,
		},
		scheme: {type: Array as PropType<ParamScheme[]>, required: true},
	},
	emits: ['update'],
	setup(_, {emit}) {
		function onChange(name: string, value: number | string) {
			emit('update', name, value)
		}

		function isLight(color: string) {
			return Color(color).isLight()
		}

		return {onChange, isLight}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'

.ParameterControl
	position absolute
	top 0
	right 100%
	z-index 100
	margin-right 0.5rem
	padding 0.5em
	width 15rem
	color SELECTION
	font-size 0.9rem
	user-select none

	&__param
		position relative
		display block
		margin-bottom 1px
		height HEIGHT
		border-radius 30px
		background BG
		font-size 0.8em
		font-family 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace
		line-height HEIGHT

	&__label
		position absolute
		padding 0 1rem 0 0
		padding-left 1em
		width 8rem
		color FG

	input&__input
		position absolute
		top 0
		right 0
		display block
		overflow hidden
		padding 0 0.75em
		width 7rem
		border 0
		border-radius 20px
		background SELECTION
		color WHITE
		text-align left

		&.light
			color BG

		&:hover
			background #aaa
</style>
