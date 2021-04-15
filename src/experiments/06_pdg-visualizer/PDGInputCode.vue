<template>
	<div class="PDGInputCode">
		<InputString
			class="PDGInputCode__input"
			:multiline="true"
			v-model="code"
			@confirm="confirm"
			:style="{height: inputHeight}"
		/>
		<button
			class="PDGInputCode__button"
			:class="{error: errorMsg}"
			@click="confirm"
		>
			{{ errorMsg || '✓' }}
		</button>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref, toRaw, watch} from 'vue'

import InputString from '@/components/inputs/InputString.vue'

import {AST, PDG, printPDG, readAST, readStr} from './glisp'
import {useSwapPDG} from './use'

const INPUT_LINE_HEIGHT_REM = 1.8

export default defineComponent({
	name: 'PDGInputCode',
	components: {
		InputString,
	},
	props: {
		modelValue: {
			type: Object as PropType<PDG>,
			required: true,
		},
	},
	emits: ['confirm'],
	setup(props, context) {
		const swapPDG = useSwapPDG()
		const code = ref('')
		const ast = ref<AST | null>(null)
		const errorMsg = ref<string | null>(null)

		watch(
			() => props.modelValue,
			() => {
				code.value = printPDG(props.modelValue)
			},
			{immediate: true}
		)

		watch(
			() => code.value,
			() => {
				try {
					ast.value = readStr(code.value)
					errorMsg.value = null
				} catch (err) {
					ast.value = null
					errorMsg.value = err.message
				}
			},
			{immediate: true}
		)

		function confirm() {
			if (!ast.value) return

			const newValue = readAST(ast.value)
			const oldValue = toRaw(props.modelValue)
			context.emit('confirm')
			swapPDG && swapPDG(oldValue, newValue)
		}

		const inputHeight = computed(() => {
			const lineCount = code.value.split(/\r\n|\r|\n/).length
			return (lineCount + 1.2) * INPUT_LINE_HEIGHT_REM + 'rem !important'
		})

		return {code, errorMsg, confirm, inputHeight}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

.PDGInputCode
	position relative

	&__input
		width 100%
		color var(--textcolor)
		font-monospace()

	&__button
		position absolute
		right 4px
		bottom 8px
		width 2rem
		height 2rem
		border-radius 1rem
		background var(--string)
		color var(--background)
		transition all 0.2s ease

		&.error
			width auto
			background var(--error)
			cursor default
</style>
