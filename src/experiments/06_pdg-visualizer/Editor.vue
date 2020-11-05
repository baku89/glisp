<template>
	<div class="Editor">
		<div class="Editor__text">
			<GlispEditor
				class="Editor__editor"
				:modelValue="code"
				@update:modelValue="onUpdateCode"
			/>
			<div class="Editor__parse-error" v-if="errorOnParse">
				{{ errorOnParse }}
			</div>
		</div>
		<div class="Editor__inspector">
			<PDGInputExp
				v-if="pdg"
				:modelValue="pdg"
				@update:modelValue="onUpdatePDG"
			/>
		</div>
		<div class="Editor__result">
			<pre>{{ printedCode }}</pre>
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
import {computed, defineComponent, ref, shallowRef} from 'vue'

import GlispEditor from '@/components/GlispEditor/GlispEditor.vue'
import useScheme from '@/components/use/use-scheme'

import PDGInputExp from './PDGInputExp.vue'
import PDGVisualizer from './PDGVisualizer.vue'
import {
	analyzePDG,
	AST,
	evalPDG,
	PDG,
	printPDG,
	printValue,
	readAST,
	readStr,
} from './repl'
import {useAsyncComputed} from './use'

export default defineComponent({
	name: 'Editor',
	components: {PDGInputExp, GlispEditor, PDGVisualizer},
	setup() {
		useScheme()

		const code = useLocalStorage('glisp_ed', '(not true)')

		const errorOnParse = ref<string | null>(null)

		const pdg = shallowRef<PDG | null>(null)
		onUpdateCode(code.value)

		function onUpdateCode(_code: string) {
			code.value = _code

			let ast: AST
			try {
				ast = readStr(code.value)
				errorOnParse.value = null
				onUpdatePDG(readAST(ast))
			} catch (err) {
				errorOnParse.value = err.message
			}
		}

		function onUpdatePDG(p: PDG) {
			pdg.value = p
		}

		const printedCode = computed(() =>
			pdg.value ? printPDG(pdg.value).replaceAll('\n', '<br/>') : ''
		)

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
			onUpdatePDG,
			code,
			printedCode,
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

	&__text, &__inspector, &__result
		padding 1rem
		width calc((100% / 3))
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
		border-radius $border-radius
		background var(--error)
		color var(--background)

	&__result
		display flex
		flex-direction column

		&, & pre
			font-monospace()

	&__vis
		flex-grow 1
</style>
