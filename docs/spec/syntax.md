# Glisp Syntax

Status: **draft**, in active design discussion.

## Design principles

- S-expression based. The grammar of glim explored non-S-expression syntax but the conclusion was to keep S-expressions.
- No English keywords. Reserved tokens are symbolic (`=>`, `***`, `_|_`, `^`, etc.).
- Whitespace is the only separator. No commas. Newlines are whitespace.
- Code-as-data (homoiconic): quoted expressions are first-class values.

## Tokens

### Literals (core)

| Form | Type |
|---|---|
| `42`, `3.14`, `-7`, `1e-5` | `Number` (single unified numeric type, IEEE 754 double internally) |
| `"hello"`, `"with\nescape"` | `String` |
| `true`, `false` | `Boolean` |
| `()` | `Unit` (empty function application; see [Structure](#structure)) |
| `***` | `Top` |
| `_|_` | `Bottom` |

Out of core (deferred or handled by extension libraries):

- Rational literal `1/2` — use `(rational 1 2)` from a stdlib instead.
- Angle literal `20rad` — graphics-domain extension.
- Color literal `#ff0000` — graphics-domain extension.
- Literal types (e.g. `42` as a singleton type) — not supported. Use `Enum` (see [Types](#types)) for enumerated values.

### Identifiers (symbols)

Bare identifiers are symbols, resolved in the lexical environment.

```glisp
foo bar baz?  +  *  multiply-by-2
```

Allowed characters: TBD (likely Lisp-traditional: alphanumerics, `+ - * / ? ! < > = & | ^ % $`, with restriction that the first character is not a digit).

Keyword literal (`:foo`) is **not** introduced. Record keys are written with bare symbols followed by `:`.

### Comments

- One-line: `; ...`
- Multi-line: `#| ... |#`

## Structure

### `(...)` — function application / value invocation

```glisp
(+ 1 2 3)            ;; function application → 6
((if c f g) x)       ;; head can be any expression that evaluates to a value
([1 2 3] 0)          ;; vector invocation → 1 (element access)
({x: 10 y: 20} key)  ;; record invocation → field access (key syntax TBD)
(Number 42)          ;; type invocation → cast / validate
(Number "hello")     ;; cast failure → default fallback
```

All values are callable; the calling behavior is determined by the value's type:

| Value type | `(value args...)` |
|---|---|
| Function | apply |
| Type | cast / validate |
| Vector | element access |
| Record | field access |
| Other (Number, String, ...) | type mismatch → default fallback |

Empty `()` is the unit value.

### `[...]` — vector

```glisp
[1 2 3]
[(+ 1 2) (+ 3 4)]    ;; → [3 7] (elements are evaluated)
[]                   ;; empty vector
```

A vector is a value of type `(Vector T)` for some element type `T`.

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
(=> (x: Number y: Number): Number (* x y))
(=> <T> (x: T): T x)                          ;; generic
(=> (Number Number): Number)                   ;; function type (no body)
```

Argument signature is **mandatory**. Inside the body, types are inferred.

### Application — keyword arguments

Named arguments are written with `=`:

```glisp
(fn arg0 arg1 key0=value0 key1=value1)
```

## Type annotation

`:` annotates a name with its type:

```glisp
(x: Number)              ;; argument
(=> (...): Number ...)   ;; return type
{x: 10}                  ;; record key (with the value as the right-hand side)
^{label: "..."}          ;; metadata record key
```

## Local binding

`=` binds a name to a value in a let-block:

```glisp
{a = 10
 b = 20
 (+ a b)}
```

The same `=` is reused for keyword arguments at function application sites; context disambiguates.

## Metadata — `^{...}` prefix

Any expression can be prefixed with `^{...}` to attach metadata:

```glisp
^{default: 1 label: "Count"} Number
^{doc: "Square the number"} (=> (x: Number): Number (* x x))
^{label: "Width"} 100
^{label: "Origin"} {x: 0 y: 0}
^{label: "2D Point"} (Vector Number)
```

The `{...}` after `^` is a record literal (uses `:` for keys).

### Metadata semantics

- **Equality**: metadata does not affect type equality. `^{default: 1} Number` and `^{default: 0} Number` are the same type.
- **Inheritance**: when a derived value/type is created (e.g. by metadata override), unset keys are inherited from the parent. Set keys override (last-write-wins merge).
- **`default`** is the only metadata key with semantic meaning to the language core: when the value is missing or a type mismatch / runtime error occurs, the `default` of the expected type is returned.
- **Other keys** (`label`, `color`, `icon`, `doc`, ...) are passed through transparently. They have no effect on evaluation. The host (TS/JS, GUI, IDE, etc.) can attach typed hints for these keys.

### `default` fallback timing

The `default` of the expected type is substituted in any of:

- Function application: when an argument is type-mismatched, that argument is replaced with the type's default.
- `cast` (i.e. `(T value)`): when `value` does not validate as `T`, the result is the default of `T`.
- Any expression evaluation: if a runtime error occurs and the surrounding context expects a specific type, the default is returned.
- **Static**: if type checking can determine that an expression will fail, the default is substituted at compile time without waiting for runtime.

## Types

### Built-in primitive types

`Number`, `String`, `Boolean`, `Unit`, `Top` (`***`), `Bottom` (`_|_`).

### Type constructors

```glisp
(Vector Number)                   ;; vector of Number
(=> (Number Number): Number)      ;; function type
(Enum "round" "butt" "square")    ;; enumeration of values
```

`Enum` takes literal values and produces a type that validates against membership in the value set.

### Type as cast

`(T value)` casts/validates `value` as `T`:

```glisp
(Number 42)                       ;; → 42
(Number "hello")                  ;; → default fallback
((Vector Number) [1 2 3])         ;; → [1 2 3]
(JoinType "round")                ;; with JoinType = (Enum "round" "butt" "square") → "round"
(JoinType "diamond")              ;; → default fallback
```

### Subtyping

There is **no** subtyping. Types are nominal/equality-based. `Enum` membership is checked at cast time, not modeled as `"round" <: JoinType`.

(Future extension: a "types as sets of values" view is left open. If introduced, it would unify `Enum`, `Union`, and literal types under set-inclusion subtyping. For now, intentionally not committed.)

### Generics

`<T>` introduces a type parameter:

```glisp
(=> <T> (xs: (Vector T) i: Number): T (xs i))
```

Parameter scope is the surrounding function literal.

## Quoting

Code-as-data via Clojure-style quasiquoting:

| Form | Meaning |
|---|---|
| `` `expr `` | quasiquote: produce the expression itself as a value (an `Expr` value) |
| `~expr` | unquote: evaluate `expr` and splice its result into the surrounding quasiquote |
| `~@expr` | unquote-splice: evaluate `expr` (must be a list/vector) and splice its elements |

```glisp
`(+ 1 ~x ~@xs)
```

The result of `` `... `` is itself a Glisp value (a syntax tree). This is the foundation for macros and templating.

## Top / Bottom

- `***` is the top type — every value inhabits it. Useful as a "any" in metadata-laden contexts.
- `_|_` is the bottom type — no value inhabits it. The type of expressions that never produce a value (e.g. infinite loops, errors).

## Reserved syntactic forms (summary)

| Token | Role |
|---|---|
| `(...)` | function/value application |
| `[...]` | vector |
| `{...}` | record / let-block |
| `:` | type annotation, return type, record key, metadata key |
| `=` | local binding, keyword argument |
| `=>` | function literal |
| `<T>` | generic parameter list |
| `^{...}` | metadata attachment |
| `` ` `` | quasiquote |
| `~` | unquote |
| `~@` | unquote-splice |
| `***` | Top type |
| `_|_` | Bottom type |
| `;` | one-line comment |
| `#| ... |#` | multi-line comment |

## Open questions (TBD)

- Identifier character set (especially handling of `/`, `.`, `?`, `!`).
- Record field access syntax: `(rec key)` — what is `key`? Bare symbol lookups in the lexical env, conflicting with field names. Options: string `"key"`, quoted symbol `` `key ``, or a special accessor form.
- Implicit doc-string sugar: should the leading string literal in a function body desugar to `^{doc: "..."}`?
- Multi-line string literal syntax.
- Module / import syntax.
- Whether `Unit` should be its own dedicated literal token (currently overlaps with empty `()`).
