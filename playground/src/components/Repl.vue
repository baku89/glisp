<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import {
	createSession,
	type DiagnosticView,
	type ReplResult,
	type Token,
} from '../lib/glisp'

interface HistoryItem {
	readonly id: number
	readonly kind: 'input' | 'output' | 'note'
	readonly source?: string
	readonly result?: ReplResult
}

const STORAGE_KEY = 'glisp-playground-history-v1'

const session = createSession()
const input = ref('')
const history = ref<HistoryItem[]>([])
const scrollEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
let nextId = 0

// Persist input history (text only — not eval results, those are
// re-derivable from re-running). On boot we re-evaluate every input
// so the env reflects the user's previous session.
onMounted(() => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (raw !== null) {
			const lines = JSON.parse(raw) as string[]
			for (const line of lines) replay(line)
		}
	} catch {
		// ignore — corrupted history shouldn't block the REPL
	}
	autoScroll()
	inputEl.value?.focus()
})

function persistHistory(): void {
	const inputs = history.value
		.filter(h => h.kind === 'input' && h.source !== undefined)
		.map(h => h.source!)
		.slice(-200)
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
	} catch {
		// quota / privacy mode — ignore
	}
}

function replay(src: string): void {
	const r = session.run(src)
	pushHistory({ id: nextId++, kind: 'input', source: src })
	pushHistory({ id: nextId++, kind: 'output', result: r })
}

function pushHistory(item: HistoryItem): void {
	history.value.push(item)
}

const canRun = computed(() => input.value.trim() !== '')

function run(): void {
	const src = input.value
	if (src.trim() === '') return
	// Multi-line auto-continuation: bail if the input still has open
	// brackets so the user can keep typing.
	if (!session.isComplete(src)) return

	const result = session.run(src)
	pushHistory({ id: nextId++, kind: 'input', source: src })
	pushHistory({ id: nextId++, kind: 'output', result })
	input.value = ''
	persistHistory()
	autoScroll()
}

function clearHistory(): void {
	history.value = []
	persistHistory()
}

function reset(): void {
	session.reset()
	clearHistory()
}

watch(history, () => autoScroll(), { deep: true })

async function autoScroll(): Promise<void> {
	await nextTick()
	const el = scrollEl.value
	if (el !== null) el.scrollTop = el.scrollHeight
}

function onKeydown(e: KeyboardEvent): void {
	// Enter alone runs; Shift+Enter / Cmd+Enter inserts a newline.
	// Auto-continuation also forces a newline when the input is incomplete.
	if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
		if (!session.isComplete(input.value)) return // let newline pass through
		e.preventDefault()
		run()
	}
}

function rerun(src: string): void {
	input.value = src
	inputEl.value?.focus()
}

function tokenClass(t: Token): string {
	return 't-' + t.kind
}

function levelClass(d: DiagnosticView): string {
	return 'd-' + d.level
}

function caretMarker(span: number): string {
	if (span <= 1) return '^'
	return '^' + '~'.repeat(span - 1)
}
</script>

<template>
	<div class="repl">
		<header>
			<span class="title">Glisp REPL</span>
			<nav>
				<button class="ghost" @click="clearHistory" title="Clear history">
					Clear
				</button>
				<button class="ghost" @click="reset" title="Reset env to prelude">
					Reset
				</button>
			</nav>
		</header>

		<div class="scroll" ref="scrollEl">
			<ol class="history">
				<li
					v-for="item in history"
					:key="item.id"
					:class="['line', 'line-' + item.kind]"
				>
					<template v-if="item.kind === 'input' && item.source !== undefined">
						<button
							class="rerun"
							@click="rerun(item.source)"
							title="Copy back to input"
						>
							›
						</button>
						<pre class="input-src">{{ item.source }}</pre>
					</template>

					<template v-else-if="item.kind === 'output' && item.result">
						<div class="output">
							<span
								v-for="(t, i) in item.result.tokens"
								:key="i"
								:class="tokenClass(t)"
								>{{ t.text }}</span
							>
							<span v-if="item.result.note" class="note"
								>; {{ item.result.note }}</span
							>
						</div>
						<div
							v-for="(d, i) in item.result.diagnostics"
							:key="i"
							class="diag"
							:class="levelClass(d)"
						>
							<div class="diag-msg">
								<span class="diag-tag">{{ d.level }}</span>
								<span>{{ d.message }}</span>
							</div>
							<template v-if="d.excerpt">
								<pre class="diag-line">{{ d.excerpt.line + 1 }} | {{
									d.excerpt.source
								}}</pre>
								<pre class="diag-caret">{{
									' '.repeat(
										String(d.excerpt.line + 1).length + 3 + d.excerpt.column
									) + caretMarker(d.excerpt.span)
								}}</pre>
							</template>
						</div>
					</template>
				</li>
				<li v-if="history.length === 0" class="empty">
					Try
					<code @click="rerun('(+ 1 2 3 4 5)')">(+ 1 2 3 4 5)</code>,
					<code @click="rerun('y = (+ 20 30)')">y = (+ 20 30)</code>, or
					<code @click="rerun('(map [1 2 3] (=> (n: number): number (* n n)))')"
						>(map [1 2 3] (=> (n: number): number (* n n)))</code
					>
				</li>
			</ol>
		</div>

		<form class="prompt" @submit.prevent="run">
			<span class="prompt-glyph">›</span>
			<textarea
				ref="inputEl"
				v-model="input"
				rows="1"
				placeholder="(+ 1 2)"
				autocapitalize="off"
				autocomplete="off"
				autocorrect="off"
				spellcheck="false"
				@keydown="onKeydown"
			></textarea>
			<button class="run" type="submit" :disabled="!canRun" title="Evaluate">
				Run
			</button>
		</form>
	</div>
</template>

<style scoped>
.repl {
	display: flex;
	flex-direction: column;
	height: 100%;
	max-height: 100dvh;
}

header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 12px 16px;
	border-bottom: 1px solid var(--border);
	background: var(--bg);
	position: sticky;
	top: 0;
	z-index: 1;
}

.title {
	font-weight: 600;
	letter-spacing: 0.04em;
	color: var(--fg);
}

nav {
	display: flex;
	gap: 8px;
}

button.ghost {
	background: transparent;
	border: 1px solid var(--border-strong);
	color: var(--fg-dim);
	padding: 4px 10px;
	border-radius: 4px;
	font-size: 12px;
}

button.ghost:hover {
	color: var(--fg);
	border-color: var(--accent);
}

.scroll {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	-webkit-overflow-scrolling: touch;
	padding: 8px 0 16px;
}

.history {
	list-style: none;
	margin: 0;
	padding: 0;
}

.line {
	display: flex;
	gap: 8px;
	padding: 4px 16px;
	white-space: pre-wrap;
	word-break: break-word;
}

.line-input {
	background: var(--bg-line);
	color: var(--fg);
	border-left: 2px solid var(--accent);
}

.line-output {
	background: var(--bg-line-alt);
}

.line-output .output {
	flex: 1;
}

.input-src {
	margin: 0;
	flex: 1;
	white-space: pre-wrap;
}

.rerun {
	flex: none;
	background: transparent;
	border: none;
	color: var(--accent);
	padding: 0 4px 0 0;
	font-size: 16px;
	line-height: 1.2;
}

.rerun:hover {
	color: var(--accent-warm);
}

.note {
	color: var(--fg-hint);
	margin-left: 8px;
}

.diag {
	margin-top: 4px;
	font-size: 13px;
}

.diag-msg {
	display: flex;
	gap: 8px;
}

.diag-tag {
	text-transform: uppercase;
	font-size: 10px;
	padding: 1px 6px;
	border-radius: 3px;
	letter-spacing: 0.06em;
	flex: none;
	align-self: flex-start;
	margin-top: 2px;
}

.d-error .diag-tag {
	background: rgba(255, 123, 114, 0.16);
	color: var(--diag-error);
}
.d-warning .diag-tag {
	background: rgba(242, 204, 96, 0.16);
	color: var(--diag-warning);
}
.d-info .diag-tag {
	background: rgba(88, 166, 255, 0.16);
	color: var(--diag-info);
}

.diag-line,
.diag-caret {
	margin: 0;
	color: var(--fg-dim);
	white-space: pre;
	overflow-x: auto;
}

.diag-caret {
	color: var(--diag-error);
}

.empty {
	padding: 24px 16px;
	color: var(--fg-dim);
	font-size: 13px;
}

.empty code {
	color: var(--accent);
	cursor: pointer;
	background: var(--bg-input);
	padding: 1px 6px;
	border-radius: 3px;
	border: 1px solid var(--border);
	margin: 0 2px;
	display: inline-block;
}

.empty code:hover {
	border-color: var(--accent);
}

.prompt {
	display: flex;
	align-items: flex-end;
	gap: 8px;
	padding: 8px 12px;
	border-top: 1px solid var(--border);
	background: var(--bg-input);
}

.prompt-glyph {
	color: var(--accent);
	padding: 8px 0 8px 4px;
	font-weight: 700;
}

textarea {
	flex: 1;
	min-height: 36px;
	max-height: 40vh;
	resize: none;
	background: transparent;
	border: none;
	outline: none;
	padding: 8px 4px;
	font-family: var(--mono);
	font-size: 14px;
	line-height: 1.5;
	color: var(--fg);
	field-sizing: content;
}

textarea::placeholder {
	color: var(--fg-hint);
}

button.run {
	flex: none;
	background: var(--accent);
	border: none;
	color: var(--bg);
	padding: 8px 14px;
	border-radius: 4px;
	font-weight: 600;
	letter-spacing: 0.04em;
}

button.run:disabled {
	background: var(--border-strong);
	color: var(--fg-hint);
	cursor: not-allowed;
}

/* Token colors */
.t-number {
	color: var(--token-number);
}
.t-string {
	color: var(--token-string);
}
.t-boolean {
	color: var(--token-boolean);
}
.t-symbol {
	color: var(--token-symbol);
}
.t-punct {
	color: var(--token-punct);
}
.t-closure {
	color: var(--token-closure);
}
.t-type {
	color: var(--token-type);
}
.t-hostfn {
	color: var(--token-hostfn);
}
.t-unit {
	color: var(--token-unit);
}
.t-plain {
	color: var(--fg);
}

@media (max-width: 600px) {
	header {
		padding: 10px 12px;
	}

	.line {
		padding: 4px 12px;
	}

	.prompt {
		padding: 8px;
	}
}
</style>
