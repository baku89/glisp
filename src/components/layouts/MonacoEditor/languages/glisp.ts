import * as Monaco from 'monaco-editor'

console.log(Monaco.languages.getLanguages())
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
