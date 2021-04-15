<template>
	<div class="Interpreter">
		<h2>Niu :: REPL</h2>
		<splitpanes class="glisp-theme">
			<pane>
				<MinimalConsole class="Interpreter__console" :rep="rep" />
			</pane>
			<pane>
				<pre class="Interpreter__vars">{{ varsStr }}</pre>
			</pane>
		</splitpanes>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {Pane, Splitpanes} from 'splitpanes'
import {defineComponent, ref} from 'vue'

import {useTheme} from '@/components/use/use-theme'

import {
	disconnectExp,
	GlispError,
	Interpreter,
	printForm,
	readStr,
} from './glisp'
import MinimalConsole from './MinimalConsole.vue'

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole, Splitpanes, Pane},
	setup() {
		const {name: themeName} = useTheme()

		const interpreter = new Interpreter()

		const varsStr = ref('')

		function updateVars() {
			varsStr.value = Object.entries(interpreter.vars)
				.map(([name, exp]) => `${name}: ${printForm(exp)}`)
				.join('\n')
		}

		updateVars()

		async function rep(str: string) {
			try {
				const exp = readStr(str)
				const evaluated = interpreter.evalExp(exp)
				disconnectExp(exp)
				updateVars()
				return printForm(evaluated)
			} catch (err) {
				if (err instanceof GlispError) {
					throw new Error(`${printForm(err.target)}: ${err.message}`)
				} else {
					throw err
				}
			}
		}

		return {rep, varsStr, themeName}
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
