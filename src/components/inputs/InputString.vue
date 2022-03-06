<template>
	<component
		v-bind:is="multiline ? 'textarea' : 'input'"
		class="InputString"
		:class="{
			monospace: monospace,
			multiline: multiline,
			invalid: displayInvalid,
		}"
		type="text"
		:value="display"
		:style="inputStyle"
		@focus="onFocus"
		@input="display = $event.target.value"
		@blur="confirm"
		@keypress.enter="confirm"
	/>
</template>

<script lang="ts">
import {some} from 'fp-ts/lib/Option'
import _ from 'lodash'
import {computed, defineComponent, PropType} from 'vue'

import useModelLocalDisplay from '@/components/use/use-model-local-display'
import {Validator} from '@/lib/fp'

const INPUT_LINE_HEIGHT_REM = 1.8

export default defineComponent({
	name: 'InputString',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		validator: {
			type: Function as PropType<Validator<string>>,
			default: some,
		},
		multiline: {
			default: false,
		},
		monospace: {
			default: false,
		},
		selectOnFocus: {
			type: Boolean,
			default: false,
		},
		updateOnBlur: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['update:modelValue'],
	setup(props, {emit}) {
		const {display, displayInvalid} = useModelLocalDisplay({
			props,
			read: some,
			show: _.identity,
			emit,
			validate: props.validator,
		})

		const inputStyle = computed(() => {
			if (props.multiline) {
				const lineCount = props.modelValue.split(/\r\n|\r|\n/).length
				return {
					height: lineCount * INPUT_LINE_HEIGHT_REM + 'rem',
				}
			} else {
				return {}
			}
		})

		function onFocus(e: Event) {
			if (props.selectOnFocus) {
				;(e.target as HTMLInputElement).select()
			}
		}

		function confirm() {
			display.confirm()
		}

		return {
			display,
			displayInvalid,
			inputStyle,
			onFocus,
			confirm,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.InputString
	position relative
	input()
	padding 0 0.4rem
	max-width 100%
	width 12.6rem
	color base16('06')

	&.label
		background none
		box-shadow inset 0px -2px 0 0 base16('01')
		color base16('04')

		&:hover
			box-shadow none

	&:focus
		box-shadow 0 0 0 1px base16('accent')

	&.exp
		color var(--red)

	&.monospace
		font-monospace()

	&.multiline
		overflow-y hidden
		line-height 1.8rem
		resize none
</style>
