<script setup lang="ts">
import { print } from '@glisp/lang'
import * as monaco from 'monaco-editor'
import { InputButton } from 'tweeq/InputButton'
import { InputCode } from 'tweeq/InputCode'
import { computed, ref, watch } from 'vue'

import { type GlispDocument } from './document'
import { EDITOR_OPTIONS, GLISP, registerGlisp } from './language'
import { readProgram, sourceOfProgram } from './programSource'

const props = defineProps<{ document: GlispDocument }>()

/** Whether what is written can be read, as what shows is the last that could. */
const emit = defineEmits<{ problem: [isThere: boolean] }>()

registerGlisp()

const OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
	...EDITOR_OPTIONS,
	automaticLayout: true,
	lineNumbers: 'off',
	folding: false,
	minimap: { enabled: false },
	scrollBeyondLastLine: false,
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

function onMount(instance: monaco.editor.IStandaloneCodeEditor): void {
	editor = instance
	showProblem()
}

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
