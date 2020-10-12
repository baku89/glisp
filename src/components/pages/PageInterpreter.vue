<template>
	<div class="PageInterpreter">
		<Console :scope="scope" @setup="onSetupConsole" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import Scope from '@/mal/scope'
import {defineComponent, ref, shallowRef} from 'vue'
import Console from '@/components//Console.vue'

// replScope.REP(`(str "Glisp [" *host-language* "]")`)

export default defineComponent({
	name: 'PageInterpreter',
	components: {
		Console,
	},
	setup() {
		const scope = shallowRef(new Scope())

		function onSetupConsole() {
			scope.value.REP(`(str "Glisp [" *host-language* "]")`)
		}

		return {scope, onSetupConsole}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'
@import '../style/global.styl'

.PageInterpreter
	height 100vh
</style>
