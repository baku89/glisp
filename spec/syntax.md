# Glisp Syntax

## Design principles

- S-expression based.
- No English keywords. Reserved tokens are symbolic (`=>`, `_`, `!`, `^`, etc.).
- Whitespace is the only separator. No commas. Newlines are whitespace.

## Tokens

### Literals


| Form                        | Type      |
| --------------------------- | --------- |
| `42`, `3.14`, `-7`, `1e-5`  | `number`  |
| `"hello"`, `"with\nescape"` | `string`  |
| `true`, `false`             | `boolean` |
| `()`                        | `unit`    |
| `_`                         | the top type: any value |
| `!`                         | the bottom type: no value |


`number` is a single unified numeric type, IEEE 754 double internally.

A value written as it is where a type is wanted, as `42`, is the type of just that value. A union of them, `(| "a" "b")`, is a set of values. See [types.md](./types.md#type-constructors).

Keyword literal (`:foo`) is not introduced. Record keys and keyword arguments are written with bare symbols followed by `:`.

#### String escape sequences

| Escape    | Meaning            |
| --------- | ------------------ |
| `\n`      | newline            |
| `\r`      | carriage return    |
| `\t`      | tab                |
| `\"`      | double quote       |
| `\\`      | backslash          |
| `\uXXXX`  | unicode codepoint  |

Any other backslash sequence is a syntax error.

### Identifiers (symbols)

Bare identifiers are symbols, resolved in the lexical environment.

```glisp
foo bar baz!  +  *  multiply-by-2  >=  is-empty  π  ℝ  ∞  °  半径
```

Allowed characters: alphanumerics and `+ - * < > & | % _ ! $`, and beyond ASCII, any letter, mark, number, or symbol (Unicode categories `L`, `M`, `N`, `S`, `Pc`, plus the zero-width joiner for emoji). The first character must not be a digit or a combining mark. Other non-ASCII punctuation, such as `「` and `（`, is a syntax error.

Identifiers are normalized to NFC, so the same name typed two ways is the same name. Non-ASCII spaces, such as the ideographic space, are whitespace.

`\` puts the character after it in a name, whatever it is, so a name can hold spaces and marks, and start with what would otherwise begin a number or a literal. It has no other meaning there: `\n` is `n`. A control character, such as a new line, cannot be put in, and neither can what stands for something else alone, as `\_`, `\!` and `\%` would.

<!-- test -->
```glisp
{layer\ 1 = 10
 \1st = 2
 \true = 3
 r = {font\ size: 12}
 (+ layer\ 1 \1st \true r.font\ size ../layer\ 1)}  ;; → 37
```

A name is written this way wherever it is: bound, referred to, as a key, a keyword, a parameter, a generic, after `.`, and in a path. A path cannot go to a name that is spelled as a segment of one, `..` or one ending with `:`, and so such a name cannot be bound. A host writes a name it is given with what it needs, as `Circle\ 1`, and shows it without.

Several bare tokens are reserved and cannot stand alone as identifiers; embedded use within an identifier is still fine:

| Bare token | Reserved meaning                            | Embedded example (still valid) |
| ---------- | ------------------------------------------- | ------------------------------ |
| `_`        | top type literal                            | `_x`, `foo_bar`                |
| `!`        | bottom type literal                       | `is-empty!`                    |
| `%`        | partial-application placeholder             | `URL%encoded`                  |
| `\|>`      | pipe special form                           | (none, distinct from `\|`)     |
| `?`        | match special form (head); optional suffix  | (none, `?` already reserved)   |
| `/`        | division function; also path separator      | (none, `/` not an identifier char) |

Reserved (not allowed in identifiers, but with `\` before them): `? : = . / ^ ~ ' \` , ; ( ) [ ] { } # @` and whitespace. `\` itself starts an escape, so `\\` puts it in a name.

`/` is listed in the table for completeness even though it cannot appear inside an identifier; it is also a single-character bare token with reserved bare-form meaning.

### Comments

One-line only: `; ...`. Comments run to the end of the line.

## Whitespace

Whitespace separates tokens. Newlines are whitespace; commas are not used.

Adjacent elements at the same nesting level must be separated by at least one whitespace character. A closing bracket (`)`, `]`, `}`) cannot directly abut another token. The following are syntax errors:

```glisp
[[1][2]]      ;; ❌ — write [[1] [2]]
(foo)(bar)    ;; ❌ — write (foo) (bar)
(+ 1 2)3      ;; ❌ — write (+ 1 2) 3
(f x)(g)      ;; ❌ — write (f x) (g)
"a""b"        ;; ❌ — write "a" "b"
```

This is stricter than traditional Lisp (where closing brackets implicitly terminate tokens). The benefit is regular tokenization and trivial whole-tree text rewrites: a primitive-level find/replace never has to worry about token boundaries hidden inside `]a` or `)(`.

Opening brackets in succession (`((`, `[[`, `[(`, `({`, ...) are not element boundaries and need no separator.

## Structure

### `(...)` — function application / value invocation

<!-- test -->
```glisp
(+ 1 2 3)            ;; → 6
((if c f g) x)       ;; head can be any expression
([1 2 3] 0)          ;; vector invocation → 1 (index)
({x: 10 y: 20} "x")  ;; record invocation → field access by string key
```

All values are callable; the calling behavior is determined by the value's type:


| Value type                  | `(value args...)`                |
| --------------------------- | -------------------------------- |
| Function                    | apply                            |
| Type                        | a value of it, made of the arguments; see [types.md — Constructors](./types.md#constructors) |
| vector                      | element access by integer index  |
| Record                      | field access by string key       |
| Other (number, string, ...) | type mismatch → default fallback |


Empty `()` is the unit value.

### `[...]` — vector

<!-- test -->
```glisp
[1 2 3]
[(+ 1 2) (+ 3 4)]    ;; → [3 7]
[]
```

A vector is a value of type `[...T]` for some element type `T`.

An element can have a name, as any expression can (see [Names](#names--)), which the rest of the vector can refer to in any order. The value is an ordinary vector, with no names in it.

### Accessor — `.`

Member access on records, vectors and types. The right of `.` is a literal name (for records, becomes a string key) or an integer (for vectors, becomes an index); the left is any expression that evaluates to one of them. A type's members are [what goes with it](./types.md#members), as `vec2.add`.

```glisp
point.x          ;; → (point "x")
arr.2            ;; → (arr 2)
a.b.c            ;; → ((a "b") "c"), left-associative
(make-point).x   ;; left side may be an arbitrary expression
```

Accessor `.` is syntactic sugar that has the same evaluation semantics as the call form `(rec key)` / `(arr i)`. Dynamic keys (variables, expressions) must be written in call form. The CST keeps a distinct `'access'` AST kind for the dot notation so `unparse` can reproduce the source as written.

### Path — `./`, `../` and `/`

A path atom references an AST position by walking the container structure (the AST tree): relative to the current expression, or, beginning with `/`, from the root of the program.

A path is a sequence of segments separated by `/`. Each segment is one of:

- `.` — stay at the current node (no-op; required as the first segment when the path otherwise starts with a name).
- `..` — go up to the immediate parent AST node.
- a name — descend into the child that has this [name](#names--): a let-binding, or anything else written `name = expr`.
- a key followed by `:` — descend into what fills a slot: a record's field, or a call's argument by its parameter's name, whether it was passed by keyword or by position (`./x/xs:` in `x = (first [1 2])`). The parameter is looked up in the head's signature, without running anything. A variadic parameter's name refers to the remaining arguments, as a vector (`./c/xs:/1` in `c = (+ 1 2 3)` is `2`).
- an integer — descend into a vector element. A call's arguments are reached by their parameters' names, not by position.

A name and a key are written differently, so they never stand for each other: in `(circle center: radius = [0 0] radius: 10)`, `./radius` is `[0 0]` and `./radius:` is `10`. A key is the callee's or the record's to choose, and a name is the writer's, so neither can take the other's place when one of them changes.

`..` may be repeated arbitrarily by chaining with `/` to walk further up: `../..` is two levels up, `../../..` is three, and so on. There is no special "deeper" syntax — chained `..` segments are how depth is expressed.

Distinguishing path from spread/splice: a path always begins with `./`, `../` or `/` and contains at least one `/`. A token of the shape `...name` (no slash) is a spread/splice, not a path.

<!-- test -->
```glisp
{width: 100
 height: ./width:               ;; parent = record, its field 'width' = 100
 area: (* ../width: ../height:)};; grandparent (call's parent) = record, its fields width and height

[10 ./0]                        ;; parent = vector, element 0 = 10 → vector evaluates to [10 10]

[./1 "str with index 1"]        ;; ./1 = vector's element 1 → ["str with index 1" "str with index 1"]

(+ x ./xs:/0)                   ;; in a call, ./xs:/0 = the first of the variadic arguments = x
                                ;; → equivalent to (+ x x)
```

Paths walk every AST level, including records, vectors, and function applications, but not every expression has a path. Metadata and names are not levels: a path passes through them, so `{z = ^{label: "L"} {a: 7} q = ./z/a:}` reaches `7`.

- A let-block's trailing expression has none unless it has a name (`{a = 10 r = (* a 2)}`, then `./r`).
- A call's head has none, and neither does a function's parameters, generics, or body. A path cannot descend into a function literal.
- A path cannot appear in a function signature, as a parameter's type or the return type. This is a syntax error. Bare-name lookup of an unqualified `x`, by contrast, looks only at [names](#names--) and a function's parameters, and passes over keys and indices.

A path beginning with `/` starts from the root, the outermost node of the program, wherever it is written. It comes to the same as climbing there with `..`, and counts no levels, so what is around it can change without it saying anything else. `/` right before a name or an index begins such a path; otherwise, it is division, so write `(/ a b)` with a space.

<!-- test -->
```glisp
a = {b = [10 20]}
c = {d = [[/a/b/1]]}
/c/d/0/0                        ;; → 20
```

The prelude and what else a host binds is not a part of the program: a path from the root cannot reach them, and has no root to start from if nothing written surrounds it. In a session, the root is the session's let-block.

### Optional fields and arguments — `?`

A trailing `?` on a record field name or function parameter name marks it as optional. `y?: T` is `y: (| T unit)`: what can be left out is what can be `()`.

```glisp
{x: number  y?: string}                              ;; record type with optional y
(=> [x: number y?: string]: number ...)              ;; optional argument y
```

Semantics (in conjunction with the `()` missing-value signal — see [types.md](./types.md)):

- A missing or `()` value at a **required** slot triggers the type's `default` and emits a diagnostic.
- A missing value at an **optional** slot takes the type's `default` silently, which for `(| T unit)` is `T`'s. A `()` given to it stays `()`.

### `{...}` — record or let-block

The block contents determine the kind:

- All entries `key: expr` → **record**. What fills a field may have a [name](#names--) of its own, as in `{x: c = 10}`.
- Otherwise every entry is `name = expr`, except that the last may go without a name → **let-block**. It comes to its last entry, named or not.
- Mixing `:` and `=` entries is a syntax error.

```glisp
{x: 10 y: 20}                  ;; record
{a = 10 b = 20 (+ a b)}        ;; let-block → 30
{a = 10 b = 20}                ;; let-block → 20, its last entry
{a = 10 r = (+ a 1)}           ;; let-block → 11, and ./r reaches what it comes to
{}                             ;; empty record
{()}                           ;; empty let-block → unit
{x: 10  a = 20}                ;; ❌ syntax error
{a = 10 (foo) (+ a 1)}         ;; ❌ syntax error: only the last entry may go without a name
```

#### Order

A let-block is a graph of what refers to what, and the order of its bindings means nothing but which is last: a binding can refer to one written after it, and writing the others in another order changes no value. The order is kept as written, for a host to show them in, as an editor shows lines; what has an order in its value is a vector.

<!-- test -->
```glisp
{a = b  b = 1  a}              ;; → 1
{b = 1  a = b  a}              ;; → 1
```

#### Duplicate names

A record may not list the same field name twice. No two expressions directly in the same node may have the same [name](#names--), which for a let-block is binding the same name twice. The duplicate is a diagnostic, but evaluation does not throw — it is **recoverable**: the **last entry wins** and overrides earlier ones, for a bare name and for a path alike.

<!-- test -->
```glisp
{x: 10 x: 20}                  ;; → {x: 20}  (with a warning)
{a = 10 a = 20 a}              ;; → 20  (with a warning)
{v = [a = 1 a = 2] ./v/a}      ;; → 2  (with a warning)
```

Names need only differ among what is directly in one node, so the same name can be given again in another, as `r` is in every function that has one.

The last-wins rule keeps the language consistent with hosts whose serialization layers (JS object literals, JSON parsers, many config formats) drop earlier duplicates silently.

### Names — `=`

`name = expr` gives an expression a name, wherever it stands: as a binding of a let-block, an element of a vector, an argument of a call, or what fills a record's field. The name changes no value, and adds no level for paths. A host shows it, as the name of a layer.

A bare name is looked up by going up from where it is written, one node at a time, and at each among the names of what is directly in it. The nearest wins. Every node is looked in the same way, so there is one kind of name, and a let-block is only a node every entry of which has a name, but the last. A path reaches what has a name too (see [Path](#path-----and-)).

<!-- test -->
```glisp
[a = 1 b = 2]                  ;; → [1 2]
[a = 1 (+ a 1)]                ;; → [1 2]
(+ a = 1 a)                    ;; → 2
{x: c = 10 y: (* c 2)}         ;; → {x: 10 y: 20}
{c = 1 [c = 10 c]}             ;; → [10 10]  the nearer c
{x = 10 y = (+ x = 2 (* x 3))}        ;; → 8  x is the 2, named in the call nearer to it
{x = 10 y = (+ x = 2 (* ../../x 3))}  ;; → 32  ./ is (* ...), ../ is (+ ...), ../../ the block
[c = 10 (+ ../c 1)]            ;; → [10 11]  a path reaches it too: ./ is the call, ../ the vector
```

A key is not a name. A parameter's name is the callee's, and it is not in scope at the call: in `(circle center: [0 0] radius: center)`, `center` is not the argument, but whatever `center` is around the call.

- One expression has one name. `a = b = 1` is a syntax error.
- Metadata, `@` and `#_` go on what is named, after `=`: `a = ^{label: "A"} @10`.
- A call's head, a spread, and what makes up a function literal (its parameters, generics, return type and body) take no name, as a path cannot reach them.

A let-block's bindings are where things are defined (see [Hiding](#hiding--_)). What has a name anywhere else is used where it stands: a vector's named element is drawn like any other.

## Functions

### Function literal

```glisp
(=> [x: number y: number]: number (* x y))
(=> {T} [x: T]: T x)                                ;; generic
(=> {T U} [a: T b: U]: T a)                         ;; multiple generics
(=> [a: number b: number]: number)                  ;; function type (no body)
(=> [x: number] (* x x))                            ;; return type left out, inferred
(=> [number number]: number)                        ;; function type, parameter names omitted
```

Parameter types are mandatory. The return type may be left out, as in `(=> [x: number] (* x x))`: it is then what the body comes to, for static analysis, and `_` where it is evaluated. Inside the body, types are inferred. See [types.md — Type inference](./types.md#type-inference).

The parameters are in brackets, `[name: Type ...]`, and the names of the types a function is generic over, if any, in braces before them, `{T U}`. The brackets read as a tuple type with names: without the names, `[a: number ...rest: string]` is `[number ...string]`, the type of what the function is given. The braces name what is bound for the function's types and body, as a let-block does. What a generic is bound by, as in `{T: Show}`, is not supported yet.

A function with a body must name every value parameter. A function type (no body) may omit names, as in `(=> [number number]: number)`. Parameter names are part of each function value's keyword-argument interface (see [Application — keyword arguments](#application--keyword-arguments)) and matter at call sites, but they are **not** part of the function's *type* identity. `(=> [a: number b: number]: number)` and `(=> [x: number y: number]: number)` are the same type. See [types.md — Function-type equality](./types.md#function-type-equality).

A function takes **at least one value parameter**. A zero-parameter function `(=> []: T body)` is a syntax error: in a purely functional language the body's value is fully determined by its lexical context, so "calling" the function is indistinguishable from referencing the body directly — `body` and `((=> []: T body))` are the same expression. Use the body in place. A host has no impure operation to expose as a function: what changes from one moment to the next, such as the time, reaches a program as an `IO` that a host runs, or as a value it writes in.

### Variadic parameters

A parameter prefixed with `...` is variadic: it collects the remaining positional arguments into a vector. The type after `:` is the **element type** — the outer vector wrapping is implicit, because variadic always means "many of this":

```glisp
(=> [...xs: number]: number ...)              ;; xs : [...number]
(=> [init: number ...rest: number]: number ...)
```

- A variadic parameter must appear last in the value parameter list.
- Each collected argument is checked against the element type.
- At most one variadic parameter per function.

The element type is *just a type* — there is no special restriction on what it may be. If the element type happens to be itself a vector type, the variadic parameter ends up as a vector of vectors:

```glisp
(=> [...rows: [...number]]: number ...)
;; rows : [...[...number]]    — a vector of number vectors (2-D)
```

That is valid, just usually not the intent. The shorthand `...rest: T` is canonical for the common case "many T's"; nesting falls out from the rule.

See [Spread](#spread--) for how to call variadic functions and for spread in vectors and records.

### Application — keyword arguments

Any positional parameter of a function can be passed by name at the call site using `name: value`, as a record's field is written. No special declaration is required at the definition: every parameter is automatically callable both positionally and by keyword.

```glisp
(=> [x: number y: number z: number]: number (* x y z))

(f 2 3 4)              ;; all positional → 24
(f x: 2 y: 3 z: 4)     ;; all keyword → 24
(f 2 z: 4 y: 3)        ;; positional first, then keyword in any order → 24
(f y: 3 x: 2 z: 4)     ;; keyword only, in any order → 24
```

Rules:

- Once a keyword argument appears in a call, no further positional argument may follow.
- What is passed, by keyword or by position, may have a [name](#names--): `(circle radius: r = 10)`. `(f a = 1)` passes `1` by position, named `a`; `(f a: 1)` passes it to the parameter `a`.
- Each parameter must receive at most one binding (positional or keyword, not both). Double-binding emits a diagnostic.
- A keyword whose name is not a parameter of the callee emits a diagnostic.
- A required parameter (no `?` suffix) that receives no binding emits a diagnostic; the slot is filled with the parameter type's `default`.
- An optional parameter (`?` suffix, or of a type that `()` fits) that receives no binding silently uses the parameter type's `default`.
- A variadic parameter `...rest` collects the remaining positional arguments into a vector. It can also be filled by keyword as a single vector value (`rest: [1 2 3]`). Mixing the two — positional rest-elements *and* a same-named kwarg — is a double-binding error.

A variadic parameter is always the last one in the parameter list (see [Variadic parameters](#variadic-parameters)). Optional parameters must therefore precede the variadic, never follow it — this avoids the parse ambiguity TS's "no optional after rest" rule guards against.

```glisp
;; (=> [init: number name?: string ...rest: number]: number ...)

(f 1)                                 ;; init: 1, name unspecified, rest: []
(f 1 "foo" 2 3)                       ;; init: 1, name: "foo", rest: [2 3]
(f 1 2 3)                             ;; ❌ second positional must satisfy `string` for `name`
(f 1 name: "foo" rest: [2 3])         ;; all keyword
(f init: 1 rest: [2 3 4])             ;; name is omitted (optional)
```

## Spread — `...`

A unary `...` prefix expands its operand into the surrounding form. The same prefix is used in three places, with one consistent meaning ("inline these elements here"):

| Context              | Form                  | Effect                                                            |
| -------------------- | --------------------- | ----------------------------------------------------------------- |
| Function call        | `(f a ...xs b)`       | spreads vector `xs` as positional arguments                       |
| vector literal       | `[1 ...xs 4]`         | inlines elements of `xs` into the vector                          |
| Record literal       | `{a: 1 ...rec b: 2}`  | merges fields of `rec` into the record (later keys win)           |

```glisp
{xs = [2 3]
 (+ 1 ...xs 4)}                     ;; → 10
[0 ...[1 2 3] 4]                    ;; → [0 1 2 3 4]
{a: 1 ...{b: 2 c: 3} d: 4}          ;; → {a: 1 b: 2 c: 3 d: 4}
{base = {a: 1 b: 2}
 {...base b: 99}}                   ;; → {a: 1 b: 99} (later key wins)
(+ 1 ...~xs 4)                      ;; the same value; see `~` below
```

The operand of `...` must evaluate to a vector (in call/vector contexts) or to a record (in record context). Type mismatch falls back per the usual rules.

The `...` of a spread is always followed directly by an identifier or `~`. This distinguishes it from path forms, which always begin with `./`, `../` or `/` and contain a `/` (see [Path](#path-----and-)).

## Special forms

Five forms have built-in semantics beyond ordinary function application: `?` (match), `|>` (pipe), `%` (partial-application placeholder), `^T v` (coerce), and `(: T ...)` (derived type). They occupy head positions or appear as bare tokens; the evaluator/expander treats them specially.

### Match — `?`

`?` is a head-position special form that branches on the value of its first argument. Subsequent arguments form a flat sequence of `pattern result` pairs.

```glisp
(? value
   pattern1 result1
   pattern2 result2
   ...
   _        fallback)
```

- Patterns are scanned in order; the first matching clause's result is returned.
- A pattern that is a **type** (e.g. `number`, `string`, `(| "round" "butt")`, `_`) matches when the value casts successfully. `_` (Top) matches anything, so it serves as the fallthrough catch-all.
- A pattern that is a **value** (literal or otherwise) matches by value equality.
- If no clause matches, the result is `()`.
- All `result` expressions must have the same type (no union). The type of the whole `?` form is that common result type.
- The argument count after `value` must be even (clauses come in pairs); otherwise it is a syntax error.

`if` is just a special case of `?`:

```glisp
(? cond  true thenExpr  _ elseExpr)     ;; if-then-else via match
```

No separate `if` form is provided.

### Pipe — `|>`

`|>` chains values through a sequence of steps. Each step is applied as a function to the value flowing in.

```glisp
(|> input step1 step2 ... stepN)
```

- `input` is evaluated; its value flows into `step1`, whose result flows into `step2`, and so on.
- Each `stepK` evaluates to a function (after `%` expansion if applicable; see below). The function is called with the flowing value as its sole argument.
- The result of the whole `|>` is the output of `stepN`.

```glisp
(|> 5 double)              ;; ≡ (double 5)
(|> 5 double show)         ;; ≡ (show (double 5))
(|> 5 #(+ 2 %))             ;; ≡ ((=> [x] (+ 2 x)) 5) → 7
(|> 5 #(f a % b))           ;; ≡ ((=> [x] (f a x b)) 5) → (f a 5 b)
```

A pipe written with `#` and `%` as its input is a function of what goes in, as composition is:

```glisp
#(|> % f g)                ;; ≡ (=> [x] (g (f x)))   — function composition
(map #(|> % double) xs)    ;; pass (=> [x] (double x)) to map
```

### Partial application — `%`

`#` before `(...)`, `[...]` or `{...}` makes what it writes a function of one argument, which is every `%` in it. Without `#`, `%` is a syntax error, so what a function is made of is always written where it starts.

```glisp
#(f % y)             ;; ≡ (=> [x] (f x y))
#(* 2 %)             ;; ≡ (=> [x] (* 2 x))
(map #(* 2 %) xs)    ;; ≡ (map (=> [x] (* 2 x)) xs)
#[% %]               ;; ≡ (=> [x] [x x])
{a: #(+ % 1)}        ;; ≡ {a: (=> [x] (+ x 1))}     — only (+ % 1) is a function
#(* % %)             ;; ≡ (=> [x] (* x x))           — same x reused
#(g (f %))           ;; ≡ (=> [x] (g (f x)))         — % at any depth
(g #(f %) #(h %))    ;; ≡ (g (=> [x] (f x)) (=> [y] (h y)))   — independent functions
```

Each `%` belongs to the innermost `#` around it, so `#(f #(g %) %)` is `(=> [x] (f (=> [y] (g y)) x))`. A `#` with no `%` of its own is a syntax error. `#` goes with metadata as `#_` and `@` do: `^{label: "Double"} #(* 2 %)` is a function with a label.

`#` can be in the body of a function literal too — it just yields a higher-order result:

<!-- test -->
```glisp
(=> [x: number]: (=> [y: number]: number) #(* x %))
;; ≡ (=> [x: number]: (=> [y: number]: number) (=> [y] (* x y)))
;; → number → (number → number)
```

The inner `(=> [y] ...)` is a *desugaring artifact*, not source-level Glisp; its parameter type is inferred from context (here, `number` follows from `*`). See [eval.md](./eval.md#--partial-application-desugaring) for the inference rule.

Restrictions on where `%` may appear:
- **Type positions** (the right of `:`, parameter type slots, return type slots) — `%` is not a type and cannot stand in a type position.
- **Parameter lists** of `(=> ...)` — `(=> [% : T] ...)` is invalid; parameters must be named identifiers.
- **Record keys** — `{%: 10}` is invalid; keys must be identifiers.
- **Outside `#`** — `(* 2 %)` is invalid.

Anywhere else in a `#` (expression positions inside calls, vectors, records, function bodies), `%` is fine.

Only single-argument partial application is supported. For multi-argument anonymous functions, write `(=> [a: T b: U]: R ...)` explicitly.

The `|>` form interacts with `%` purely through this rule — a step like `#(+ 2 %)` is a function, which `|>` applies. There is no separate "pipe placeholder" semantics; `%` means the same thing everywhere.

### Coerce — `^T v`

`^T v` is `v` as a `T`: on match `v` flows through, and on mismatch it comes to `T`'s default with a diagnostic. `()` always comes to the default, silently. `T` is evaluated first as a type, then `v`. What follows `^` is a type when it is a name, a call, a vector, a function type, a path or a literal, as in `^number 1`, `^(IO number) x` and `^[number number] p`; `^{` is always [metadata](#metadata--). A record type is written `^(: {x: number}) r`. `^T` can wrap what has metadata, as `^Percent ^{label: "W"} 50`.

<!-- test -->
```glisp
^number 42            ;; → 42
^number "hi"          ;; → 0  (default, with a diagnostic)
^number ()            ;; → 0  (default, silently)
```

Calling a type of one value, as `(number 42)`, does the same, as its [constructor](./types.md#constructors) does. See [types.md — Coercion](./types.md#coercion-t-v) for the full semantics.

### Derived types — `(: T ...)`

`(: T key: value ... pred ...)` is a type made of `T`: its values that meet each `pred`, with what each key says of them. A `:` directly after `(` is this form; anywhere else it keeps its annotation or key role. `default:` says what the type falls back to, and has to be one of its values. `(: T)` is `T`. See [types.md — Derived types](./types.md#derived-types).

<!-- test -->
```glisp
Percent = (: number min: 0 max: 100 suffix: "%")
NonNegative = (: number #(>= % 0))
^NonNegative -3       ;; → 0  (default, with a diagnostic)
```

For non-fallback type tests (membership without consuming the default), pattern-match via `?`.

## Type annotation

`:` annotates a name with its type:

```glisp
(x: number)                            ;; argument
(=> [a: number]: number ...)           ;; return type after `:`
{x: 10}                                ;; record key
(f x: 10)                              ;; keyword argument
^{label: "..."}                        ;; metadata record key
```

## Local binding

`=` [names](#names--) an expression, and the name is bound for what is around it, in a let-block or anywhere else. The language has no other way to bind a name. A REPL or application shell may offer `name = expr` at its top level, as syntax for an `IO` action that edits the environment's let-block.

```glisp
{a = 10
 b = 20
 (+ a b)}
```

## Metadata — `^{...}` prefix

Any expression can be prefixed with `^{...}` to attach metadata, which says something of what it is written before:

```glisp
^{doc: "Square the number"} (=> [x: number]: number (* x x))
^{label: "Width"} 100
^{label: "Origin"} {x: 0 y: 0}
^{label: "Head" color: "red"} (circle [0 0] 10)
```

The `{...}` after `^` is a record literal (uses `:` for keys). Before a type, it says something of the type itself; to say it of the values of a type, write [`(: T key: value ...)`](#derived-types--t-). See [types.md — Metadata](./types.md#metadata).

### Locking — `@`

`@expr` locks an expression: [working backward](./eval.md#working-backward) from a value leaves it where it is, and a host does not change it, from a canvas or from an inspector, until it is unlocked. It is metadata, written in a short form, so it changes no value and adds no level for paths.

<!-- test -->
```glisp
{a = @10 (+ a 1)}                       ;; → 11
{z = @{a: 7} q = ./z/a: q}               ;; → 7
{z = ^{label: "Z"} @{a: 7} q = ./z/a: q} ;; → 7
```

`@` joins other metadata, as in `^{label: "Width"} @100`. `@@a` is a syntax error, and so is `@` as a key of `^{...}`.

### Hiding — `#_`

`#_expr` bypasses an expression where it stands: it stays in the program, and is edited and checked as ever, but comes to `()` without being worked out, which a typed slot turns into its default. What refers to it, by a name or a path, still gets its value.

<!-- test -->
```glisp
(+ 1 #_(+ 2 3) 4)                        ;; → 5
{a = #_10 (+ a 1)}                       ;; → 11
{a = ^{label: "A"} #_@10 (+ a 1)}        ;; → 11
{v = [1 #_2] ./v/1}                      ;; → 2
```

A binding is where something is defined rather than used, so `#_` there has no effect on its value, and a host takes it as not being output: a canvas does not draw it, and since nothing then asks for what nobody else refers to, that is not even worked out.

`#_` goes before `@` when printed, and joins other metadata. `#_#_a` is a syntax error. It stays where it is written, and does not go along with a type. `#` followed by anything else is kept for what may come, such as colors.

### Metadata semantics

- Equality: metadata does not affect type equality. `(: number default: 1)` and `(: number default: 0)` are the same type.
- Inheritance: every key goes along with a type, and what is written nearer goes over what came before, key by key. Only what marks a place, `@`, `#_`, `#` and a name, stays where it is written.
- The `default` key is the only metadata key with semantic meaning to the language core: when type mismatch or runtime error occurs, the `default` of the expected type is returned.
- `label` and `icon` are for editors. An editor shows a node by its own `label`, and a call by the `label` on the function's definition. `icon` is named the way the host names icons, and on a function's definition is the icon of that function where a call shows it. A value with no `icon` of its own takes its type's: `(: number icon: "...")` gives its values one, and `^{icon: "..."}` on what a type is bound to is the icon of that type and of its values.
- A parameter is labelled by `label` on its type, as in `(xs: (: [...T] label: "Items"))`, or by `params` on the function's definition, as in `^{params: {xs: "Items"}} (=> ...)`, which is how a host function does it. There, `{label: "Items" doc: "..."}` says what it is for as well, as `doc` on its type does.
- In a `doc`, a word in backticks that names a parameter stands for it, for an editor to show by its label.
- `min`, `max` and `step` say what a number can be, for an editor's widget: `^{min: 0 max: 100} 50`, or on a type, as in `(w: (: number min: 0 max: 100))`. They do not limit the value. `prefix` and `suffix` are shown around it, as in `^{suffix: "%"} 50`. A type carries them wherever it goes, so `Percent = (: number suffix: "%")` makes `(w: Percent)` show its argument that way. See [Metadata](./types.md#metadata).
- `scale` says how many times what it is a number is shown as, for an editor: `^{min: 0 max: 1 scale: 100 suffix: "%"} 0.5` is 0.5, shown as `50%`. `min`, `max` and `step` stay in terms of the value. `prefix` and `suffix` are what goes around it where it is shown.
- `changesFirst` on a parameter's type says that working backward is to change what refers to it before the other arguments of a call. See [Which argument changes](./eval.md#which-argument-changes).
- `proportional` says that the numbers of a vector go together, for an editor: `^{proportional: true} [100 50]`. Changing one has the others keep their ratio to it, going by the numbers as they are, so the ratio is not written anywhere else. It comes along with a type as `min` does, so what refers to such a vector goes the same way, and `^{proportional: false} s` is how to have it not.
- Metadata wraps cannot stack. `^{a: 1} ^{b: 2} expr` is a syntax error — combine the fields into a single `^{a: 1 b: 2}` instead. A coercion can wrap metadata, as `^Percent ^{label: "W"} 50`, and what is nearer the value goes over what the type says.
- Other keys (`label`, `color`, `icon`, `doc`, ...) have no effect on evaluation. The host attaches typed hints for these keys.

### `default` fallback timing

See [types.md](./types.md) for the canonical specification. In summary, default is substituted when `()` arrives at a typed slot, or when a non-`()` type mismatch occurs at a typed slot. Required slots emit diagnostics; optional slots (`?`) do not.

## Types

### Built-in primitive types

The built-in primitive types are `number`, `string`, `boolean`, `unit`, `_`, and `!`. Their literal forms: `()` for `unit`, `_` for `Top`, `!` for `Bottom`.

### Type constructors

```glisp
[...number]                              ;; vector of number
(=> [a: number b: number]: number)       ;; function type
(| "round" "butt" "square")              ;; one of these values
{x: number y: number}                    ;; record type
```

`|` makes a union of types, and a value written as it is there is the type of just that value. An expression that comes to `"round"` is of type `string`, which does not fit `(| "round" "butt")`, though a literal `"round"` written in its slot does.

### Coercing through a type

`^T v` casts/validates `v` as `T`:

<!-- test -->
```glisp
JoinType = (| "round" "butt" "square")

^number 42                     ;; → 42
^number "hello"                ;; → 0  (default)
^[...number] [1 2 3]           ;; → [1 2 3]
^JoinType "round"              ;; → "round"
^JoinType "diamond"            ;; → "round"  (default)
```

### Subtyping

Types are sets of values, with structural subtyping. See [types.md](./types.md#subtyping).

### Generics

A generic parameter list is written as a leading parens of bare names before the value parameter list:

```glisp
(=> {T} [xs: [...T] i: number]: T (xs i))
(=> {T U} [a: T b: U]: T a)
(=> {F T} [x: (F T)]: T ...)        ;; F stands for a type constructor: IO, vector
```

Parameter scope is the surrounding function literal.

## Abstraction ladder — `~`

`~expr` in a function body marks an implementation detail: `expand` works it out within one step, so its intermediate forms stay off the abstraction ladder. `evaluate` ignores it. `...~expr` is `...` applied to `~expr`.

```glisp
pow = (=> [x: number a: number]: number (* ...~(repeat x a)))

(pow (+ 1 1) (+ 1 2))  ;; expands to (* (+ 1 1) (+ 1 1) (+ 1 1))
```

See [eval.md](./eval.md#multi-step-evaluation--abstraction-ladder).

## `_` and `!`

- `_` is the top type — every value inhabits it.
- `!` is the bottom type — no value inhabits it.

## Reserved syntactic forms


| Token         | Role                                                   |
| ------------- | ------------------------------------------------------ |
| `(...)`       | function/value application                             |
| `[...]`       | vector; a function's parameters, after `=>`            |
| `{...}`       | record / let-block; a function's generics, after `=>`  |
| `:`           | type annotation, return type, record key, keyword argument, metadata key; a key in a path; a derived type when directly after `(` |
| `^T v`        | coerce `v` to `T`                                      |
| `=`           | names an expression, binding the name for what is around it |
| `=>`          | function literal                                       |
| `^{...}`      | metadata attachment                                    |
| `#(...)`      | a function of `%`, as `#[...]` and `#{...}` are         |
| `~`           | work out within one expansion step                     |
| `#_`          | bypass: comes to `()` where it stands, and is not output |
| `@`           | lock: leave as it is when working backward from a value, and in a host until it is unlocked |
| `...`         | spread / variadic                                      |
| `_`           | top type                                               |
| `!`           | bottom type                                            |
| `;`           | one-line comment                                       |
| `?`           | match special form (head); optional field/arg suffix   |
| `\|>`         | pipe special form                                      |
| `%`           | partial-application placeholder                        |
| `.`           | member accessor (record field / vector index / what goes with a type) |
| `..`          | path segment: parent of the current node (chain via `/`) |
| `/`           | division atom; path separator after `.` or `..`; before a name or an index, a path from the root |


