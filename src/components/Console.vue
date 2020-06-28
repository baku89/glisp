<template>
	<div class="Console" :class="{compact}" ref="el" />
</template>

<script lang="ts">
import {defineComponent, onMounted, ref, Ref} from '@vue/composition-api'
import {printer} from '@/mal/printer'
import ConsoleScope from '../scopes/console'
import 'jq-console'

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

function jqsaveHistory(jq: any) {
	const lines = jq.GetHistory()
	localStorage['mal_history'] = JSON.stringify(lines)
}

export default defineComponent({
	name: 'Console',
	props: {
		compact: {
			type: Boolean,
			required: true
		}
	},
	setup(props, context) {
		const el = ref(null) as Ref<null | HTMLElement>

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

			printer.pseudoExecute = (command: string) => {
				jqconsole.Write(`>>>${command}\n`, 'jqconsole-prompt')
				// Add the command to history (with auto save)
				const history = jqconsole.GetHistory()
				history.push(command)
				jqconsole.SetHistory(history)
				jqsaveHistory(jqconsole)
			}

			printer.clear = () => {
				jqconsole.Clear()
			}

			// Handle a command.
			const handler = (line?: string) => {
				if (line) {
					ConsoleScope.REP(line)
					jqsaveHistory(jqconsole)
				}
				jqconsole.Prompt(true, handler)
			}

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
			jqconsole.RegisterMatching('{', '}', 'brace')
			jqconsole.RegisterMatching('(', ')', 'paren')
			jqconsole.RegisterMatching('[', ']', 'bracket')
			jqconsole.RegisterMatching('"', '"', 'dquote')

			// Initiate the first prompt.
			handler()

			// Fire the setup event so that main app can run initial evaluation
			context.emit('setup')
		})

		return {el}
	}
})
</script>

<style lang="stylus">
@import 'style/common.styl'

.Console
	position relative
	height 100%
	text-align left
	font-size 1rem

	&.compact
		overflow hidden

		& > div
			top auto !important
			overflow hidden !important

.jqconsole
	font-monospace()

	&-cursor
		background var(--selection)

	&-prompt, &-old-prompt
		color var(--foreground)

	&-output
		color var(--comment)

	&-return
		color var(--comment)

	&-error
		color var(--warning)

	.brace, .paren, .bracket, .dquote
		color var(--yellow)
</style>
