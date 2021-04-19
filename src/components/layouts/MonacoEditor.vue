<template>
	<div class="MonacoEditor" ref="rootEl" />
</template>

<script lang="ts">
import {templateRef} from '@vueuse/core'
import * as Monaco from 'monaco-editor'
import {
	defineComponent,
	inject,
	onMounted,
	onUnmounted,
	Ref,
	ref,
	watch,
} from 'vue'

// Define Glisp language syntax
Monaco.languages.register({id: 'glisp'})
Monaco.languages.setLanguageConfiguration('glisp', {
	comments: {
		lineComment: ';',
	},

	brackets: [
		['[', ']'],
		['(', ')'],
		['{', '}'],
	],

	autoClosingPairs: [
		{open: '[', close: ']'},
		{open: '"', close: '"'},
		{open: '(', close: ')'},
		{open: '{', close: '}'},
	],

	surroundingPairs: [
		{open: '[', close: ']'},
		{open: '"', close: '"'},
		{open: '(', close: ')'},
		{open: '{', close: '}'},
	],
})

Monaco.languages.setMonarchTokensProvider('glisp', {
	defaultToken: '',
	ignoreCase: false,
	brackets: [
		{open: '[', close: ']', token: 'delimiter.square'},
		{open: '(', close: ')', token: 'delimiter.paren'},
		{open: '{', close: '}', token: 'delimiter.curly'},
	],

	constants: ['true', 'false', 'null'],

	// Numbers
	integer: /^[+-]?[0-9]+/,
	float: /^(?:@integer)?\.[0-9]+/,
	exponential: /^(@integer|@float)e[0-9]+/,
	percentage: /^(?:@integer|@float)%/,
	hex: /^0[xX][0-9a-fA-F]+/,
	numericConstants: ['inf', '-inf', 'nan'],

	qualifiedSymbols: /^[a-zA-Z_+\-*=?|&<>@][0-9a-zA-Z_+\-*=?|&<>@]*/,

	tokenizer: {
		root: [
			// whitespaces and comments
			{include: '@whitespace'},

			// numbers
			[/@hex/, 'number.hex'],
			[/@exponential/, 'number.exponential'],
			[/@percentage/, 'number.percentage'],
			[/@float/, 'number.float'],
			[/@integer/, 'number.integer'],

			// brackets
			[/[()[\]]/, '@brackets'],

			[/\//, 'delimiter.slash'],
			[/\.\./, 'delimiter.slash'],
			[/:/, 'delimiter.slash'],

			// quoted symbol
			[/`/, {token: 'identifier', bracket: '@open', next: '@quotedSymbol'}],

			// string
			[/"/, {token: 'string', bracket: '@open', next: '@string'}],

			// symbols
			[
				/@qualifiedSymbols/,
				{
					cases: {
						'@constants': 'constant',
						'@numericConstants': 'number',
						'@default': 'identifier',
					},
				},
			],
		],

		whitespace: [
			[/[\s,]+/, 'white'],
			[/;.*$/, 'comment'],
		],

		comment: [
			[/\(/, 'comment', '@push'],
			[/\)/, 'comment', '@pop'],
			[/[^()]/, 'comment'],
		],

		quotedSymbol: [
			[/[^\\`]+/, 'identifier'],
			[/"/, {token: 'identifier', bracket: '@close', next: '@pop'}],
		],

		string: [
			[/[^\\"]+/, 'string'],
			[/"/, {token: 'string.quote', bracket: '@close', next: '@pop'}],
		],
	},
})

export default defineComponent({
	name: 'MonacoEditor',
	props: {
		modelValue: {
			type: String,
			required: true,
		},
	},
	emits: ['update:modelValue'],
	setup(props, context) {
		const rootEl = templateRef('rootEl')

		let editor: ReturnType<typeof Monaco.editor.create>

		const scheme = inject<Ref<{[name: string]: string}>>('scheme', ref({}))

		onMounted(() => {
			if (!rootEl.value) return

			editor = Monaco.editor.create(rootEl.value as HTMLElement, {
				value: props.modelValue,
				language: 'glisp',
				fontFamily: "'Fira Code'",
				minimap: {enabled: false},
				lineNumbers: 'off',
				lineHeight: 21,
				fontLigatures: true,
				fontSize: 14,
				renderLineHighlight: 'none',
			})

			watch(
				() => scheme,
				() => {
					if (!editor) return

					const {
						base00,
						base01,
						base02,
						base03,
						base04,
						base05,
						base06,
						base07,
						base08,
						base09,
						base0A,
						base0B,
						base0C,
						base0D,
						base0E,
						accent,
					} = scheme.value

					Monaco.editor.defineTheme('custom-theme', {
						base: 'vs-dark',
						inherit: false,
						rules: [
							{token: '', foreground: base04},
							{token: 'string', foreground: base0B},
							{token: 'string.escape', foreground: base0C},
							{token: 'comment', foreground: base03},
							{token: 'white', foreground: base03},
							{token: 'number', foreground: base09},
							{token: 'delimiter.slash', foreground: base0A},
							{token: 'delimiter', foreground: base05},
							{token: 'constant', foreground: base09},
							{token: 'identifier', foreground: base08},
							{token: 'keyword', foreground: base0E},
						],
						colors: {
							'editor.background': base00,
							'editor.selectionBackground': base01,
							'editorBracketMatch.background': base02,
							'editorBracketMatch.border': base03,
							'editorCursor.foreground': base06,
							'editorIndentGuide.background': base01,
							'editorIndentGuide.activeBackground': base03,
						},
					})

					Monaco.editor.setTheme('custom-theme')
				},
				{immediate: true, deep: true}
			)

			editor.onDidChangeModelContent(e => {
				const value = editor.getValue()
				if (props.modelValue !== value) {
					context.emit('update:modelValue', value, e)
				}
			})
		})

		onUnmounted(() => {
			editor && editor.dispose()
		})
	},
})
</script>

<style lang="stylus">
.MonacoEditor
	width 100%
	height 20em
</style>
