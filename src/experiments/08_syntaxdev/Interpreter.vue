<template>
	<div class="Interpreter">
		<GlobalMenu2>
			<template #left>
				<GlobalMenu2Breadcumb :items="[{label: 'REPL'}]" />
			</template>
		</GlobalMenu2>
		<main class="Interpreter__main">
			<MinimalConsole
				class="Interpreter__console"
				:rep="rep"
				v-model:onError="onError"
			/>
		</main>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import 'splitpanes/dist/splitpanes.css'

import {defineComponent, ref} from 'vue'

import GlobalMenu2, {GlobalMenu2Breadcumb} from '@/components/GlobalMenu2'
import useScheme from '@/components/use/use-scheme'

import {evalExp, printValue, readStr, TypeIO} from './glisp'
import MinimalConsole from './MinimalConsole.vue'

export default defineComponent({
	name: 'Interpreter',
	components: {GlobalMenu2, GlobalMenu2Breadcumb, MinimalConsole},
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
	display grid
	height 100vh
	grid-template-rows auto 1fr

	&__main
		padding 2em

	h2
		font-size 2em

	&__vars
		padding-left 1em
		font-monospace()

	&__console
		flex-grow 1
		padding-right 1em
</style>
