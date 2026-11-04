<script setup lang="ts">
import { print } from '@glisp/lang'
import * as monaco from 'monaco-editor'
import { InputButton } from 'tweeq/InputButton'
import { InputCode } from 'tweeq/InputCode'
import { computed, nextTick, ref, watch } from 'vue'

import { type GlispDocument } from './document'
import { EDITOR_OPTIONS, GLISP, registerGlisp } from './language'
import { readProgram, rowsAcross, rowWritten, sourceOfProgram, writtenAt } from './programSource'

const props = defineProps<{
	document: GlispDocument
	/** The rows selected, whose code is what is selected here. */
	selected?: readonly string[]
}>()

const emit = defineEmits<{
	/** Whether what is written can be read, as what shows is the last that could. */
	problem: [isThere: boolean]
	/** What a cursor or a selection here is in: a row to each of them. */
	select: [rows: readonly string[]]
}>()

registerGlisp()

const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
	...EDITOR_OPTIONS,
	automaticLayout: true,
	lineNumbers: 'off',
	folding: false,
	minimap: { enabled: false },
	scrollBeyondLastLine: false,
	// Selected is what rows are, as much as anything being edited, with nothing to see in the gaps.
	renderWhitespace: 'none',
}

const draft = ref(sourceOfProgram(props.document.root.value))
const reading = computed(() => readProgram(draft.value))
const problem = computed(() =>
	'message' in reading.value ? reading.value : null
)

let editor: monaco.editor.IStandaloneCodeEditor | null = null

function showProblem(): void {
	const model = editor?.getModel()
	if (!model) return
	const found = problem.value
	if (found === null) {
		monaco.editor.setModelMarkers(model, GLISP, [])
		return
	}
	const start = model.getPositionAt(found.offset)
	const end = model.getPositionAt(found.offset + 1)
	monaco.editor.setModelMarkers(model, GLISP, [
		{
			severity: monaco.MarkerSeverity.Error,
			message: found.message,
			startLineNumber: start.lineNumber,
			startColumn: start.column,
			endLineNumber: end.lineNumber,
			endColumn: end.column,
		},
	])
}

/** What came from here, which has nothing to go back to, being where it came from. */
let rowsFromHere: readonly string[] | null = null
const isSame = (a: readonly string[], b: readonly string[]): boolean => a.join() === b.join()

function onCursorMoved(): void {
	const model = editor?.getModel()
	const current = reading.value
	if (!model || !('ast' in current)) return
	const { ast } = current
	const env = props.document.env.value
	const rows = (editor?.getSelections() ?? []).flatMap(selection => {
		const from = model.getOffsetAt(selection.getStartPosition())
		const to = model.getOffsetAt(selection.getEndPosition())
		const within = rowWritten(ast, env, from, to)
		return within === null ? rowsAcross(ast, env, from, to) : [within]
	})
	rowsFromHere = [...new Set(rows)]
	if (!isSame(rowsFromHere, props.selected ?? [])) emit('select', rowsFromHere)
}

/** Has the code of the rows be what is selected here, or where the cursor is if there are none. */
function showRows(rows: readonly string[]): void {
	const model = editor?.getModel()
	const current = reading.value
	if (!editor || !model || !('ast' in current)) return
	const { ast } = current
	const env = props.document.env.value
	const ranges = rows.flatMap(row => {
		const written = writtenAt(ast, env, row)
		if (written === null) return []
		const start = model.getPositionAt(written.from)
		const end = model.getPositionAt(written.to)
		return [new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column)]
	})
	const [first] = ranges
	if (first === undefined) {
		const at = editor.getPosition()
		if (at) editor.setPosition(at)
		return
	}
	editor.setSelections(ranges)
	editor.revealRangeInCenterIfOutsideViewport(first)
}

function onMount(instance: monaco.editor.IStandaloneCodeEditor): void {
	editor = instance
	showProblem()
	showRows(props.selected ?? [])
	// What is only being shown here moves it too, as what is written anew does, and neither
	// is anything being pointed at. The first click comes before there is any focus to go by.
	instance.onDidChangeCursorSelection(({ source, reason }) => {
		const isShown = source === 'api' || reason === monaco.editor.CursorChangeReason.ContentFlush
		if (!isShown) onCursorMoved()
	})
}

watch(
	() => props.selected ?? [],
	rows => {
		// What is being selected here is not to be taken away, however many times it comes back.
		if (rowsFromHere !== null && isSame(rows, rowsFromHere)) return
		rowsFromHere = null
		showRows(rows)
	}
)

// What is written anew has what was selected in it somewhere else.
watch(
	draft,
	() => {
		if (!editor?.hasTextFocus()) void nextTick(() => showRows(props.selected ?? []))
	},
	{ flush: 'post' }
)

// Whatever can be read shows as it is written, for its result to be watched.
watch(draft, () => {
	const current = reading.value
	if ('ast' in current && print(current.ast) !== print(props.document.root.value)) {
		props.document.setRoot(current.ast)
	}
})

watch(
	problem,
	found => {
		emit('problem', found !== null)
		showProblem()
	},
	{ flush: 'post', immediate: true }
)

// An edit from elsewhere comes in, unless it reads the same, so as to keep how it is
// written, or it cannot be read, so as not to lose what was being typed.
watch(props.document.root, root => {
	const current = reading.value
	if ('ast' in current && print(current.ast) !== print(root)) {
		draft.value = sourceOfProgram(root)
	}
})

function revert(): void {
	draft.value = sourceOfProgram(props.document.root.value)
}
</script>

<template>
	<div class="AstProgramCode" data-selects-rows>
		<InputCode v-model="draft" class="code" :lang="GLISP" :options="OPTIONS" @mount="onMount" />
		<div v-if="problem !== null" class="problem">
			<p class="message">{{ problem.message }}</p>
			<InputButton
				icon="mdi:restore"
				subtle
				tooltip="Back to what is showing"
				@click="revert"
			/>
		</div>
	</div>
</template>

<style scoped>
.AstProgramCode {
	display: flex;
	flex-direction: column;
	gap: var(--tq-gap-related);
	height: 100%;
	min-height: 0;
	font-family: var(--tq-font-code);
}
/* From what is written, which is the only height that the field has of its own. */
.code {
	flex: 1 1 auto;
	min-height: 0;
}
/* The panel is the editor, so the field has no box of its own. */
.AstProgramCode :deep(.TqInputCode),
.AstProgramCode :deep(.TqInputCode:focus-within) {
	max-height: none;
	background: none;
	box-shadow: none;
}
.problem {
	display: flex;
	flex-shrink: 0;
	margin-top: auto;
	gap: var(--tq-gap-related);
	align-items: flex-start;
}
.problem > :not(.message) {
	flex: none;
	width: auto;
}
.message {
	flex: 1;
	min-width: 0;
	color: var(--tq-color-error);
}
</style>
