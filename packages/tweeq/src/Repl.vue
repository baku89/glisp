<script setup lang="ts">
import type { Session } from '@glisp/lang'
import { InputButton } from 'tweeq/InputButton'
import { Icon } from 'tweeq/Icon'
import { InputCode } from 'tweeq/InputCode'
import { ScrollArea } from 'tweeq/ScrollArea'
import * as monaco from 'monaco-editor'
import { computed, nextTick, ref, useTemplateRef } from 'vue'

import GlispCode from './GlispCode.vue'
import { EDITOR_OPTIONS, GLISP, registerGlisp } from './language'
import {
	createSession,
	InputHistory,
	type ReplResult,
	segmentsOf,
	type Token,
} from './repl'

const props = defineProps<{ session: Session }>()

/** The session has changed, by what was run here. */
const emit = defineEmits<{ change: [] }>()

interface Entry {
	readonly id: number
	readonly source: string
	readonly result: ReplResult
}

registerGlisp()

const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
	...EDITOR_OPTIONS,
	placeholder: '(+ 1 2) or :help',
}

const session = createSession(props.session)
const input = ref('')
const entries = ref<Entry[]>([])
let editor: monaco.editor.IStandaloneCodeEditor | null = null
const $scroll = useTemplateRef<{ $el: HTMLElement }>('$scroll')
let nextId = 0
const history = new InputHistory()

function onMount(instance: monaco.editor.IStandaloneCodeEditor): void {
	editor = instance
	instance.focus()
	instance.onKeyDown(event => {
		if (handleKey(event, instance)) {
			event.preventDefault()
			event.stopPropagation()
		}
	})
}

/** The keys a shell has. True if it was one, and has been dealt with. */
function handleKey(
	event: monaco.IKeyboardEvent,
	instance: monaco.editor.IStandaloneCodeEditor
): boolean {
	const line = instance.getPosition()?.lineNumber ?? 1
	const lastLine = instance.getModel()?.getLineCount() ?? 1
	switch (event.keyCode) {
		case monaco.KeyCode.Enter: {
			if (event.shiftKey) return false
			const source = input.value.trim()
			// An unfinished form goes on to the next line.
			if (!source.startsWith(':') && !session.isComplete(source)) return false
			run()
			return true
		}
		// Within multi-line input first, and then through what was entered.
		case monaco.KeyCode.UpArrow: {
			if (line !== 1) return false
			const text = history.previous(input.value)
			if (text !== null) recall(text)
			return true
		}
		case monaco.KeyCode.DownArrow: {
			if (line !== lastLine) return false
			const text = history.next()
			if (text !== null) recall(text)
			return true
		}
		// Abandon what is being written, on Ctrl and not Cmd, which copies.
		case monaco.KeyCode.KeyC:
			if (!event.ctrlKey || !instance.getSelection()?.isEmpty()) return false
			input.value = ''
			return true
		case monaco.KeyCode.KeyL:
			if (!event.ctrlKey) return false
			clear()
			return true
		default:
			return false
	}
}

const canRun = computed(() => input.value.trim() !== '')

const say = (text: string): ReplResult => ({
	tokens: [{ kind: 'plain', text }],
	diagnostics: [],
})

function dispatch(source: string): ReplResult {
	if (source.startsWith(':')) return runCommand(source)
	const result = session.run(source)
	emit('change')
	return result
}

function runCommand(source: string): ReplResult {
	const [, head = '', args = ''] = /^:(\S*)\s*([\s\S]*)$/.exec(source) ?? []
	const usage = (shape: string): ReplResult => say(`usage: :${head} ${shape}`)
	switch (head) {
		case 'type':
			return args === '' ? usage('<expr>') : session.typeOf(args)
		case 'check':
			return args === '' ? usage('<expr>') : session.check(args)
		case 'expand':
			return args === '' ? usage('<expr>') : session.expand(args)
		case 'doc':
			return args === '' ? usage('<name>') : session.doc(args)
		case 'env': {
			const names = session.bindings()
			return names.length === 0
				? say('(empty session)')
				: {
						tokens: names.flatMap((text, i): Token[] => [
							...(i > 0 ? [{ kind: 'plain', text: '  ' } as Token] : []),
							{ kind: 'symbol', text },
						]),
						diagnostics: [],
					}
		}
		case 'tree':
			return say(session.tree())
		case 'reset':
			reset()
			return say('(session reset)')
		case 'clear':
			clear()
			return { tokens: [], diagnostics: [] }
		case 'help':
			return say(
				':type <e>   :check <e>   :expand <e>   :doc <name>   :env   :tree   :reset   :clear   :help'
			)
		default:
			return {
				tokens: [],
				diagnostics: [{ level: 'error', message: `unknown command: :${head}` }],
			}
	}
}

function run(): void {
	const source = input.value.trim()
	if (source === '') return
	if (!source.startsWith(':') && !session.isComplete(source)) return
	history.push(source)
	const result = dispatch(source)
	// `:clear` empties the list, and is not worth an entry in it.
	if (source !== ':clear') entries.value.push({ id: nextId++, source, result })
	input.value = ''
	void nextTick(() => {
		const el = $scroll.value?.$el
		if (el) el.scrollTop = el.scrollHeight
	})
}

function clear(): void {
	entries.value = []
}

function reset(): void {
	session.reset()
	clear()
	emit('change')
}

function recall(source: string): void {
	input.value = source
	void nextTick(() => {
		const end = editor?.getModel()?.getFullModelRange().getEndPosition()
		if (end !== undefined) editor?.setPosition(end)
		editor?.focus()
	})
}

const DIAGNOSTIC_ICONS = {
	error: 'mdi:alert-circle-outline',
	warning: 'mdi:alert-outline',
	info: 'mdi:information-outline',
} as const

const caret = (span: number): string => '^' + '~'.repeat(Math.max(0, span - 1))
</script>

<template>
	<div class="GlispRepl">
		<div class="toolbar">
			<InputButton subtle label="Clear" @click="clear" />
		</div>

		<ScrollArea ref="$scroll" class="scroll">
			<ol v-if="entries.length > 0" class="entries">
				<li v-for="entry in entries" :key="entry.id" class="entry">
					<button
						class="mark recall"
						type="button"
						title="Write Again"
						@click="recall(entry.source)"
					>
						<Icon icon="mdi:chevron-right" />
					</button>
					<div class="source">
						<GlispCode :source="entry.source" />
					</div>
					<template v-if="entry.result.tokens.length > 0">
						<Icon class="mark" icon="mdi:chevron-left" />
						<div class="output">
							<template
								v-for="(segment, i) in segmentsOf(entry.result.tokens)"
								:key="i"
							>
								<GlispCode v-if="segment.code" :source="segment.text" />
								<template v-else>{{ segment.text }}</template>
							</template>
							<span v-if="entry.result.note" class="note">
								; {{ entry.result.note }}</span
							>
						</div>
					</template>
					<template v-for="(diagnostic, i) in entry.result.diagnostics" :key="i">
						<Icon
							class="mark"
							:class="diagnostic.level"
							:icon="DIAGNOSTIC_ICONS[diagnostic.level]"
						/>
						<div class="diagnostic" :class="diagnostic.level">
							<div>{{ diagnostic.message }}</div>
							<template v-if="diagnostic.excerpt">
								<pre class="excerpt">{{ diagnostic.excerpt.line + 1 }} | {{
									diagnostic.excerpt.source
								}}</pre>
								<pre class="excerpt caret">{{
									' '.repeat(
										String(diagnostic.excerpt.line + 1).length +
											3 +
											diagnostic.excerpt.column
									) + caret(diagnostic.excerpt.span)
								}}</pre>
							</template>
						</div>
					</template>
				</li>
			</ol>
		</ScrollArea>

		<form class="prompt" @submit.prevent="run">
			<Icon class="mark prompt-mark" icon="mdi:chevron-right" />
			<InputCode
				v-model="input"
				:lang="GLISP"
				:options="OPTIONS"
				@mount="onMount"
			/>
			<InputButton icon="mdi:play" :disabled="!canRun" tooltip="Run" @click="run" />
		</form>
	</div>
</template>

<style scoped>
.GlispRepl {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-control);
	height: 100%;
	min-height: 0;
	color: var(--tq-color-text);
}
.toolbar {
	display: flex;
	justify-content: flex-end;
	gap: var(--tq-gap-related);
}
.scroll {
	flex: 1;
	font-family: var(--tq-font-code);
}
.entries {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-control);
	padding: 0;
	margin: 0;
	list-style: none;
	/* Tweeq's own controls cannot be selected, but what is written here is to copy. */
	user-select: text;
}
.entry {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: var(--tq-gap-related);
}
.mark {
	flex-shrink: 0;
	width: 20px;
	height: 1lh;
	color: var(--tq-color-text-mute);
	user-select: none;
}
.recall {
	color: var(--tq-color-accent);
	cursor: pointer;
}
.recall:hover {
	opacity: 0.7;
}
.source,
.output,
.diagnostic {
	white-space: pre-wrap;
	word-break: break-word;
}
.note {
	color: var(--tq-color-text-mute);
}
.error {
	color: var(--tq-color-error);
}
.warning {
	color: var(--tq-color-warning);
}
.info {
	color: var(--tq-color-info);
}
.excerpt {
	overflow-x: auto;
	color: var(--tq-color-text-mute);
	font-family: inherit;
}
.excerpt.caret {
	color: inherit;
}
.prompt {
	display: flex;
	align-items: flex-end;
	gap: var(--tq-gap-related);
}
.prompt > :nth-child(2) {
	flex: 1;
	min-width: 0;
}
.prompt-mark {
	align-self: center;
	color: var(--tq-color-accent);
}
</style>
