<template>
	<input
		v-if="!multiline"
		class="InputString"
		:class="{InputString__monospace: monospace}"
		type="text"
		:value="modelValue"
		@input="onInput"
		@blur="onBlur"
		@keydown.enter="$emit('confirm')"
		v-bind="$attrs"
	/>
	<textarea
		v-else
		class="InputString InputString__multiline"
		:class="{InputString__monospace: monospace}"
		ref="textareaEl"
		:value="modelValue"
		:style="{height: textareaHeight}"
		data-gramm_editor="false"
		@input="onInput"
		@keydown.ctrl.enter="$emit('confirm')"
		v-bind="$attrs"
	/>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref} from 'vue'

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
			required: false,
		},
		multiline: {
			default: false,
		},
		monospace: {
			default: false,
		},
	},
	emits: ['update:modelValue', 'confirm'],
	setup(props, context) {
		const textareaEl = ref<null | HTMLTextAreaElement>(null)
		const textareaHeight = computed(() => {
			const lineCount = props.modelValue.split(/\r\n|\r|\n/).length
			return lineCount * INPUT_LINE_HEIGHT_REM + 'rem'
		})
		function onInput({target}: Event) {
			let val: string | null = (target as HTMLInputElement).value

			if (props.validator) {
				val = props.validator(val)
				if (val === null) return
			}

			context.emit('update:modelValue', val)
		}

		function onBlur(e: InputEvent) {
			const el = e.target as HTMLInputElement
			el.value = props.modelValue
			context.emit('confirm')
		}

		return {
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
	input()
	padding 0 0.4rem
	max-width 100%
	width 12.6rem
	color var(--base05)

	&:focus
		box-shadow 0 0 0 1px var(--highlight)

	&.exp
		color var(--red)

	&__monospace
		font-monospace()

	&__multiline
		overflow-y hidden
		line-height 1.8rem
		resize none
</style>
