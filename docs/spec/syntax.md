# Glisp Syntax

## Design principles

- S-expression based.
- No English keywords. Reserved tokens are symbolic (`=>`, `_`, `!`, `^`, etc.).
- Whitespace is the only separator. No commas. Newlines are whitespace.
- Code-as-data: quoted expressions are first-class values.

## Tokens

### Literals


| Form                        | Type      |
| --------------------------- | --------- |
| `42`, `3.14`, `-7`, `1e-5`  | `number`  |
| `"hello"`, `"with\nescape"` | `string`  |
| `true`, `false`             | `boolean` |
| `()`                        | `unit`    |
| `_`                         | `Top`     |
| `!`                         | `Bottom`  |


`number` is a single unified numeric type, IEEE 754 double internally.

Literal types (e.g. `42` as a singleton type) are not introduced. Use `enum` for enumerated values.

Keyword literal (`:foo`) is not introduced. Record keys are written with bare symbols followed by `:`.

### Identifiers (symbols)

Bare identifiers are symbols, resolved in the lexical environment.

```glisp
foo bar baz!  +  *  multiply-by-2  >=  is-empty
```

Allowed characters: alphanumerics and `+ - * < > & | % _ ! $`. The first character must not be a digit.

Several bare tokens are reserved and cannot stand alone as identifiers; embedded use within an identifier is still fine:

| Bare token | Reserved meaning                            | Embedded example (still valid) |
| ---------- | ------------------------------------------- | ------------------------------ |
| `_`        | `Top` type literal                          | `_x`, `foo_bar`                |
| `!`        | `Bottom` type literal                       | `is-empty!`                    |
| `%`        | partial-application placeholder             | `URL%encoded`                  |
| `\|>`      | pipe special form                           | (none — distinct from `\|`)    |
| `?`        | match special form (head); optional suffix  | (none — `?` already reserved)  |

Reserved (not allowed in identifiers): `? : = . / ^ ~ ' \` , ; ( ) [ ] { } # @` and whitespace.

`/` standing alone is an atom referring to the division function (the same role `+` `-` `*` play as bare-token operator atoms). It is not part of identifiers because it doubles as the path separator (see [Path](#path)).

### Comments

One-line only: `; ...`. Comments run to the end of the line.

## Whitespace

Whitespace separates tokens. Newlines are whitespace; commas are not used.

Adjacent elements at the same nesting level must be separated by at least one whitespace character. A closing bracket (`)`, `]`, `}`) cannot directly abut another token. The following are syntax errors:

```glisp
[[1][2]]      ;; ❌ — write [[1] [2]]
(foo)(bar)    ;; ❌ — write (foo) (bar)
(+ 1 2)3      ;; ❌ — write (+ 1 2) 3
```

This is stricter than traditional Lisp (where closing brackets implicitly terminate tokens). The benefit is regular tokenization and trivial whole-tree text rewrites: a primitive-level find/replace never has to worry about token boundaries hidden inside `]a` or `)(`.

Opening brackets in succession (`((`, `[[`, `[(`, `({`, ...) are not element boundaries and need no separator.

## Structure

### `(...)` — function application / value invocation

```glisp
(+ 1 2 3)            ;; → 6
((if c f g) x)       ;; head can be any expression
([1 2 3] 0)          ;; vector invocation → 1 (index)
({x: 10 y: 20} "x")  ;; record invocation → field access by string key
(number 42)          ;; type invocation → cast
(number "hello")     ;; cast failure → default fallback
```

All values are callable; the calling behavior is determined by the value's type:


| Value type                  | `(value args...)`                |
| --------------------------- | -------------------------------- |
| Function                    | apply                            |
| Type                        | cast / validate                  |
| vector                      | element access by integer index  |
| Record                      | field access by string key       |
| Other (number, string, ...) | type mismatch → default fallback |


Empty `()` is the unit value.

### `[...]` — vector

```glisp
[1 2 3]
[(+ 1 2) (+ 3 4)]    ;; → [3 7]
[]
```

A vector is a value of type `(vector T)` for some element type `T`.

### Accessor — `.`

Member access on records and vectors. The right of `.` is a literal name (for records, becomes a string key) or an integer (for vectors, becomes an index); the left is any expression that evaluates to a record or vector.

```glisp
point.x          ;; → (point "x")
arr.2            ;; → (arr 2)
a.b.c            ;; → ((a "b") "c"), left-associative
(make-point).x   ;; left side may be an arbitrary expression
```

Accessor `.` is syntactic sugar that desugars to the call form. Dynamic keys (variables, expressions) are written in the call form: `(rec keyVar)`, `(arr (+ i 1))`.

### Path — `./` and `../`

A path atom references an AST position relative to the current expression by walking the container structure (the AST tree).

- `./name` — `name` in the immediate parent AST node.
- `../name` — `name` in the grandparent.
- After the dots, segments may chain with `/`: `./record/key`, `../vec/0`.

Path supports two levels only (`.` and `..`). Three or more dots (`...`) are reserved for spread/splice/variadic forms; a token of the shape `.../foo` is not a path. Deeper references should use bare-name lookup via let-block bindings or function parameters instead.

Segments are names (record fields, kwargs, let-block bindings, function parameters) or integers (vector elements, positional arguments).

```glisp
{width: 100
 height: ./width                ;; parent = record, sibling 'width' = 100
 area: (* ../width ../height)}  ;; grandparent (call's parent) = record, lookup width/height

[10 ./0]                        ;; parent = vector, element 0 = 10 → vector evaluates to [10 10]

[./1 "str with index 1"]        ;; ./1 = vector's element 1 → ["str with index 1" "str with index 1"]

(+ x ./1)                       ;; in a call, child 0 is head (+), child 1 is x, child 2 is ./1
                                ;; ./1 = child 1 = x → equivalent to (+ x x)
```

Paths walk every AST level, including records, vectors, function applications, and quasi-quotes. Bare-name lookup of an unqualified `x`, by contrast, walks only scope-introducing forms (let-blocks and function literals). Records, vectors, and applications are transparent to bare-name lookup but addressable via path.

There is no absolute path form (no leading `/...`).

### Optional fields and arguments — `?`

A trailing `?` on a record field name or function parameter name marks it as optional:

```glisp
{x: number  y?: string}                              ;; record type with optional y
(=> (x: number y?: string): number ...)              ;; optional argument y
```

Semantics (in conjunction with the `()` missing-value signal — see [types.md](./types.md)):

- A missing or `()` value at a **required** slot triggers the type's `default` and emits a diagnostic.
- A missing or `()` value at an **optional** slot triggers the type's `default` silently.

### `{...}` — record or let-block

The block contents determine the kind:

- All entries `name: expr` → **record**.
- Otherwise (entries `name = expr` and at most one trailing bare expression) → **let-block**.
- Mixing `:` and `=` is a syntax error.

```glisp
{x: 10 y: 20}                  ;; record
{a = 10 b = 20 (+ a b)}        ;; let-block → 30
{a = 10 b = 20}                ;; let-block, no trailing expression → unit
{}                             ;; empty record
{x: 10  a = 20}                ;; ❌ syntax error
{a = 10 (foo) (+ a 1)}         ;; ❌ syntax error: only one trailing bare expression allowed
```

## Functions

### Function literal

```glisp
(=> (x: number y: number): number (* x y))
(=> (T) (x: T): T x)                          ;; generic
(=> (T U) (a: T b: U): T a)                   ;; multiple generics
(=> (number number): number)                  ;; function type (no body)
```

Argument signature and return type are mandatory. Inside the body, types are inferred.

When two parens lists appear before the return type `:`, the first is the generic parameter list (bare names) and the second is the value parameter list (`name: Type` entries). When one list appears, it is the value parameter list.

### Variadic parameters

A parameter prefixed with `...` is variadic: it collects the remaining positional arguments into a vector.

```glisp
(=> (...xs: (vector number)): number ...)
(=> (init: number ...rest: (vector number)): number ...)
```

- A variadic parameter must appear last in the value parameter list.
- Its type must be `(vector T)` for some `T`. Each collected argument is checked against `T`.
- At most one variadic parameter per function.

See [Spread](#spread--) for how to call variadic functions and for spread in vectors, records, and quasiquote.

### Application — keyword arguments

Any positional parameter of a function can be passed by name at the call site using `name=value`. No special declaration is required at the definition: every parameter is automatically callable both positionally and by keyword.

```glisp
(=> (x: number y: number z: number): number (* x y z))

(f 2 3 4)              ;; all positional → 24
(f x=2 y=3 z=4)        ;; all keyword → 24
(f 2 z=4 y=3)          ;; positional first, then keyword in any order → 24
(f y=3 x=2 z=4)        ;; keyword only, in any order → 24
```

Rules:

- Once a keyword argument appears in a call, no further positional argument may follow.
- Each parameter must receive at most one binding (positional or keyword, not both). Double-binding emits a diagnostic.
- A keyword whose name is not a parameter of the callee emits a diagnostic.
- A required parameter (no `?` suffix) that receives no binding emits a diagnostic; the slot is filled with the parameter type's `default`.
- An optional parameter (`?` suffix) that receives no binding silently uses the parameter type's `default`.
- Variadic parameters (`...rest`) collect remaining positional arguments only; they cannot be filled by keyword.

## Spread — `...`

A unary `...` prefix expands its operand into the surrounding form. The same prefix is used in four places, with one consistent meaning ("inline these elements here"):

| Context              | Form                  | Effect                                                            |
| -------------------- | --------------------- | ----------------------------------------------------------------- |
| Function call        | `(f a ...xs b)`       | spreads vector `xs` as positional arguments                       |
| vector literal       | `[1 ...xs 4]`         | inlines elements of `xs` into the vector                          |
| Record literal       | `{a: 1 ...rec b: 2}`  | merges fields of `rec` into the record (later keys win)           |
| Quasiquote (splice)  | `` `(foo ...~xs) ``   | unquote-splice: evaluates `xs` and inlines its elements           |

```glisp
{xs = [2 3]
 (+ 1 ...xs 4)}                     ;; → 10
[0 ...[1 2 3] 4]                    ;; → [0 1 2 3 4]
{a: 1 ...{b: 2 c: 3} d: 4}          ;; → {a: 1 b: 2 c: 3 d: 4}
{base = {a: 1 b: 2}
 {...base b: 99}}                   ;; → {a: 1 b: 99} (later key wins)
`(foo ...~xs bar)                   ;; xs evaluates to [1 2 3] → `(foo 1 2 3 bar)
```

The operand of `...` must evaluate to a vector (in call/vector/quasiquote-splice contexts) or to a record (in record context). Type mismatch falls back per the usual rules.

The `...` of a spread is always followed directly by an identifier or `~`. This distinguishes it from path forms, which always have a `/` after the dots — and Glisp paths only go up to two dots (see [Path](#path----and-)).

## Special forms

Three forms have built-in semantics beyond ordinary function application: `?` (match), `|>` (pipe), and `%` (partial-application placeholder). They occupy head positions or appear as bare tokens; the evaluator/expander treats them specially.

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
- A pattern that is a **type** (e.g. `number`, `string`, `(enum "round" "butt")`, `_`) matches when the value casts successfully. `_` (Top) matches anything, so it serves as the fallthrough catch-all.
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
(|> 5 (+ 2 %))             ;; ≡ ((=> (x) (+ 2 x)) 5) → 7
(|> 5 (f a % b))           ;; ≡ ((=> (x) (f a x b)) 5) → (f a 5 b)
```

When `input` itself is `%`, the entire `|>` form is the function (function composition):

```glisp
(|> % f g)                 ;; ≡ (=> (x) (g (f x)))   — function composition
(|> % (+ 2 %))             ;; ≡ (=> (x) (+ 2 x))
(map (|> % double) xs)     ;; pass (=> (x) (double x)) to map
```

### Partial application — `%`

A bare `%` in any expression turns its **smallest enclosing** `(...)`, `[...]`, or `{...}` into a single-argument function. The argument replaces every occurrence of `%` within that enclosing form.

```glisp
(f % y)              ;; ≡ (=> (x) (f x y))
(* 2 %)              ;; ≡ (=> (x) (* 2 x))
(map (* 2 %) xs)     ;; ≡ (map (=> (x) (* 2 x)) xs)
[% %]                ;; ≡ (=> (x) [x x])
{a: (+ % 1)}         ;; ≡ {a: (=> (x) (+ x 1))}     — only (+ % 1) is wrapped
(* % %)              ;; ≡ (=> (x) (* x x))           — same x reused
(g (f %) (h %))      ;; ≡ (g (=> (x) (f x)) (=> (y) (h y)))   — independent functions
```

Expansion is bottom-up: the innermost `%` is consumed first, so each `%` belongs to its smallest enclosing `(...)`/`[...]`/`{...}`. Nesting is unambiguous.

Restrictions:
- `%` may not appear directly inside a function literal `(=> ...)`. The literal already declares its arguments explicitly; mixing `%` would be ambiguous. Syntax error.
- Only single-argument partial application is supported. For multi-argument anonymous functions, write `(=> (a b) ...)` explicitly.

The `|>` form interacts with `%` purely through this rule — a step like `(+ 2 %)` becomes a function via the `%` expansion, then `|>` applies it. There is no separate "pipe placeholder" semantics; `%` means the same thing everywhere.

## Type annotation

`:` annotates a name with its type:

```glisp
(x: number)              ;; argument
(=> (...): number ...)   ;; return type
{x: 10}                  ;; record key
^{label: "..."}          ;; metadata record key
```

## Local binding

`=` binds a name to a value in a let-block:

```glisp
{a = 10
 b = 20
 (+ a b)}
```

The same `=` is reused for keyword arguments at function application sites.

## Metadata — `^{...}` prefix

Any expression can be prefixed with `^{...}` to attach metadata:

```glisp
^{default: 1 label: "Count"} number
^{doc: "Square the number"} (=> (x: number): number (* x x))
^{label: "Width"} 100
^{label: "Origin"} {x: 0 y: 0}
^{label: "2D Point"} (vector number)
```

The `{...}` after `^` is a record literal (uses `:` for keys).

### Metadata semantics

- Equality: metadata does not affect type equality. `^{default: 1} number` and `^{default: 0} number` are the same type.
- Inheritance: when a derived value/type is created, unset keys are inherited from the parent. Set keys override (last-write-wins merge).
- The `default` key is the only metadata key with semantic meaning to the language core: when type mismatch or runtime error occurs, the `default` of the expected type is returned.
- Other keys (`label`, `color`, `icon`, `doc`, ...) have no effect on evaluation. The host attaches typed hints for these keys.

### `default` fallback timing

See [types.md](./types.md) for the canonical specification. In summary, default is substituted when `()` arrives at a typed slot, or when a non-`()` type mismatch occurs at a typed slot. Required slots emit diagnostics; optional slots (`?`) do not.

## Types

### Built-in primitive types

The built-in primitive types are `number`, `string`, `boolean`, `unit`, `Top`, and `Bottom`. Their literal forms: `()` for `unit`, `_` for `Top`, `!` for `Bottom`.

### Type constructors

```glisp
(vector number)                   ;; vector of number
(=> (number number): number)      ;; function type
(enum "round" "butt" "square")    ;; enumeration of values
```

`enum` takes literal values and produces a type that validates against membership in the value set. `"round"` itself remains of type `string`, distinct from any `enum` containing it.

### Type as cast

`(T value)` casts/validates `value` as `T`:

```glisp
(number 42)                       ;; → 42
(number "hello")                  ;; → default fallback
((vector number) [1 2 3])         ;; → [1 2 3]
(JoinType "round")                ;; → "round"  (JoinType = (enum "round" "butt" "square"))
(JoinType "diamond")              ;; → default fallback
```

### Subtyping

There is no subtyping. Types are nominal/equality-based. `enum` membership is checked at cast time, not modeled as `"round" <: JoinType`.

### Generics

A generic parameter list is written as a leading parens of bare names before the value parameter list:

```glisp
(=> (T) (xs: (vector T) i: number): T (xs i))
(=> (T U) (a: T b: U): T a)
```

Parameter scope is the surrounding function literal.

## Quoting

Code-as-data via Clojure-style quasiquoting:


| Form        | Meaning                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| `` `expr `` | quasiquote: produce the expression itself as a value                           |
| `~expr`     | unquote: evaluate `expr` and splice its result into the surrounding quasiquote |
| `...~expr`  | unquote-splice: evaluate `expr` and splice its elements                        |


```glisp
`(+ 1 ~x ...~xs)
```

The result of ``...` is itself a Glisp value (a syntax tree).

## Top / Bottom

- `_` is the top type — every value inhabits it.
- `!` is the bottom type — no value inhabits it.

## Reserved syntactic forms


| Token         | Role                                                   |
| ------------- | ------------------------------------------------------ |
| `(...)`       | function/value application                             |
| `[...]`       | vector                                                 |
| `{...}`       | record / let-block                                     |
| `:`           | type annotation, return type, record key, metadata key |
| `=`           | local binding, keyword argument                        |
| `=>`          | function literal                                       |
| `^{...}`      | metadata attachment                                    |
| `` ` ``       | quasiquote                                             |
| `~`           | unquote                                                |
| `...`         | spread / variadic / unquote-splice (with `~`)          |
| `_`           | Top type                                               |
| `!`           | Bottom type                                            |
| `;`           | one-line comment                                       |
| `?`           | match special form (head); optional field/arg suffix   |
| `\|>`         | pipe special form                                      |
| `%`           | partial-application placeholder                        |
| `.`           | member accessor (record field / vector index)          |
| `..`          | path: grandparent (one more AST level up)              |
| `/`           | division atom; path separator after `.` or `..`        |


