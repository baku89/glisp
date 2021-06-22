<template>
	<input
		v-if="!multiline"
		class="InputString"
		:class="{InputString__monospace: monospace}"
		type="text"
		:value="displayValue"
		@input="onInput"
		@blur="onBlur"
		@keydown.enter="onBlur"
		v-bind="$attrs"
	/>
	<textarea
		v-else
		class="InputString InputString__multiline"
		:class="{InputString__monospace: monospace}"
		ref="textareaEl"
		:value="displayValue"
		:style="{height: textareaHeight}"
		data-gramm_editor="false"
		@input="onInput"
		@keydown.ctrl.enter="onBlur"
		v-bind="$attrs"
	/>
</template>

<script lang="ts">
import _ from 'lodash'
import {computed, defineComponent, PropType, ref, watch} from 'vue'

const INPUT_LINE_HEIGHT_REM = 1.8

export default defineComponent({
	name: 'InputString',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
		validator: {
			type: Function as PropType<(v: string) => string | null>,
			default: _.identity,
		},
		multiline: {
			default: false,
		},
		monospace: {
			default: false,
		},
		updateOnBlur: {
			type: Boolean,
			default: false,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const displayValue = ref(props.modelValue)

		watch(
			() => props.modelValue,
			v => (displayValue.value = v)
		)

		const textareaEl = ref<null | HTMLTextAreaElement>(null)
		const textareaHeight = computed(() => {
			const lineCount = props.modelValue.split(/\r\n|\r|\n/).length
			return lineCount * INPUT_LINE_HEIGHT_REM + 'rem'
		})

		function onInput(e: InputEvent) {
			if (props.updateOnBlur) return
			update(e)
		}

		function onBlur(e: InputEvent) {
			if (!props.updateOnBlur) {
				if (props.validator(displayValue.value) === null) {
					;(e.target as HTMLInputElement).value = props.modelValue
				}
				return
			}
			update(e)
		}

		function update(e: InputEvent) {
			const target = e.target as HTMLInputElement
			let val: string | null = target.value

			val = props.validator(val)
			if (val === null) {
				if (props.updateOnBlur) {
					target.value = props.modelValue
				}
				return
			}

			context.emit('update:modelValue', val)
		}

		return {
			displayValue,
			textareaEl,
			textareaHeight,
			onInput,
			onBlur,
		}
	},
	inheritAttrs: false,
})
</script>

<style lang="stylus">
@import '../style/common.styl'

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

	&__monospace
		font-monospace()

	&__multiline
		overflow-y hidden
		line-height 1.8rem
		resize none
</style>
