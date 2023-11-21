<script lang="ts" setup>
import 'jq-console'

import {onMounted, Ref, ref} from 'vue'

import {printer} from '@/mal/printer'
import ConsoleScope from '@/scopes/console'

defineProps<{
	compact?: boolean
}>()

const emit = defineEmits<{
	setup: []
}>()

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
	emit('setup')
})
</script>

<template>
	<div ref="el" class="Console" :class="{compact}" />
</template>

<style lang="stylus">
@import 'style/common.styl'

.Console
	position relative
	height 100%
	text-align left
	font-size 1rem
	line-height 1.2em

	&.compact
		overflow hidden

		& > div
			top auto !important
			overflow hidden !important

.jqconsole
	font-monospace()

	&-blurred
		.jqconsole-cursor
			background var(--selection)
			opacity 0.4

	&-cursor
		background var(--foreground)
		transform scaleX(0.2) translateX(-10%)
		transform-origin 0 0

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
