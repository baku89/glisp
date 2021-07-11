<template>
	<div class="PageRepl">
		<AppHeader>
			<template #left>
				<AppHeaderBreadcumb :items="[{label: 'REPL'}]" />
			</template>
		</AppHeader>
		<main class="PageRepl__main">
			<Console class="PageRepl__console" :rep="rep" />
		</main>
	</div>
</template>

<script lang="ts">
import 'splitpanes/dist/splitpanes.css'

import {defineComponent, ref} from 'vue'

import AppHeader, {AppHeaderBreadcumb} from '@/components/AppHeader'
import useScheme from '@/components/use/use-scheme'

// import {evalExp, printValue, readStr, TypeIO} from './glisp'
import Console, {IFnRep} from './Console.vue'
import {evalExp, printValue, readStr, TypeIO} from './glisp'

export default defineComponent({
	name: 'PageRepl',
	components: {AppHeader, AppHeaderBreadcumb, Console},
	setup() {
		useScheme()

		const onError = ref<(msg: string) => any>(console.error)

		const rep: IFnRep = async (str: string) => {
			try {
				const exp = readStr(str)
				const {result, log} = evalExp(exp)

				// Execute IO
				if (
					result instanceof Object &&
					!Array.isArray(result) &&
					result.kind === 'object' &&
					result.type === TypeIO
				) {
					result.value()
				}

				return {result: printValue(result), log}
			} catch (e) {
				console.error(e)
				return {result: null, log: [{level: 'error', reason: e.message}]}
			}
		}

		return {rep, onError}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'
@import '~@/components/style/global.styl'

.PageRepl
	app()
	display grid
	height 100vh
	grid-template-rows auto 1fr

	&__main
		overflow scroll
		padding 2em

	h2
		font-size 2em

	&__vars
		padding-left 1em
		font-monospace()

	&__console
		flex-grow 1
</style>
