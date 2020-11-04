<template>
	<div class="PDGEditor">
		<div class="PDGEditor__code" v-html="code" />
		<div class="PDGEditor__result">{{ returned }}</div>
		<div vclass="PDGEditor__input">
			<PDGInputExp :modelValue="pdg" @update:modelValue="onUpdatePDG" />
		</div>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {defineComponent, reactive, computed, ref, watch, toRaw} from 'vue'
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

export default defineComponent({
	name: 'PDGEditor',
	components: {PDGInputExp},
	setup() {
		useScheme()

		const pdg = ref<PDG>(analyzePDG(readAST(readStr('(or true false)'))))

		function onUpdatePDG(p: PDG) {
			pdg.value = analyzePDG(p)
		}

		const code = computed(() => printPDG(pdg.value).replaceAll('\n', '<br/>'))

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

		return {pdg, onUpdatePDG, code, returned}
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
</style>
