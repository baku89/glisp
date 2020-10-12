<template>
	<div id="app" class="PageInterpreter" :style="{...theme, background}">
		<Console :scope="scope" @setup="onSetupConsole" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {computed, defineComponent, reactive, ref, shallowRef} from 'vue'

import Console from '@/components/Console.vue'
import Scope from '@/mal/scope'
import {computeTheme} from '@/theme'

export default defineComponent({
	name: 'PageInterpreter',
	components: {
		Console,
	},
	setup() {
		const scope = shallowRef(new Scope())

		const background = ref('#f8f8f8')
		const theme = computed(() => computeTheme(background.value).colors)

		function onSetupConsole() {
			scope.value.REP(`(str "Glisp [" *host-language* "]")`)
		}

		return {scope, onSetupConsole, background, theme}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'
@import '../style/global.styl'

.PageInterpreter
	height 100vh
</style>
