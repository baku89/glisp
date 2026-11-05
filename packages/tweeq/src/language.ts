/**
 * Glisp as a language for Monaco.
 */

import { format, formatRange } from '@glisp/lang'
import * as monaco from 'monaco-editor'

import { LINE_START, type LineState, tokenizeLine } from './highlight'

export const GLISP = 'glisp'

/** Monaco, without what is of no use for one short piece of Glisp. */
export const EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
	wordWrap: 'on',
	// Typing replaces what is selected, whatever is typed.
	autoSurround: 'never',
	glyphMargin: false,
	contextmenu: false,
	hover: { enabled: false },
	links: false,
	parameterHints: { enabled: false },
	quickSuggestions: false,
	suggestOnTriggerCharacters: false,
	wordBasedSuggestions: 'off',
	occurrencesHighlight: 'off',
	selectionHighlight: false,
	stickyScroll: { enabled: false },
}

class GlispState implements monaco.languages.IState {
	constructor(readonly line: LineState) {}
	clone(): GlispState {
		return this
	}
	equals(other: monaco.languages.IState): boolean {
		const line = (other as GlispState).line
		return (Object.keys(this.line) as (keyof LineState)[]).every(key => line[key] === this.line[key])
	}
}

/** As wide as a line can be and not wrap, where `model` is being shown, for what is laid out to stay so. */
function widthOf(model: monaco.editor.ITextModel): number | undefined {
	const shown = monaco.editor.getEditors().find(editor => editor.getModel() === model)
	const columns = shown?.getLayoutInfo().viewportColumn
	return columns === undefined || columns < 1 ? undefined : Math.min(columns, MOST_WIDTH)
}

/** `range` of what is in `model` laid out anew, or nothing if it cannot be read yet. */
function formatted(model: monaco.editor.ITextModel, range: monaco.IRange): monaco.languages.TextEdit[] {
	const source = model.getValue()
	const whole = model.getFullModelRange()
	const options = { width: widthOf(model) }
	try {
		if (monaco.Range.equalsRange(range, whole)) return [{ range: whole, text: format(source, options) }]
		const edit = formatRange(
			source,
			model.getOffsetAt(monaco.Range.getStartPosition(range)),
			model.getOffsetAt(monaco.Range.getEndPosition(range)),
			options
		)
		if (edit === null) return []
		const [from, to] = [model.getPositionAt(edit.from), model.getPositionAt(edit.to)]
		return [{ range: monaco.Range.fromPositions(from, to), text: edit.text }]
	} catch {
		return []
	}
}

/** How long a line gets, however much room there is. */
const MOST_WIDTH = 80

/** Lays out anew what is selected in `editor`, or all of it if nothing is. */
export function formatIn(editor: monaco.editor.ICodeEditor): void {
	const action = editor.getSelection()?.isEmpty() === false ? 'formatSelection' : 'formatDocument'
	void editor.getAction(`editor.action.${action}`)?.run()
}

let registered = false

/** Register the language, once. Monaco's registry is global. */
export function registerGlisp(): void {
	if (registered) return
	registered = true

	monaco.languages.register({ id: GLISP })

	monaco.languages.setLanguageConfiguration(GLISP, {
		comments: { lineComment: ';' },
		brackets: [
			['(', ')'],
			['[', ']'],
			['{', '}'],
		],
		autoClosingPairs: [
			{ open: '(', close: ')' },
			{ open: '[', close: ']' },
			{ open: '{', close: '}' },
			{ open: '"', close: '"' },
		],
	})

	monaco.languages.registerDocumentFormattingEditProvider(GLISP, {
		provideDocumentFormattingEdits: model => formatted(model, model.getFullModelRange()),
	})
	monaco.languages.registerDocumentRangeFormattingEditProvider(GLISP, {
		provideDocumentRangeFormattingEdits: (model, range) => formatted(model, range),
	})
	// By the key that is there, as what an input method is in the middle of says nothing of it.
	monaco.editor.onDidCreateEditor(editor => {
		editor.getContainerDomNode().addEventListener(
			'keydown',
			event => {
				const isFormat = event.code === 'KeyF' && event.shiftKey && !event.altKey && (event.metaKey || event.ctrlKey)
				if (!isFormat || editor.getModel()?.getLanguageId() !== GLISP) return
				event.preventDefault()
				event.stopPropagation()
				formatIn(editor)
			},
			{ capture: true }
		)
	})

	monaco.languages.setTokensProvider(GLISP, {
		getInitialState: () => new GlispState(LINE_START),
		tokenize(line, state) {
			const read = tokenizeLine(line, (state as GlispState).line)
			return {
				tokens: read.tokens.map(({ start, scope }) => ({ startIndex: start, scopes: scope })),
				endState: new GlispState(read.state),
			}
		},
	})
}

export const PATH_DATA = 'path-data'

let pathDataRegistered = false

/** Register the data of a path, as SVG has it, once. What it cannot be read as shows. */
export function registerPathData(): void {
	if (pathDataRegistered) return
	pathDataRegistered = true

	monaco.languages.register({ id: PATH_DATA })
	monaco.languages.setMonarchTokensProvider(PATH_DATA, {
		tokenPostfix: '.path',
		tokenizer: {
			root: [
				[/[MmLlHhVvCcSsQqTtAaZz]/, 'keyword'],
				[/[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/, 'number'],
				[/[\s,]+/, 'delimiter'],
				[/./, 'invalid'],
			],
		},
	} as monaco.languages.IMonarchLanguage)
}

/** What is open for one expression to be written, which is what anything asked for now is about. */
let oneExpression: monaco.editor.IStandaloneCodeEditor | null = null

/** Lays out what is open for one expression to be written, returning whether anything is. */
export function formatOneExpression(): boolean {
	if (oneExpression === null) return false
	if (oneExpression.getModel()?.getLanguageId() === GLISP) {
		oneExpression.focus()
		formatIn(oneExpression)
	}
	return true
}

/**
 * Make an editor edit one expression, going on from its end: Cmd+Enter confirms, Esc
 * cancels, and Enter goes on to the next line.
 */
export function editOneExpression(
	editor: monaco.editor.IStandaloneCodeEditor,
	handlers: {
		cancel(): void
		confirm(): void
	}
): void {
	const range = editor.getModel()?.getFullModelRange()
	if (range !== undefined) editor.setPosition(range.getEndPosition())
	editor.focus()
	oneExpression = editor
	editor.onDidDispose(() => {
		if (oneExpression === editor) oneExpression = null
	})
	editor.onKeyDown(event => {
		const cancelling = event.keyCode === monaco.KeyCode.Escape
		const confirming =
			event.keyCode === monaco.KeyCode.Enter && (event.metaKey || event.ctrlKey)
		if (!cancelling && !confirming) return
		event.preventDefault()
		event.stopPropagation()
		if (cancelling) handlers.cancel()
		else handlers.confirm()
	})
}

/** A line of code, in stretches of one kind of token. */
export interface CodeRun {
	readonly type: string
	readonly text: string
}

/** Tokenize `source` by the same rules as the editor, into runs by line. */
export function runsOf(source: string): CodeRun[][] {
	registerGlisp()
	const lines = source.split('\n')
	return monaco.editor.tokenize(source, GLISP).map((tokens, i) => {
		const line = lines[i] ?? ''
		return tokens.map((token, j) => ({
			type: token.type,
			text: line.slice(token.offset, tokens[j + 1]?.offset ?? line.length),
		}))
	})
}
