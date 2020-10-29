<template>
	<div id="app" class="PageInterpreter">
		<Splitpanes class="default-theme">
			<Pane class="PageInterpreter__pane">
				<Console
					v-if="isReplInitialized"
					:scope="scope"
					@setup="onSetupConsole"
				/>
			</Pane>
			<Pane class="PageInterpreter__pane PageInterpreter__code">
				<GlispEditor class="PageInterpreter__editor" v-model="code" />
				<div class="PageInterpreter__actions">
					<InputButton class="button" @click="runCode" label="Run" />
					<InputCheckbox v-model="clearCode" label="Clear" />
				</div>
			</Pane>
		</Splitpanes>
		<div v-if="isRecordingBind" class="PageInterpreter__bind-recording-frame" />
	</div>
</template>

<script lang="ts">
import 'normalize.css'
import {defineComponent, ref, shallowRef, watch} from 'vue'

import useScheme from '@/components/use/use-scheme'
import useBind from '@/components/use/use-bind/index.ts'

import {Splitpanes, Pane} from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import Console from '@/components/Console.vue'
import GlispEditor from '@/components/GlispEditor'
import InputCheckbox from '@/components/inputs/InputCheckbox.vue'
import InputButton from '@/components/inputs/InputButton.vue'

import Scope from '@/mal/scope'
import {printer} from '@/mal/printer'
import {MalBoolean, MalNil} from '@/mal/types'

export default defineComponent({
	name: 'PageInterpreter',
	components: {
		Splitpanes,
		Pane,
		Console,
		GlispEditor,
		InputCheckbox,
		InputButton,
	},
	setup() {
		const scope = shallowRef<null | Scope>(null)
		const code = ref('')
		const clearCode = ref(false)
		const isReplInitialized = ref(false)
		const isRecordingBind = ref(false)

		useScheme()
		;(async () => {
			scope.value = await Scope.createRepl()

			// Register as app command
			scope.value.def('run-code', runCode)

			scope.value.def('set-clear-code', (value: MalBoolean) => {
				clearCode.value = !!value.value
				return MalNil.from()
			})

			watch(
				() => code.value,
				v => scope.value?.def('*code*', v),
				{immediate: true}
			)

			const {isRecordingBind: _recording} = useBind(scope.value)
			watch(
				() => _recording.value,
				flag => (isRecordingBind.value = flag)
			)

			isReplInitialized.value = true
		})()

		function onSetupConsole() {
			scope.value?.REP(`(str "Glisp [" *host-language* "]")`)
		}

		function runCode() {
			printer.rep(`(do\n${code.value}\n)`)

			if (clearCode.value) {
				code.value = ''
			}

			return MalNil.from()
		}

		return {
			scope,
			code,
			clearCode,
			isReplInitialized,
			isRecordingBind,
			runCode,
			onSetupConsole,
		}
	},
})
</script>

<style lang="stylus">
@import '../../components/style/common.styl'
@import '../../components/style/global.styl'

.PageInterpreter
	app()
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
			margin-right 1rem

	&__bind-recording-frame
		position fixed
		top 0
		right 0
		bottom 0
		left 0
		z-index 1000
		border 1rem solid var(--error)
		animation recording-frame-bounce 0.5s infinite alternate

@keyframes recording-frame-bounce
	0%
		opacity 0.5

	100%
		opacity 1

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
			border-right 1px dotted var(--frame)
			border-left 1px dotted var(--frame)
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
			background-color var(--frame)
			transform none

		&:hover:after
			background-color var(--highlight) !important
			opacity 0.5
</style>
