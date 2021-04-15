<template>
	<div class="Console" ref="el" />
</template>

<script lang="ts">
// eslint-disable-next-line simple-import-sort/sort
import $ from 'jquery'
import 'jq-console'

import {defineComponent, onMounted, PropType, ref} from 'vue'

import {printer} from '@/mal/printer'
import Scope from '@/mal/scope'

const MAX_HISTORY_LENGTH = 1000

function loadHistory(jq: any) {
	if (localStorage['mal_history']) {
		let lines = JSON.parse(localStorage['mal_history'])
		if (lines.length > MAX_HISTORY_LENGTH) {
			lines = lines.slice(lines.length - MAX_HISTORY_LENGTH)
		}
		jq.SetHistory(lines)
	}
}

function saveHistory(jq: any) {
	const lines = jq.GetHistory()
	localStorage['mal_history'] = JSON.stringify(lines)
}

export default defineComponent({
	name: 'Console',
	props: {
		scope: {
			type: Object as PropType<Scope>,
			required: true,
		},
	},
	emits: ['setup'],
	setup(props, context) {
		const el = ref<null | HTMLElement>(null)

		onMounted(() => {
			if (!el.value) return

			// eslint-disable-next-line no-undef
			const jqconsole = ($(el.value) as any).jqconsole('', '>>>')

			loadHistory(jqconsole)

			// Change the logging target to native console to this
			printer.log = (...args: Array<any>) => {
				const str = args.join(' ')
				jqconsole.Write(str + '\n', 'jqconsole-output')
			}

			printer.return = (...args: Array<any>) => {
				const str = args.join(' ')
				jqconsole.Write(str + '\n', 'jqconsole-return')
			}

			printer.error = (...args: Array<any>) => {
				const str = args.join(' ')
				jqconsole.Write(str + '\n', 'jqconsole-error')
			}

			printer.clear = () => {
				const history = jqconsole.GetHistory()
				jqconsole.Reset()
				jqconsole.SetHistory(history)
				setupConsole()
			}

			async function rep(command: string) {
				jqconsole.Write(`>>>${command}\n`, 'jqconsole-prompt')

				// Execute
				await props.scope.REP(command)

				// Add the command to history
				const history = jqconsole.GetHistory()
				history.push(command)
				jqconsole.SetHistory(history)
				saveHistory(jqconsole)
			}

			printer.rep = rep

			// Handle a command.
			const handler = async (line?: string) => {
				if (line) {
					await props.scope.REP(line)
					saveHistory(jqconsole)
				}
				jqconsole.Prompt(true, handler)
			}

			// Setup console
			function setupConsole() {
				// Move to line start Ctrl+A.
				jqconsole.RegisterShortcut('A', () => {
					jqconsole.MoveToStart()
					handler()
				})
				// Move to line end Ctrl+E.
				jqconsole.RegisterShortcut('E', () => {
					jqconsole.MoveToEnd()
					handler()
				})

				// Setup Glisp Syntax
				jqconsole.RegisterMatching('{', '}', 'brace')
				jqconsole.RegisterMatching('(', ')', 'paren')
				jqconsole.RegisterMatching('[', ']', 'bracket')
				jqconsole.RegisterMatching('"', '"', 'dquote')
			}
			setupConsole()

			// Initiate the first prompt.
			handler()

			// Fire the setup event so that main app can run initial evaluation
			context.emit('setup', rep)
		})

		return {el}
	},
})
</script>

<style lang="stylus">
@import 'style/common.styl'

.Console
	position relative
	height 100%
	text-align left
	font-size 1rem
	line-height 1.2em

.jqconsole
	white-space pre-wrap
	font-monospace()

	&-blurred
		.jqconsole-cursor
			background var(--frame)
			opacity 0.4

	&-cursor
		background var(--editor-foreground)
		transform scaleX(0.2) translateX(-10%)
		transform-origin 0 0

	&-prompt, &-old-prompt
		color var(--editor-foreground)

	&-output
		color var(--comment)

	&-return
		color var(--comment)

	&-error
		color var(--error)

	.brace, .paren, .bracket, .dquote
		color var(--yellow)
</style>
