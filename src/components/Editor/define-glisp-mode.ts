import ace from 'brace'

// Mode
;(ace as any).define('ace/mode/glisp', function(
	this: any,
	acequire: any,
	exports: any
) {
	const oop = acequire('../lib/oop')
	const TextMode = acequire('./text').Mode
	const GlispHighlightRules = acequire('./glisp_highlight_rules')
		.GlispHighlightRules
	const MatchingParensOutdent = acequire('./matching_parens_outdent')
		.MatchingParensOutdent

	const Mode = function(this: any) {
		this.HighlightRules = GlispHighlightRules
		this.$outdent = new MatchingParensOutdent()
		this.$behaviour = this.$defaultBehaviour
	}
	oop.inherits(Mode, TextMode)
	;(function(this: any) {
		this.lineCommentStart = ';'
		this.minorIndentFunctions = [
			'if',
			'case',
			'defn',
			'defmacro',
			'def',
			'defvar',
			'g',
			'transform',
			'style',
			'path/transform'
		]

		this.$toIndent = function(str: string) {
			return str
				.split('')
				.map(function(ch) {
					if (/\s/.exec(ch)) {
						return ch
					} else {
						return ' '
					}
				})
				.join('')
		}

		this.$calculateIndent = function(line: string, tab: any) {
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

		this.getNextLineIndent = function(state: any, line: any, tab: any) {
			return this.$calculateIndent(line, tab)
		}

		this.checkOutdent = function(state: any, line: any, input: any) {
			return this.$outdent.checkOutdent(line, input)
		}

		this.autoOutdent = function(state: any, doc: any, row: any) {
			this.$outdent.autoOutdent(doc, row)
		}

		this.$id = 'ace/mode/glisp'
		// this.snippetFileId = 'ace/snippets/glisp'
	}.call(Mode.prototype))

	exports.Mode = Mode
})

// Highlight Rule
;(ace as any).define('ace/mode/glisp_highlight_rules', function(
	this: any,
	acequire: any,
	exports: any
) {
	const oop = acequire('ace/lib/oop')
	const TextHighlightRules = acequire('ace/mode/text_highlight_rules')
		.TextHighlightRules

	const GlispHighlightRules = function(this: any) {
		const clojureBuiltinFunctions =
			'* *1 *2 *3 *agent* *allow-unresolved-vars* *assert* *clojure-version* ' +
			'*command-line-args* *compile-files* *compile-path* *e *err* *file* ' +
			'*flush-on-newline* *in* *macro-meta* *math-context* *ns* *out* ' +
			'*print-dup* *print-length* *print-level* *print-meta* *print-readably* ' +
			'*read-eval* *source-path* *use-context-classloader* ' +
			'*warn-on-reflection* + - -> ->> .. / < <= = ' +
			'== > &gt; >= &gt;= accessor aclone ' +
			'add-classpath add-watch agent agent-errors aget alength alias all-ns ' +
			'alter alter-meta! alter-var-root amap ancestors and apply areduce ' +
			'array-map aset aset-boolean aset-byte aset-char aset-double aset-float ' +
			'aset-int aset-long aset-short assert assoc assoc! assoc-in associative? ' +
			'atom await await-for await1 bases bean bigdec bigint binding bit-and ' +
			'bit-and-not bit-clear bit-flip bit-not bit-or bit-set bit-shift-left ' +
			'bit-shift-right bit-test bit-xor boolean boolean-array booleans ' +
			'bound-fn bound-fn* butlast byte byte-array bytes cast char char-array ' +
			'char-escape-string char-name-string char? chars chunk chunk-append ' +
			'chunk-buffer chunk-cons chunk-first chunk-next chunk-rest chunked-seq? ' +
			'class class? clear-agent-errors clojure-version coll? comment commute ' +
			'comp comparator compare compare-and-set! compile complement concat cond ' +
			'condp conj conj! cons constantly construct-proxy contains? count ' +
			'counted? create-ns create-struct cycle dec decimal? declare definline ' +
			'defmacro defmethod defmulti defn defn- defonce defstruct delay delay? ' +
			'deliver deref derive descendants destructure disj disj! dissoc dissoc! ' +
			'distinct distinct? doall doc dorun doseq dosync dotimes doto double ' +
			'double-array doubles drop drop-last drop-while empty empty? ensure ' +
			'enumeration-seq eval even? every? false? ffirst file-seq filter find ' +
			'find-doc find-ns find-var first float float-array float? floats flush ' +
			'fn fn? fnext for force format future future-call future-cancel ' +
			'future-cancelled? future-done? future? gen-class gen-interface gensym ' +
			'get get-in get-method get-proxy-class get-thread-bindings get-validator ' +
			'hash hash-map hash-set identical? identity if-let if-not ifn? import ' +
			'in-ns inc init-proxy instance? int int-array integer? interleave intern ' +
			'interpose into into-array ints io! isa? iterate iterator-seq juxt key ' +
			'keys keyword keyword? last lazy-cat lazy-seq let letfn line-seq list ' +
			'list* list? load load-file load-reader load-string loaded-libs locking ' +
			'long long-array longs loop macroexpand macroexpand-1 make-array ' +
			'make-hierarchy map map? mapcat max max-key memfn memoize merge ' +
			'merge-with meta method-sig methods min min-key mod name namespace neg? ' +
			'newline next nfirst nil? nnext not not-any? not-empty not-every? != ' +
			'ns ns-aliases ns-imports ns-interns ns-map ns-name ns-publics ' +
			'ns-refers ns-resolve ns-unalias ns-unmap nth nthnext num number? odd? ' +
			'or parents partial partition pcalls peek persistent! pmap pop pop! ' +
			'pop-thread-bindings pos? pr pr-str prefer-method prefers ' +
			'primitives-classnames print print-ctor print-doc print-dup print-method ' +
			'print-namespace-doc print-simple print-special-doc print-str printf ' +
			'println println-str prn prn-str promise proxy proxy-call-with-super ' +
			'proxy-mappings proxy-name proxy-super push-thread-bindings pvalues quot ' +
			'rand rand-int range ratio? rational? rationalize re-find re-groups ' +
			're-matcher re-matches re-pattern re-seq read read-line read-string ' +
			'reduce ref ref-history-count ref-max-history ref-min-history ref-set ' +
			'refer refer-clojure release-pending-sends rem remove remove-method ' +
			'remove-ns remove-watch repeat repeatedly replace replicate require ' +
			'reset! reset-meta! resolve rest resultset-seq reverse reversible? rseq ' +
			'rsubseq second select-keys send send-off seq seq? seque sequence ' +
			'sequential? set set-validator! set? short short-array shorts ' +
			'shutdown-agents slurp some sort sort-by sorted-map sorted-map-by ' +
			'sorted-set sorted-set-by sorted? special-form-anchor special-symbol? ' +
			'split-at split-with str stream? string? struct struct-map subs subseq ' +
			'subvec supers swap! symbol symbol? sync syntax-symbol-anchor take ' +
			'take-last take-nth take-while test the-ns to-array to-array-2d ' +
			'trampoline transient tree-seq true? type unchecked-add unchecked-dec ' +
			'unchecked-divide unchecked-inc unchecked-multiply unchecked-negate ' +
			'unchecked-remainder unchecked-subtract underive unquote ' +
			'unquote-splicing update-in update-proxy use val vals var-get var-set ' +
			'var? vary-meta vec vector vector? when when-first when-let when-not ' +
			'while with-bindings with-bindings* with-in-str with-loading-context ' +
			'with-local-vars with-meta with-open with-out-str with-precision xml-seq ' +
			'zero? zipmap'

		const builtinFunctions = clojureBuiltinFunctions + ' path'

		const specialForms =
			'throw try var def do fn macro if let loop quote recur style transform g defvar'

		const keywordMapper = this.createKeywordMapper(
			{
				function: specialForms,
				'support.function': builtinFunctions
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
					regex: ';.*$'
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
					regex: '[\\#\\^\\&]'
				},
				{
					token: 'keyword', // anonymous fn syntactic sugar
					regex: '[%][0-9]*'
				},
				{
					token: 'keyword', // deref reader macro
					regex: '[@]'
				},
				// {
				// 	token: 'constant.numeric', // hex
				// 	regex: '0[xX][0-9a-fA-F]+\\b'
				// },
				{
					token: 'constant.numeric', // float
					regex: '[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?\\b'
				},
				{
					token: 'constant.language',
					regex: 'true|false|nil'
				},
				{
					token: 'function',
					regex: '[\\+|\\-|\\*|\\/||=|!=|<=|>=|<|>]' // functions begin with symbols
				},
				{
					token: keywordMapper,
					regex: '[a-zA-Z_$\\/][a-zA-Z0-9_$\\-]*\\b'
				},
				{
					token: 'identifier', //parens
					regex: '[\\(]',
					next: 'fncall'
				},
				{
					token: 'identifier', //parens end
					regex: '[\\)]'
				},
				{
					token: 'keyword.operator',
					regex: '\\:[a-zA-Z_$][a-zA-Z0-9_$\\-]*\\b' // keyword
				},
				{
					token: 'string', // single line
					regex: '"',
					next: 'string'
				}
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
					regex: '[\\s]*[\\S]+',
					next: 'start'
				}
			],
			string: [
				{
					token: 'constant.language.escape',
					regex: '\\\\.|\\\\$'
				},
				{
					token: 'string',
					regex: '[^"\\\\]+'
				},
				{
					token: 'string',
					regex: '"',
					next: 'start'
				}
			]
		}
	}

	oop.inherits(GlispHighlightRules, TextHighlightRules)

	exports.GlispHighlightRules = GlispHighlightRules
})
