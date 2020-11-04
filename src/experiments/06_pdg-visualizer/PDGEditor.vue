<template>
	<div class="PDGEditor">
		<div class="PDGEditor__editor">
			<InputString :multiline="true" v-model="code" />
		</div>
		<div vclass="PDGEditor__inspector">
			<PDGInputExp :modelValue="pdg" @update:modelValue="onUpdatePDG" />
		</div>
		<div class="PDGEditor__result">
			<pre>{{ printedCode }}</pre>
			<div>{{ returned }}</div>
			<PDGVisualizer class="PDGEditor__vis" :modelValue="pdg" />
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {
	defineComponent,
	reactive,
	computed,
	ref,
	watch,
	toRaw,
	shallowRef,
} from 'vue'
import useScheme from '@/components/use/use-scheme'
import {
	PDG,
	printPDG,
	readAST,
	readStr,
	analyzePDG,
	evalPDG,
	printValue,
} from './repl'
import PDGInputExp from './PDGInputExp.vue'
import PDGVisualizer from './PDGVisualizer.vue'
import InputString from '@/components/inputs/InputString.vue'

export default defineComponent({
	name: 'PDGEditor',
	components: {PDGInputExp, InputString, PDGVisualizer},
	setup() {
		useScheme()

		const code = ref('(not true)')

		const pdg = shallowRef<PDG>(analyzePDG(readAST(readStr(code.value))))

		watch(
			() => code.value,
			() => {
				try {
					onUpdatePDG(readAST(readStr(code.value)))
				} catch (err) {
					console.log(err)
				}
			}
		)

		function onUpdatePDG(p: PDG) {
			console.log('update')
			pdg.value = analyzePDG(p)
		}

		const printedCode = computed(() =>
			printPDG(pdg.value).replaceAll('\n', '<br/>')
		)

		const returned = ref('')
		watch(
			() => pdg.value,
			async () => {
				try {
					returned.value = printValue(await evalPDG(pdg.value))
				} catch (err) {
					returned.value = err
				}
			},
			{immediate: true}
		)

		return {pdg, onUpdatePDG, code, printedCode, returned}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/common.styl'
@import '../../components/style/global.styl'

.PDGEditor
	display flex
	height 100vh

	& > *
		padding 1rem
		width calc((100% / 3))
		border-right 1px solid var(--frame)

		&:last-child
			border-right none

	&__result
		display flex
		flex-direction column

	&__vis
		flex-grow 1
</style>
