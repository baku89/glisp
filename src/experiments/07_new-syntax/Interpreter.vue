<template>
	<div class="Interpreter">
		<MinimalConsole :rep="rep" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {defineComponent} from 'vue'

import useScheme from '@/components/use/use-scheme'

import {analyzePDG, evalPDG, printValue, readAST, readStr} from './glisp'
import MinimalConsole from './MinimalConsole.vue'
export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		async function rep(str: string) {
			const pdg = analyzePDG(readAST(readStr(str)))
			const ret = await evalPDG(pdg)

			return printValue(ret)
		}

		return {rep}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'

.Interpreter
	app()
	padding 2rem
	height 100vh
</style>
