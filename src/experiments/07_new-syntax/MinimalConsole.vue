<template>
	<div class="Console" ref="el" />
</template>

<script lang="ts">
// eslint-disable-next-line simple-import-sort/imports
import $ from 'jquery'

import 'jq-console'

import {defineComponent, onMounted, PropType, ref} from 'vue'

const MAX_HISTORY_LENGTH = 1000

function loadHistory(jq: any, name: string) {
	if (localStorage[`console-history_${name}`]) {
		let lines = JSON.parse(localStorage[`console-history_${name}`])
		if (lines.length > MAX_HISTORY_LENGTH) {
			lines = lines.slice(lines.length - MAX_HISTORY_LENGTH)
		}
		jq.SetHistory(lines)
	}
}

function saveHistory(jq: any, name: string) {
	const lines = jq.GetHistory()
	localStorage[`console-history_${name}`] = JSON.stringify(lines)
}

export default defineComponent({
	props: {
		rep: {
			type: Function as PropType<(str: string) => Promise<string> | string>,
			required: true,
		},
		name: {
			type: String,
			default: 'minimal-console',
		},
	},
	emits: ['setup'],
	setup(props, context) {
		const el = ref<null | HTMLElement>(null)

		onMounted(() => {
			if (!el.value) return

			// eslint-disable-next-line no-undef
			const jqconsole = ($(el.value) as any).jqconsole('', '', '   ')

			loadHistory(jqconsole, props.name)

			// Initiate the first prompt.
			// Handle a command.
			const handler = async (line?: string) => {
				if (line) {
					try {
						const ret = await props.rep(line)
						jqconsole.Write(ret + '\n', 'jqconsole-return')
					} catch (err) {
						jqconsole.Write(err + '\n', 'jqconsole-error')
					}
					saveHistory(jqconsole, props.name)
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
				jqconsole.RegisterMatching('{', '}', 'bracket-match')
				jqconsole.RegisterMatching('(', ')', 'bracket-match')
				jqconsole.RegisterMatching('[', ']', 'bracket-match')
			}
			setupConsole()

			handler()

			context.emit('setup', {
				append: (el: Element) => jqconsole.Append($(el)),
			})
		})

		return {el}
	},
})
</script>

<style lang="stylus">
@import '~@/components/style/common.styl'

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
			background base16('04')
			opacity 0.4

	&-cursor
		background base16('04')
		transform scaleX(0.2) translateX(-10%)
		transform-origin 0 0

	&-prompt, &-old-prompt
		&:before
			color base16('03')
			content '>> '
			font-weight bold

	&-old-prompt
		color base16('04')

	&-prompt
		color base16('06')

		&:before
			color base16('03')
			content '>> '
			font-weight bold

	&-output
		color var(--none)

	&-return
		color base16('09')

	&-error
		color base16('08')

	.bracket-match
		background base16('02')
		box-shadow inset 0 0 0 1px base16('03')
</style>
