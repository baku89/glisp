<template>
	<div class="Interpreter">
		<h2>Glisp :: REPL</h2>
		<splitpanes class="glisp-theme">
			<pane>
				<MinimalConsole class="Interpreter__console" :rep="rep" />
			</pane>
			<pane><ExpInputScope :exp="scope" /></pane>
		</splitpanes>
	</div>
</template>

<script lang="ts">
import 'splitpanes/dist/splitpanes.css'

import {Pane, Splitpanes} from 'splitpanes'
import {defineComponent, reactive} from 'vue'

import useScheme from '@/components/use/use-scheme'

import ExpInputScope from './components/ExpInputScope.vue'
import {
	createExpScope,
	disconnectExp,
	ExpScope,
	GlispError,
	Interpreter,
	printForm,
	readStr,
} from './glisp'
import MinimalConsole from './MinimalConsole.vue'

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole, Splitpanes, Pane, ExpInputScope},
	setup() {
		useScheme()

		const scope: ExpScope = reactive(createExpScope({})) as any

		const interpreter = new Interpreter(scope)

		async function rep(str: string) {
			try {
				const exp = readStr(str)
				const evaluated = interpreter.evalExp(exp)
				disconnectExp(exp)
				return printForm(evaluated)
			} catch (err) {
				if (err instanceof GlispError) {
					throw new Error(`${printForm(err.target)}: ${err.message}`)
				} else {
					throw err
				}
			}
		}

		return {rep, scope}
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
