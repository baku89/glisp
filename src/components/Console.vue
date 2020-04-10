<template>
	<div class="Console" />
</template>

<script lang="ts">
import {Component, Vue} from 'vue-property-decorator'
import {consoleREP} from '@/impl/view'
import {printer} from '@/impl/printer'

@Component
export default class Console extends Vue {
	private mounted() {
		// eslint-disable-next-line no-undef
		const jqconsole = ($(this.$el) as any).jqconsole('', '>>>')

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
			jqconsole.Clear()
		}

		// Handle a command.
		const handler = function(line?: string) {
			if (line) {
				consoleREP(line)
			}
			jqconsole.Prompt(true, handler)
		}

		// Move to line start Ctrl+A.
		jqconsole.RegisterShortcut('A', function() {
			jqconsole.MoveToStart()
			handler()
		})
		// Move to line end Ctrl+E.
		jqconsole.RegisterShortcut('E', function() {
			jqconsole.MoveToEnd()
			handler()
		})
		jqconsole.RegisterMatching('{', '}', 'brace')
		jqconsole.RegisterMatching('(', ')', 'paren')
		jqconsole.RegisterMatching('[', ']', 'bracket')
		jqconsole.RegisterMatching('"', '"', 'dquote')

		// Initiate the first prompt.
		handler()
	}
}
</script>

<style lang="stylus">
.Console
	position relative
	height 100%
	text-align left
	font-size 1rem

.jqconsole
	font-family 'Fira Code', monospace !important
	font-variant-ligatures normal !important

	&-cursor
		background var(--selection)
		transition background var(--tdur) ease

	&-prompt, &-old-prompt
		color var(--foreground)
		transition color var(--tdur) ease

	&-output
		color var(--comment)
		transition color var(--tdur) ease

	&-return
		color var(--comment)
		transition color var(--tdur) ease

	&-error
		color var(--red)
		transition color var(--tdur) ease

	.brace, .paren, .bracket, .dquote
		color var(--yellow)
		transition color var(--tdur) ease
</style>
