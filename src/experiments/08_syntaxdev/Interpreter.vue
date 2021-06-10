<template>
	<div class="Interpreter">
		<h2>Glisp :: REPL</h2>
		<MinimalConsole
			class="Interpreter__console"
			:rep="rep"
			v-model:onError="onError"
		/>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {defineComponent, ref} from 'vue'

import useScheme from '@/components/use/use-scheme'

import {evalExp, printValue, readStr, TypeIO} from './glisp'
import MinimalConsole from './MinimalConsole.vue'

export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		const onError = ref<(msg: string) => any>(console.error)

		async function rep(str: string) {
			const exp = readStr(str)

			try {
				const {result, logs} = evalExp(exp)
				if (logs.length > 0) {
					onError.value(logs.map(l => `[${l.level}] ${l.reason}`).join('\n'))
				}

				if (
					result instanceof Object &&
					!Array.isArray(result) &&
					result.kind === 'object' &&
					result.type === TypeIO
				) {
					result.value()
				}

				return printValue(result)
			} catch (err) {
				console.error(err)
				throw err
			}
		}

		return {rep, onError}
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
