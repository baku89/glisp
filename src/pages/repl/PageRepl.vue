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
import {withLog} from '@/lib/WithLog'

import Console, {IFnRep} from './Console.vue'
import {evalExp, isKindOf, printValue, readStr, TypeIO} from './glisp'

export default defineComponent({
	name: 'PageRepl',
	components: {AppHeader, AppHeaderBreadcumb, Console},
	setup() {
		useScheme()

		const onError = ref<(msg: string) => any>(console.error)

		const rep: IFnRep = async (str: string) => {
			const [exp, readLog] = readStr(str)
			const [result, evalLog] = evalExp(exp)

			// Execute IO
			if (isKindOf('data', result) && result.type === TypeIO) {
				await result.value()
			}

			const doPrintName = exp.ast !== 'symbol'

			return withLog(printValue(result, doPrintName), [...readLog, ...evalLog])
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
