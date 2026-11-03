/**
 * Glisp as a language for Monaco.
 */

import * as monaco from 'monaco-editor'

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

	monaco.languages.setMonarchTokensProvider(GLISP, {
		tokenPostfix: '.glisp',
		keywords: ['=>', '?', '|>', '=', '&'],
		constants: ['true', 'false'],
		types: ['number', 'string', 'boolean', 'unit', 'vector', 'enum', 'IO', '_'],
		tokenizer: {
			root: [
				{ include: '@common' },
				[/\(/, 'delimiter.parenthesis', '@head'],
				[/[)[\]{}]/, 'delimiter'],
				[
					/[^\s()[\]{}";^~:`]+/,
					{
						cases: {
							'@keywords': 'keyword',
							'@constants': 'constant.language',
							'@types': 'type',
							'~-?\\d+(\\.\\d*)?([eE][-+]?\\d+)?': 'number',
							'~-?\\.\\d+([eE][-+]?\\d+)?': 'number',
							'@default': 'identifier',
						},
					},
				],
			],
			// What comes first in a call is what it calls.
			head: [
				[/\s+/, ''],
				{ include: '@common' },
				[
					/[^\s()[\]{}";^~:`]+/,
					{
						cases: {
							'@keywords': { token: 'keyword', next: '@pop' },
							'@default': { token: 'function', next: '@pop' },
						},
					},
				],
				[/(?=.)/, '', '@pop'],
			],
			common: [
				[/\s+/, ''],
				[/;.*$/, 'comment'],
				[/"/, 'string', '@string'],
				[/\.\.\.(?=\S)/, 'keyword'],
				[/[\^~`:]/, 'keyword'],
			],
			string: [
				[/[^\\"]+/, 'string'],
				[/\\./, 'string.escape'],
				[/"/, 'string', '@pop'],
			],
		},
	} as monaco.languages.IMonarchLanguage)
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
