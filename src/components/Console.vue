<template>
	<div class="Console" :class="{compact}" ref="el" />
</template>

<script lang="ts">
import {defineComponent, onMounted, ref, Ref} from '@vue/composition-api'
import {consoleREP} from '@/mal/console'
import {printer} from '@/mal/printer'

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
			const handler = (line?: string) => {
				if (line) {
					consoleREP(line)
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

	&-prompt, &-old-prompt
		color var(--foreground)

	&-output
		color var(--comment)

	&-return
		color var(--comment)

	&-error
		color var(--red)

	.brace, .paren, .bracket, .dquote
		color var(--yellow)
</style>
