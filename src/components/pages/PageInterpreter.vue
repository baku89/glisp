<template>
	<div id="app" class="PageInterpreter" :style="{...theme, background}">
		<Splitpanes class="default-theme">
			<Pane class="PageInterpreter__pane">
				<Console :scope="scope" @setup="onSetupConsole" />
			</Pane>
			<Pane class="PageInterpreter__pane PageInterpreter__code">
				<GlispEditor class="PageInterpreter__editor" v-model="code" />
				<div class="PageInterpreter__actions">
					<InputButton class="button" @click="run" label="Run" />
					<InputBoolean v-model="clearCode" label="Clear" />
				</div>
			</Pane>
		</Splitpanes>
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {computed, defineComponent, ref, shallowReactive} from 'vue'
import {Splitpanes, Pane} from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import Console from '@/components/Console.vue'
import GlispEditor from '@/components/GlispEditor'
import InputBoolean from '@/components/inputs/InputBoolean.vue'
import InputButton from '@/components/inputs/InputButton.vue'

import Scope from '@/mal/scope'
import {computeTheme} from '@/theme'

export default defineComponent({
	name: 'PageInterpreter',
	components: {
		Splitpanes,
		Pane,
		Console,
		GlispEditor,
		InputBoolean,
		InputButton,
	},
	setup() {
		const scope = shallowReactive(new Scope())
		const code = ref('')
		const clearCode = ref(false)

		const background = ref('#f8f8f8')
		const theme = computed(() => computeTheme(background.value).colors)

		function onSetupConsole() {
			scope.REP(`(str "Glisp [" *host-language* "]")`)
		}

		function run() {
			scope.REP(code.value)
			if (clearCode.value) {
				code.value = ''
			}
		}

		return {scope, code, clearCode, onSetupConsole, background, theme, run}
	},
})
</script>

<style lang="stylus">
@import '../style/common.styl'
@import '../style/global.styl'

.PageInterpreter
	height 100vh

	&__pane
		padding 2rem

	&__code
		display flex
		flex-direction column

	&__editor
		flex-grow 1

	&__actions
		display flex

		// background pink
		& > .button
			margin-right 0.4rem

// Overwrite splitpanes
.splitpanes.default-theme
	.splitpanes__pane
		position relative
		background transparent

	.splitpanes__splitter
		z-index 10
		margin-right -0.5rem
		margin-left -0.5rem
		width 1rem
		border-left none
		background transparent

		// Before as knob
		&:before
			margin-left -3px
			width 7px
			height 19px
			border-right 1px dotted var(--border)
			border-left 1px dotted var(--border)
			background transparent
			transition border-left-color 0.3s, border-right-color 0.3s

		&:hover:before
			border-right-color var(--highlight)
			border-left-color var(--highlight)
			background-color transparent

		// After as line
		&:after
			top 0
			bottom 0
			left 50%
			margin-left 0
			width 1px
			height 100%
			border none
			background-color var(--border)
			transform none

		&:hover:after
			background-color var(--highlight) !important
			opacity 0.5
</style>
