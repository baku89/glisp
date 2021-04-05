<template>
	<div class="Interpreter">
		<h2>REPL</h2>
		<MinimalConsole :rep="rep" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {defineComponent} from 'vue'

import useScheme from '@/components/use/use-scheme'

import {disconnectExp, Interpreter, printExp, readStr} from './glisp'
import MinimalConsole from './MinimalConsole.vue'

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		const interpreter = new Interpreter()

		async function rep(str: string) {
			const exp = readStr(str)
			const evaluatedExp = interpreter.evalExp(exp)
			disconnectExp(exp)
			return printExp(evaluatedExp)
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
