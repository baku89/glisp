<template>
	<div class="Interpreter">
		<MinimalConsole :rep="rep" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'

import {defineComponent} from 'vue'

import useScheme from '@/components/use/use-scheme'

import MinimalConsole from './MinimalConsole.vue'
import {evalExp, printExp, readStr} from './reader'
export default defineComponent({
	name: 'Interpreter',
	components: {MinimalConsole},
	setup() {
		useScheme()

		async function rep(str: string) {
			const exp = readStr(str)
			console.log(exp)
			return printExp(evalExp(exp))
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
