<template>
	<div class="Interpreter">
		<MinimalConsole name="05_repl" :rep="rep" @setup="onSetupConsole" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {defineComponent} from 'vue'
import {showPDG} from './utils'
import useScheme from '@/components/use/use-scheme'
import MinimalConsole from './MinimalConsole.vue'

import {
	readStr,
	readAST,
	analyzePDG,
	evalPDG,
	PDG,
	printValue,
	printDataType,
} from './repl'

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		let append: ((el: Element) => any) | undefined = undefined

		async function rep(str: string) {
			const pdg = analyzePDG(readAST(readStr(str)))

			const el = await showPDG(pdg)
			el.style.setProperty('width', '500px')
			el.style.setProperty('height', '250px')

			append && append(el)
			// showPDG(pdg)
			const ret = await evalPDG(pdg)

			console.log(ret)

			return printValue(ret)
		}

		function onSetupConsole(cb: {append: (el: Element) => any}) {
			append = cb.append
		}

		return {rep, onSetupConsole}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/common.styl'
@import '../../components/style/global.styl'

.Interpreter
	app()
	padding 2rem
	height 100vh

	.__________cytoscape_container
		margin-bottom 0.5rem
		border 1px solid var(--frame)
</style>