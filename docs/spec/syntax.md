# Glisp Syntax

## Design principles

- S-expression based.
- No English keywords. Reserved tokens are symbolic (`=>`, `***`, `_|_`, `^`, etc.).
- Whitespace is the only separator. No commas. Newlines are whitespace.
- Code-as-data: quoted expressions are first-class values.

## Tokens

### Literals

| Form | Type |
|---|---|
| `42`, `3.14`, `-7`, `1e-5` | `Number` |
| `"hello"`, `"with\nescape"` | `String` |
| `true`, `false` | `Boolean` |
| `()` | `Unit` |
| `***` | `Top` |
| `_|_` | `Bottom` |

`Number` is a single unified numeric type, IEEE 754 double internally.

Literal types (e.g. `42` as a singleton type) are not introduced. Use `Enum` for enumerated values.

Keyword literal (`:foo`) is not introduced. Record keys are written with bare symbols followed by `:`.

### Identifiers (symbols)

Bare identifiers are symbols, resolved in the lexical environment.

```glisp
foo bar baz!  +  *  multiply-by-2  >=  is-empty
```

Allowed characters: alphanumerics and `+ - * < > & | % _ ! $`. The first character must not be a digit.

Reserved (not allowed in identifiers): `? : = . / ^ ~ ' \` , ; ( ) [ ] { } # @` and whitespace.

`/` standing alone is an atom referring to the division function (the same role `+` `-` `*` play as bare-token operator atoms). It is not part of identifiers because it doubles as the path separator (see [Path](#path)).

### Comments

- One-line: `; ...`
- Multi-line: `#| ... |#`

## Structure

### `(...)` — function application / value invocation

```glisp
(+ 1 2 3)            ;; → 6
((if c f g) x)       ;; head can be any expression
([1 2 3] 0)          ;; vector invocation → 1 (index)
({x: 10 y: 20} "x")  ;; record invocation → field access by string key
(Number 42)          ;; type invocation → cast
(Number "hello")     ;; cast failure → default fallback
```

All values are callable; the calling behavior is determined by the value's type:

| Value type | `(value args...)` |
|---|---|
| Function | apply |
| Type | cast / validate |
| Vector | element access by integer index |
| Record | field access by string key |
| Other (Number, String, ...) | type mismatch → default fallback |

Empty `()` is the unit value.

### `[...]` — vector

```glisp
[1 2 3]
[(+ 1 2) (+ 3 4)]    ;; → [3 7]
[]
```

A vector is a value of type `(Vector T)` for some element type `T`.

### Accessor — `.`

Member access on records and vectors. The right of `.` is a literal name (for records, becomes a string key) or an integer (for vectors, becomes an index); the left is any expression that evaluates to a record or vector.

```glisp
point.x          ;; → (point "x")
arr.2            ;; → (arr 2)
a.b.c            ;; → ((a "b") "c"), left-associative
(make-point).x   ;; left side may be an arbitrary expression
```

Accessor `.` is syntactic sugar that desugars to the call form. Dynamic keys (variables, expressions) are written in the call form: `(rec keyVar)`, `(arr (+ i 1))`.

### Path — `../`

A path atom references a name in an ancestor scope. It is a sequence of one or more `..` segments separated by `/`, followed by `/` and a name.

```glisp
../x         ;; one scope level up, lookup 'x'
../../foo    ;; two scope levels up
../x.y       ;; resolve 'x' one level up, then access field 'y' (accessor sugar)
```

Each `..` walks up one enclosing scope (let-block or function literal). The trailing name is resolved in that ancestor scope.

There is no absolute path form (no leading `/...`). Lexical lookup of an unqualified name `x` walks outward through enclosing scopes as usual; `../x` makes the walk explicit and limits it to a precise depth, e.g. to refer past a shadowed binding.

### Optional fields and arguments — `?`

A trailing `?` on a record field name or function parameter name marks it as optional:

```glisp
{x: Number  y?: String}                              ;; record type with optional y
(=> (x: Number y?: String): Number ...)              ;; optional argument y
```

Semantics:

- **Required** field/argument absent → diagnostic (warning/error) + fallback to the type's `default`.
- **Optional** field/argument absent → no diagnostic, fallback to the type's `default`.

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
(=> (Number Number): Number)                  ;; function type (no body)
```

Argument signature and return type are mandatory. Inside the body, types are inferred.

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
^{default: 1 label: "Count"} Number
^{doc: "Square the number"} (=> (x: Number): Number (* x x))
^{label: "Width"} 100
^{label: "Origin"} {x: 0 y: 0}
^{label: "2D Point"} (Vector Number)
```

The `{...}` after `^` is a record literal (uses `:` for keys).

### Metadata semantics

- **Equality**: metadata does not affect type equality. `^{default: 1} Number` and `^{default: 0} Number` are the same type.
- **Inheritance**: when a derived value/type is created, unset keys are inherited from the parent. Set keys override (last-write-wins merge).
- **`default`** is the only metadata key with semantic meaning to the language core: when type mismatch or runtime error occurs, the `default` of the expected type is returned.
- **Other keys** (`label`, `color`, `icon`, `doc`, ...) have no effect on evaluation. The host attaches typed hints for these keys.

### `default` fallback timing

The `default` of the expected type is substituted in any of:

- Function application: a type-mismatched argument is replaced with the parameter type's default.
- Cast `(T value)`: when `value` does not validate as `T`, the result is the default of `T`.
- Any expression evaluation: a runtime error in a context expecting type `T` is replaced by `T`'s default.
- Static-time: when the type checker proves an expression will fail, the substitution happens at compile time.

## Types

### Built-in primitive types

`Number`, `String`, `Boolean`, `Unit`, `Top` (`***`), `Bottom` (`_|_`).

### Type constructors

```glisp
(Vector Number)                   ;; vector of Number
(=> (Number Number): Number)      ;; function type
(Enum "round" "butt" "square")    ;; enumeration of values
```

`Enum` takes literal values and produces a type that validates against membership in the value set. `"round"` itself remains of type `String`, distinct from any `Enum` containing it.

### Type as cast

`(T value)` casts/validates `value` as `T`:

```glisp
(Number 42)                       ;; → 42
(Number "hello")                  ;; → default fallback
((Vector Number) [1 2 3])         ;; → [1 2 3]
(JoinType "round")                ;; → "round"  (JoinType = (Enum "round" "butt" "square"))
(JoinType "diamond")              ;; → default fallback
```

### Subtyping

There is no subtyping. Types are nominal/equality-based. `Enum` membership is checked at cast time, not modeled as `"round" <: JoinType`.

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
| `` `expr `` | quasiquote: produce the expression itself as a value |
| `~expr` | unquote: evaluate `expr` and splice its result into the surrounding quasiquote |
| `~@expr` | unquote-splice: evaluate `expr` and splice its elements |

```glisp
`(+ 1 ~x ~@xs)
```

The result of `` `... `` is itself a Glisp value (a syntax tree).

## Top / Bottom

- `***` is the top type — every value inhabits it.
- `_|_` is the bottom type — no value inhabits it.

## Reserved syntactic forms

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
| `?` | optional field / argument suffix |
| `.` | member accessor (record field / vector index) |
| `..` | path: one scope level up |
| `/` | division atom; path separator after `..` |

## Open questions

- Module / import syntax.
- Whether `?` has uses beyond optional field/argument (e.g. cast probe, type predicate).
