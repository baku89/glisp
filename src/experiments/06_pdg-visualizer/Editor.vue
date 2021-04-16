<template>
	<div class="Editor">
		<div class="Editor__inspector">
			<PDGInputExp v-if="pdg" :modelValue="pdg" />
		</div>
		<div class="Editor__result">
			<pre class="Editor__code">{{ code }}</pre>
			<div>
				Result: {{ returned }} {{ evaluating ? '(EVALUATING...)' : '' }}
			</div>
			<PDGVisualizer v-if="false" class="Editor__vis" :modelValue="pdg" />
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {useLocalStorage} from '@vueuse/core'
import {
	computed,
	defineComponent,
	provide,
	Ref,
	ref,
	shallowRef,
	toRaw,
	watchEffect,
} from 'vue'

import useScheme from '@/components/use/use-scheme'

import {
	analyzePDG,
	AST,
	evalPDG,
	PDG,
	printPDG,
	printValue,
	readAST,
	readStr,
	swapPDG,
} from './glisp'
import PDGInputExp from './PDGInputExp.vue'
import PDGVisualizer from './PDGVisualizer.vue'
import {useAsyncComputed} from './use'

export default defineComponent({
	name: 'Editor',
	components: {PDGInputExp, PDGVisualizer},
	setup() {
		useScheme()

		const code = useLocalStorage('glisp_ed', '(not true)')

		const errorOnParse = ref<string | null>(null)

		const pdg: Ref<PDG | null> = shallowRef(null)
		onUpdateCode(code.value)

		function onUpdateCode(_code: string) {
			code.value = _code

			let ast: AST
			try {
				ast = readStr(code.value)
				errorOnParse.value = null
				pdg.value = readAST(ast)
			} catch (err) {
				errorOnParse.value = err.message
			}
		}

		provide('swap-pdg', (oldValue: PDG, newValue: PDG) => {
			if (pdg.value) {
				const map = swapPDG(oldValue, newValue)
				const newPDG = map.get(toRaw(pdg.value))
				if (newPDG) {
					pdg.value = newPDG
				}
			}
		})

		watchEffect(() => {
			code.value = pdg.value ? printPDG(pdg.value) : ''
		})

		const {value: returned, isUpdating: evaluating} = useAsyncComputed<
			Error | string,
			PDG | null
		>(new Error(), pdg, async () => {
			if (!pdg.value) {
				return new Error()
			}
			try {
				return printValue(await evalPDG(analyzePDG(pdg.value)))
			} catch (err) {
				return new Error(err)
			}
		})

		const errorOnEval = computed(() => {
			return returned.value instanceof Error ? returned.value.message : null
		})

		return {
			pdg,
			code,

			evaluating,
			returned,
			errorOnParse,
			errorOnEval,
			onUpdateCode,
		}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'

.Editor
	display flex
	height 100vh
	color var(--base05)

	&__text, &__inspector, &__result
		padding 1rem
		width calc((100% / 2))
		border-right 1px solid var(--frame)

		&:last-child
			border-right none

	&__text
		position relative

	&__parse-error
		position absolute
		right 1rem
		bottom 1rem
		left 1rem
		padding 1rem
		height auto
		border-radius $input-round
		background var(--error)
		color var(--base00)

	&__result
		display flex
		flex-direction column

		&, & pre
			font-monospace()

	&__printecode
		white-space pre-wrap

	&__vis
		flex-grow 1
</style>
