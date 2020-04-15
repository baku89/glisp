<template>
	<div class="Console" :class="{compact}" />
</template>

<script lang="ts">
import {Component, Vue, Prop} from 'vue-property-decorator'
import {consoleREP} from '@/impl/view'
import {printer} from '@/impl/printer'

@Component
export default class Console extends Vue {
	@Prop({type: Boolean, required: true}) private compact!: boolean

	private mounted() {
		// eslint-disable-next-line no-undef
		const jqconsole = ($(this.$el) as any).jqconsole('', '>>>')

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

		// Fire the setup event so that main app can run initial evaluation
		this.$emit('setup')
	}
}
</script>

<style lang="stylus">
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
	font-family 'Fira Code', monospace !important
	font-variant-ligatures normal !important

	&-cursor
		background var(--selection)
		transition background var(--tdur) var(--ease)

	&-prompt, &-old-prompt
		color var(--foreground)
		transition color var(--tdur) var(--ease)

	&-output
		color var(--comment)
		transition color var(--tdur) var(--ease)

	&-return
		color var(--comment)
		transition color var(--tdur) var(--ease)

	&-error
		color var(--red)
		transition color var(--tdur) var(--ease)

	.brace, .paren, .bracket, .dquote
		color var(--yellow)
		transition color var(--tdur) var(--ease)
</style>
