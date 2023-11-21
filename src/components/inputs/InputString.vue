<template>
	<input
		v-if="!multiline"
		class="InputString"
		type="text"
		:value="value"
		@input="onInput"
		@blur="onBlur"
	/>
	<textarea
		v-else
		ref="textareaEl"
		class="InputString multiline"
		:value="value"
		:style="{height: textareaHeight}"
		@input="onInput"
	></textarea>
</template>

<script lang="ts" setup>
import {computed, Ref, ref} from 'vue'

const INPUT_LINE_HEIGHT_REM = 1.8

const props = defineProps<{
	value: string
	validator?: (v: string) => string | null
	multiline?: boolean
}>()

const emit = defineEmits<{
	input: [value: string]
	'end-tweak': []
}>()

const textareaEl: Ref<null | HTMLTextAreaElement> = ref(null)
const textareaHeight = computed(() => {
	const lineCount = props.value.split(/\r\n|\r|\n/).length
	return lineCount * INPUT_LINE_HEIGHT_REM + 'rem'
})
function onInput({target}: Event) {
	let val: string | null = (target as HTMLInputElement).value

	if (props.validator) {
		val = props.validator(val)
		if (val === null) return
	}

	emit('input', val)
}

function onBlur(e: Event) {
	const el = e.target as HTMLInputElement
	el.value = props.value
	emit('end-tweak')
}
</script>

<style lang="stylus">
@import '../style/common.styl'

.InputString
	input()
	padding 0 0.4rem
	max-width 100%
	width 12.6rem
	color var(--syntax-string)

	&.exp
		color var(--red)

	&.multiline
		line-height 1.8rem
		resize none
</style>
