<script setup lang="ts">
import type { Session } from '@glisp/lang'
import { InputButton } from 'tweeq/InputButton'
import { InputTextArea } from 'tweeq/InputTextArea'
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue'

import { createSession, type ReplResult, type Token } from './repl'

const props = defineProps<{ session: Session }>()

/** The session has changed, by what was run here. */
const emit = defineEmits<{ change: [] }>()

interface Entry {
	readonly id: number
	readonly source: string
	readonly result: ReplResult
}

const EXAMPLES = [
	'(+ 1 2 3 4 5)',
	'y = (+ 20 30)',
	':type +',
	'(map [1 2 3] (* % %))',
]

const session = createSession(props.session)
const input = ref('')
const entries = ref<Entry[]>([])
const $input = useTemplateRef('$input')
const $scroll = useTemplateRef<HTMLElement>('$scroll')
let nextId = 0

onMounted(() => $input.value?.focus())

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
	const result = dispatch(source)
	// `:clear` empties the list, and is not worth an entry in it.
	if (source !== ':clear') entries.value.push({ id: nextId++, source, result })
	input.value = ''
	void nextTick(() => {
		if ($scroll.value !== null) $scroll.value.scrollTop = $scroll.value.scrollHeight
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
	$input.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Enter' || event.shiftKey) return
	const source = input.value.trim()
	// An unfinished form goes on to the next line.
	if (!source.startsWith(':') && !session.isComplete(source)) return
	event.preventDefault()
	run()
}

const caret = (span: number): string => '^' + '~'.repeat(Math.max(0, span - 1))
</script>

<template>
	<div class="GlispRepl">
		<div class="toolbar">
			<InputButton subtle label="Clear" @click="clear" />
			<InputButton subtle label="Reset" @click="reset" />
		</div>

		<div ref="$scroll" class="scroll">
			<ol v-if="entries.length > 0" class="entries">
				<li v-for="entry in entries" :key="entry.id" class="entry">
					<button class="source" type="button" @click="recall(entry.source)">
						{{ entry.source }}
					</button>
					<div v-if="entry.result.tokens.length > 0" class="output">
						<span
							v-for="(token, i) in entry.result.tokens"
							:key="i"
							:class="token.kind"
							>{{ token.text }}</span
						>
						<span v-if="entry.result.note" class="note">
							; {{ entry.result.note }}</span
						>
					</div>
					<div
						v-for="(diagnostic, i) in entry.result.diagnostics"
						:key="i"
						class="diagnostic"
						:class="diagnostic.level"
					>
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
				</li>
			</ol>
			<ul v-else class="examples">
				<li v-for="example in EXAMPLES" :key="example">
					<button class="source" type="button" @click="recall(example)">
						{{ example }}
					</button>
				</li>
			</ul>
		</div>

		<form class="prompt" @submit.prevent="run">
			<InputTextArea
				ref="$input"
				v-model="input"
				font="monospace"
				placeholder="(+ 1 2) or :help"
				@keydown="onKeydown"
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
	min-height: 0;
	overflow-y: auto;
	font-family: var(--tq-font-code);
}
.entries,
.examples {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-control);
	list-style: none;
}
.source {
	display: block;
	width: 100%;
	text-align: left;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--tq-color-text-mute);
	cursor: pointer;
}
.source:hover {
	color: var(--tq-color-text);
}
.output,
.diagnostic {
	white-space: pre-wrap;
	word-break: break-word;
}
.note,
.punct,
.hostfn,
.unit {
	color: var(--tq-color-text-mute);
}
.number {
	color: var(--tq-color-info);
}
.string {
	color: var(--tq-color-success);
}
.boolean {
	color: var(--tq-color-warning);
}
.type {
	color: var(--tq-color-accent);
}
.diagnostic.error {
	color: var(--tq-color-error);
}
.diagnostic.warning {
	color: var(--tq-color-warning);
}
.diagnostic.info {
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
.prompt > :first-child {
	flex: 1;
	min-width: 0;
}
</style>
