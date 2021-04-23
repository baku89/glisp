<template>
	<div class="Interpreter">
		<h2>Glisp :: REPL</h2>
		<MinimalConsole class="Interpreter__console" :rep="rep" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {defineComponent} from 'vue'

import useScheme from '@/components/use/use-scheme'

import {evalExp, printValue, readStr} from './glisp'
import MinimalConsole from './MinimalConsole.vue'

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		async function rep(str: string) {
			const exp = readStr(str)
			console.log('exp', exp)
			const val = evalExp(exp)
			console.log('evaluated', val)
			return printValue(val)
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
	display flex
	flex-direction column
	align-items stretch
	padding 2em
	height 100vh

	h2
		font-size 2em

	&__vars
		padding-left 1em
		font-monospace()

	&__console
		flex-grow 1
		padding-right 1em
</style>
