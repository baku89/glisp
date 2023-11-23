import ace from 'brace'

// Mode
;(ace as any).define(
	'ace/mode/glisp',
	function (this: any, acequire: any, exports: any) {
		const oop = acequire('../lib/oop')
		const TextMode = acequire('./text').Mode
		const GlispHighlightRules = acequire(
			'./glisp_highlight_rules'
		).GlispHighlightRules
		const MatchingParensOutdent = acequire(
			'./matching_parens_outdent'
		).MatchingParensOutdent

		const Mode = function (this: any) {
			this.HighlightRules = GlispHighlightRules
			this.$outdent = new MatchingParensOutdent()
			this.$behaviour = this.$defaultBehaviour
		}
		oop.inherits(Mode, TextMode)
		;(function (this: any) {
			this.lineCommentStart = ';'
			this.minorIndentFunctions = [
				'if',
				'case',
				'def=>',
				'defmacro',
				'def',
				'defvar',
				'g',
				'transform',
				'style',
				'path/transform',
				'clip',
			]

			this.$toIndent = function (str: string) {
				return str
					.split('')
					.map(function (ch) {
						if (/\s/.exec(ch)) {
							return ch
						} else {
							return ' '
						}
					})
					.join('')
			}

			this.$calculateIndent = function (line: string, tab: any) {
				let baseIndent = this.$getIndent(line) as string
				let delta = 0
				let isParen, ch, i
				// Walk back from end of line, find matching braces
				for (i = line.length - 1; i >= 0; i--) {
					ch = line[i]
					if (ch === '(') {
						delta--
						isParen = true
					} else if (ch === '(' || ch === '[' || ch === '{') {
						delta--
						isParen = false
					} else if (ch === ')' || ch === ']' || ch === '}') {
						delta++
					}
					if (delta < 0) {
						break
					}
				}
				if (delta < 0 && isParen) {
					// Were more brackets opened than closed and was a ( left open?
					i += 1
					const iBefore = i
					let fn = ''
					// eslint-disable-next-line no-constant-condition
					while (true) {
						ch = line[i]
						if (ch === ' ' || ch === '\t') {
							if (this.minorIndentFunctions.indexOf(fn) !== -1) {
								return this.$toIndent(line.substring(0, iBefore - 1) + tab)
							} else {
								return this.$toIndent(line.substring(0, i + 1))
							}
						} else if (ch === undefined) {
							return this.$toIndent(line.substring(0, iBefore - 1) + tab)
						}
						fn += line[i]
						i++
					}
				} else if (delta < 0 && !isParen) {
					// Were more brackets openend than closed and was it not a (?
					return this.$toIndent(line.substring(0, i + 1))
				} else if (delta > 0) {
					// Mere more brackets closed than opened? Outdent.
					baseIndent = baseIndent.substring(0, baseIndent.length - tab.length)
					return baseIndent
				} else {
					// Were they nicely matched? Just indent like line before.
					return baseIndent
				}
			}

			this.getNextLineIndent = function (_state: any, line: any, tab: any) {
				return this.$calculateIndent(line, tab)
			}

			this.checkOutdent = function (_state: any, line: any, input: any) {
				return this.$outdent.checkOutdent(line, input)
			}

			this.autoOutdent = function (_state: any, doc: any, row: any) {
				this.$outdent.autoOutdent(doc, row)
			}

			this.$id = 'ace/mode/glisp'
			// this.snippetFileId = 'ace/snippets/glisp'
		}).call(Mode.prototype)

		exports.Mode = Mode
	}
)

// Highlight Rule
;(ace as any).define(
	'ace/mode/glisp_highlight_rules',
	function (this: any, acequire: any, exports: any) {
		const oop = acequire('ace/lib/oop')
		const TextHighlightRules = acequire(
			'ace/mode/text_highlight_rules'
		).TextHighlightRules

		const GlispHighlightRules = function (this: any) {
			const clojureBuiltinFunctions = ''

			const builtinFunctions = clojureBuiltinFunctions

			const specialForms =
				'throw try catch eval eval* var def do fn macro if let quote style transform g def=> defmacro defvar'

			const keywordMapper = this.createKeywordMapper(
				{
					function: specialForms,
					'support.function': builtinFunctions,
				},
				'identifier',
				false,
				' '
			)

			// regexp must not have capturing parentheses. Use (?:) instead.
			// regexps are ordered -> the first match is used

			this.$rules = this.$rules = {
				start: [
					{
						token: 'comment',
						regex: ';.*$',
					},
					// {
					// 	token: 'keyword', //lists
					// 	regex: "[\\'\\(]"
					// },
					// {
					// 	token: 'keyword', //vectors
					// 	regex: '[\\[|\\]]'
					// },
					// {
					// 	token: 'keyword', //sets and maps
					// 	regex: '[\\{|\\}|\\#\\{|\\#\\}]'
					// },
					{
						token: 'keyword', // ampersands, metadata
						regex: '[\\#\\^\\&]',
					},
					{
						token: 'keyword', // anonymous fn syntactic sugar
						regex: '[%][0-9]*',
					},
					{
						token: 'keyword', // deref reader macro
						regex: '[@]',
					},
					// {
					// 	token: 'constant.numeric', // hex
					// 	regex: '0[xX][0-9a-fA-F]+\\b'
					// },
					{
						token: 'constant.numeric', // float
						regex: '[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b',
					},
					{
						token: 'constant.language',
						regex: 'true|false|null',
					},
					{
						token: 'function',
						regex: '[\\+|\\-|\\*|\\/||=|!=|<=|>=|<|>]', // functions begin with symbols
					},
					{
						token: keywordMapper,
						regex: '[a-zA-Z_$\\/][a-zA-Z0-9_$\\-]*\\b',
					},
					{
						token: 'identifier', //parens
						regex: '[\\(]',
						next: 'fncall',
					},
					{
						token: 'identifier', //parens end
						regex: '[\\)]',
					},
					{
						token: 'keyword.operator',
						regex: '\\:[a-zA-Z_$][a-zA-Z0-9_$\\-]*\\b', // keyword
					},
					{
						token: 'string', // single line
						regex: '"',
						next: 'string',
					},
					// {
					// 	token: 'constant', // symbol
					// 	regex: /:[^()\[\]{}'"\^%`,;\s]+/ // eslint-disable-line no-useless-escape
					// }
					// {
					// 	token: 'string.regexp', //Regular Expressions
					// 	regex: '/#"(?:\\.|(?:\\")|[^""\n])*"/g'
					// }
				],
				fncall: [
					{
						token: 'function',
						regex: '[\\s]*[^\\s\\(\\[\\{\\)]+',
						next: 'start',
					},
				],
				string: [
					{
						token: 'constant.language.escape',
						regex: '\\\\.|\\\\$',
					},
					{
						token: 'string',
						regex: '[^"\\\\]+',
					},
					{
						token: 'string',
						regex: '"',
						next: 'start',
					},
				],
			}
		}

		oop.inherits(GlispHighlightRules, TextHighlightRules)

		exports.GlispHighlightRules = GlispHighlightRules
	}
)
