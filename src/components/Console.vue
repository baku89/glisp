<template>
	<div class="Console" />
</template>

<script lang="ts">
import {Component, Vue} from 'vue-property-decorator'
import {PRINT, EVAL, REP} from '@/impl/repl'
import {printer} from '@/impl/printer'
import {BlankException} from '@/impl/reader'

@Component
export default class Console extends Vue {
	private mounted() {
		// eslint-disable-next-line no-undef
		const jqconsole = ($(this.$el) as any).jqconsole('', '>>>')

		printer.println = (...args: Array<any>) => {
			const str = args.join(' ')
			jqconsole.Write(str + '\n', 'jqconsole-output')
		}

		// Handle a command.
		const handler = function(line?: string) {
			if (line) {
				try {
					jqconsole.Write(REP(line) + '\n', 'jqconsole-return')
				} catch (exc) {
					if (exc instanceof BlankException) {
						return
					}
					if (exc.stack) {
						jqconsole.Write(exc.stack + '\n', 'jqconsole-error')
					} else {
						jqconsole.Write(exc + '\n', 'jqconsole-error')
					}
				}
				// jq_save_history(jqconsole)
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
	background-color black
	color white
	text-align left
	font-size 1rem

.jqconsole
	font-family 'Fira Code', monospace !important

	&-cursor
		background-color gray

	&-prompt, &-old-prompt
		color #ddd

	&-output
		color gray

	&-return
		color white

	&-error
		color red

	.brace
		color #00FFFF

	.paren
		color #FF00FF

	.bracket
		color #FFFF00

	.dquote
		color #FF8888
</style>
