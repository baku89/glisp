# Glisp Type System

## Same-ADT model

Values and types share a single ADT. A type is itself a value of the language. There is no separate type-expression language layered on top of values.

```
Value ::=
    | number n
    | string s
    | boolean b
    | unit
    | Vector [Value]
    | Record {key → Value}
    | Function ...
    | Type ...
```

Types can be `let`-bound, passed as arguments, and returned from functions. `_` and `!` are types like any other.

## Equality

Types are compared by their **structural form**, modulo metadata. Two types are equal iff they are built from the same primitive / constructor with equal arguments, regardless of whether they share memory identity. Two distinct AST nodes that construct the same type produce equal types.

```glisp
(: number default: 1)  ==  (: number default: 0)   ;; same type (metadata ignored for equality)
number  !=  string
[...number]  ==  [...number]
```

### Function-type equality

A function type is identified by its **list of parameter types** (positional, in declared order) and its **return type**. Parameter *names* are part of the function value's keyword-argument interface but **not** part of the type identity:

```glisp
(=> [a: number b: number]: number)  ==  (=> [x: number y: number]: number)
```

Two functions of these types are interchangeable at any slot expecting that type. Calls that use keyword arguments still need to supply the receiving function's actual parameter names — that is a per-value concern, not a type concern.

## Subtyping

A type is a set of values, and a type fits another when all its values belong to it. Compatibility is structural:

- `[number number]` fits `[...number]` and `[number ...number]`.
- A record with extra fields fits, and a field declared `y?:` may be missing.
- `(| "a" "b")` fits `string` and `(| "a" "b" "c")`.
- A type fits `(| A B)` if it fits `A` or `B`, and `(| A B)` fits where both `A` and `B` do. Where only one of them does, a value of it is not known to be wrong, and so is not reported until it arrives as something that does not fit.
- A type made by `(: T ...)` fits `T`.
- `(IO T)` and `[...T]` are covariant.
- Function parameters match in either direction, so `_` in a slot's signature means "don't care".

`_` is one type with both readings. There is no separate top. `_` as the type of a value means **not known** rather than "anything", so it fits every slot. Only what is known to be wrong is reported, and a value of unknown type is still checked when it arrives at a typed slot at run time. `!` fits everything and nothing else fits it.

A conversion that changes a value is never implicit.

## Built-in types

| Type | Inhabitants |
|---|---|
| `number` | All numeric values (IEEE 754 double internally) |
| `string` | All strings |
| `boolean` | `true`, `false` |
| `unit` | `()` |
| `ast` | Any AST node, as handed over by the host |
| `IO` | Deferred host effects — opaque values produced by host functions and shell assignment. Parametric: `(IO T)` is an IO that produces a `T` when forced; bare `IO` is sugar for `(IO _)` (see [eval.md](./eval.md)) |
| `_` (top) | Any value |
| `!` (bottom) | No value |

The top and bottom types are bound in the prelude under their syntactic names (`_` and `!`); they are not also exposed as longer aliases.

### Naming convention

Built-in primitive type names are **lowercase**: `number`, `string`, `boolean`, `unit`, `vector`. Host-imported types and user-defined types are conventionally **uppercase-initial**: `Date`, `URL`, `JoinType`, `Point`. The convention is not enforced (identifier syntax allows either case) but signals the type's origin at a glance.

## Type constructors

A type constructor is a value that, when applied to one or more arguments, produces a new type.

| Form | Description |
|---|---|
| `[T1 T2 ... Tn]` | tuple type: fixed `n` elements with the given types (in order) |
| `[T1 T2 ... Tn ...Trest]` | tuple with a trailing rest: first `n` fixed, then any number of `Trest` |
| `[...T]` | rest-only tuple — equivalent to "vector of `T`" with no fixed prefix |
| `{k1: T1 k2: T2 ...}` | record with the given field types (same shape as a record value) |
| `(=> [a: T1 b: T2 ...]: R)`, `(=> [T1 T2 ...]: R)` | Function type (parameter names are optional; not part of identity) |
| `(: T key: value ... pred ...)` | derived type: the values of `T` that meet each `pred`, with what each key says of them, falling back to `default:` if one is given. See [Derived types](#derived-types) |
| `(\| T1 T2 ...)` | union: the values of any of `T1 T2 ...`, defaulting to the first one's default |
| `42`, `"round"`, `true` | a value written as it is: the type of just that value, which is its own default |
| `(IO T)` | parametric IO: a deferred effect that, when forced, produces a `T`. Compatibility is covariant in the payload (`(IO !)` fits `(IO _)`) |
| `(vector T)` | the same type as `[...T]`. Bare `vector` is any vector |

Tuple, vector, and record types share their syntax with the corresponding value literals. The interpretation depends on the slot in which the AST appears — see [Type interpretation at type slots](#type-interpretation-at-type-slots).

Notes on tuple types:

- The rest part `...T` may appear **only as the last element**. A middle rest like `[T1 ...T2 T3]` is rejected.
- A tuple of zero fixed elements with no rest is `[]`, the type whose only inhabitant is the empty vector.
- Equality is structural: `[number number] == [number number]`, `[number string] != [string number]`.

A value written as it is, where a type is wanted, is the type of just that value: `"round"` there holds `"round"` and nothing else. A finite set of values is a union of them, `(| "round" "butt" "square")`, which defaults to the first. `()` there is `unit`.

### Derived types

`(: T key: value ... pred ...)` makes a type of `T`. Each `pred` after `T` narrows it to the values for which `pred` is true; a value has to fit `T` first. Each `key: value` says something of its values, as metadata does, and `default:` is what it falls back to, which has to be one of its values: a predicate `T`'s own default does not meet is a diagnostic unless there is one. What a key says is evaluated, as any type expression is, and kept as a literal, so `(: number max: w)` says the number `w` comes to. `(: T)` is `T`.

<!-- test -->
```glisp
ColorCode = (: string #(starts-with % "#") default: "#000000")

^ColorCode "#FF0000"  ;; → "#FF0000"
^ColorCode "hello"    ;; → "#000000"  (default)

NonNegative = (: number #(>= % 0))
Percent = (: number min: 0 max: 100 suffix: "%")
```

A `ColorCode` fits where a `string` is expected, but not the other way around.

When `^T v` is used to coerce, a value that does not fit `T` produces a diagnostic in addition to falling back to the default. This is the same surfacing rule typed function slots use: explicit `^T v` and implicit slot share the diagnostic boundary so type mismatches are never silent.

`|` is the mechanism for a slot that takes values of more than one type, such as a point or a point with handles. A value that fits any member is taken as it is, and one that fits none falls back to the first member's default, so the order of the members says only what the default is. It converts nothing: a value is not changed into another member.

<!-- test -->
```glisp
Anchor = (| [number number] {at: [number number] in?: [number number] out?: [number number]})

^Anchor [10 20]                          ;; → [10 20]
^Anchor {at: [0 0] out: [5 0]}           ;; → {at: [0 0] out: [5 0]}
^Anchor "a"                              ;; → [0 0]  (default, with a diagnostic)
^[...Anchor] [[0 0] {at: [10 0]}]        ;; → [[0 0] {at: [10 0]}]
```

A union inside a union is spread into its members, the same type is a member once, and a union of one type is that type: `(| number (| string number))` is `(| number string)`, and `(| number)` is `number`. Two unions are the same type if they have the same members, in any order. `(|)`, with no members, holds no value, as `!` does. The arguments of `|` are type slots, so `[T U]` and `{x: T}` are types there.

## Recursive types

Recursive type definitions use named bindings in a let-block. Glisp's let-bindings are self-referential — a binding's right-hand side may reference the binding's own name — so:

```glisp
{
  Tree = {value: number children: [...Tree]}
  ...
}
```

defines a recursive type. There is no anonymous recursive-type form (`(rec X ...)`); naming the type via let is the recommended pattern.

## Type interpretation at type slots

A **type slot** is a position in the AST where a type is expected — the right of `:` in a parameter or record-field annotation, the return-type position of `(=> ... : T ...)`, the second argument of `^T v`, and the equivalent positions in metadata.

At a type slot the AST is evaluated, then the resulting value is interpreted as a type:

| Value form                                                              | Interpreted as                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A value that is already a type                                          | itself                                                               |
| A record value whose field values are all types                         | record type with those field types                                   |
| A vector value whose elements are all types (rest spread `...T` allowed at the end) | tuple type with the fixed element types and an optional rest |
| Anything else                                                           | type error; default fallback applies                                 |

This is what lets literal forms play double duty:

| Kind     | Value form         | Type form               |
| -------- | ------------------ | ----------------------- |
| record   | `{x: 10 y: 20}`    | `{x: number y: number}` |
| tuple    | `[1 "a"]`          | `[number string]`       |
| vector   | `[1 2 3]`          | `[...number]`           |
| function | (closure)          | `(=> [a: T]: R)`        |

`[...T]` is the special case of a tuple type with no fixed prefix and a rest of `T` — the type of "any-length vector of `T`". `[T1 T2 ...T3]` mixes fixed and rest. The rest spread may appear only at the end (see [Type constructors](#type-constructors)).

### What type slots do *not* mean

A type-slot annotation like `x: number` always reads as "x has type `number`" — that is, x is a numeric value. It is **not** read as "x is the singleton whose only inhabitant is the type value `number`". Glisp does not introduce singleton types over type values; you cannot say "x must be the type value `number`, nothing else". To constrain a value to a set of values, write them as they are in a union, `(| "red" 42)`, which is for values like `"red"` and `42`, not for type values.

This rule keeps the meaning of every annotation unambiguous: the right side of `:` always describes the *kind of values* the slot accepts, never a specific value pinned by identity.

## Coercion: `^T v`

Explicit type coercion is written `^T v`. `T` must evaluate to a type value, `v` is the value to coerce:

<!-- test -->
```glisp
JoinType = (| "round" "butt" "square")

^number 42                 ;; → 42
^number "hello"            ;; → 0  (default, with a diagnostic)
^[...number] [1 2 3]       ;; → [1 2 3]
^JoinType "round"          ;; → "round"
((=> [j: JoinType]: JoinType j) "butt")       ;; → "butt"
((=> [o: {j: JoinType}]: _ o) {j: "butt"})    ;; → {j: "butt"}
^JoinType "diamond"        ;; → "round"  (default, with a diagnostic)
```

`(T v)`, a type called with one value, does the same for a type that is not made of parts. See [Constructors](#constructors).

## Constructors

A type that takes no types, called, is a value of it made of what it is given. A type that takes types, as `IO` and `vector`, is applied to them instead, as `(IO number)`.

- A tuple takes its elements in order, `(vec2 1 2)`, and a vector of any length as many as it is given.
- A record takes its fields by name, `(Point x: 1)`, or in the order they are declared.
- Any other type takes one value, so `(Percent 50)` is `^Percent 50`.

What is not given is its default, as a field that can be left out is left out, and what does not fit comes to the default, with a diagnostic, as at any typed slot. One argument that is a whole value of the type already is taken as it is, so `(vec2 [1 2])` is `[1 2]`. A name bound to a vector or a record of types, or to a union, is a type when it is called, as where a type is wanted; one bound to values, as `[1 2]`, is called as a vector is.

<!-- test -->
```glisp
{Point = {x: number y: number}
 Pair = [number number]
 [(Point x: 1) (Point 1 2) (Pair 3) (Pair [4 5]) (number "a")]}
;; → [{x: 1 y: 0} {x: 1 y: 2} [3 0] [4 5] 0]
```

Working backward goes through a constructor to what it was given, so dragging a point made by `(vec2 1 2)` changes the `1` and the `2`.

The rule:

1. `t.fits(v)` succeeds → return `v` unchanged.
2. `v` is `()` → return `t.default` silently (matches the typed-slot fallback in [Type interpretation at type slots](#type-interpretation-at-type-slots)).
3. otherwise → return `t.default` and emit a diagnostic.

The host's `coerceTo(t, v)` performs steps (1) and (3) without surfacing diagnostics.

For non-fallback type tests (membership without consuming the default), pattern-match via `?`:

```glisp
(? v
   number (handle-number v)
   string (handle-string v)
   _        (handle-other v))
```

### Constant-function lifting

When the target type of `^T v` is a function type `(=> [...]: R)` and the input `v` is **not** a function, the coercion tries to interpret `v` as the return value of a constant function:

- If `v` coerces to `R`, the result is a constant function `(=> [...]: R v)` — calling it ignores its arguments and returns `v`.
- Otherwise, the standard default fallback applies.

<!-- test -->
```glisp
(map [1 2 3] ^(=> [x: number]: number) 20)   ;; → [20 20 20]
```

Lifting only happens inside `^T v` against a function type. Outside it a value's identity is unchanged. This rule complements the ban on zero-parameter functions: instead of writing `(=> []: T body)` (which is a syntax error), pass `body` through `^T body` wherever a function is expected.

## Members

A type can have functions and constants that go with it, read with `.`, so that a host's `vec2` is one name for the points and for what is done to them.

```glisp
(=> [p: vec2]: vec2 (vec2.scale p 2))
```

Members say nothing about the type's values, so they take no part in what fits what. For now only a host gives a type members. See [`withMembers`](./host-api.md#what-goes-with-a-type).

## Metadata

What is said of a value is written `^{...}` before it, and is a type's annotations: what a type says of its values, other than which they are. There are two places to say it.

- `^{...} v` says it of `v`, whatever `v` is: a value, a call, or a type, which is then said of the type itself, as `^{doc: "The type of angles"} Angle`. `^T v` is `v` as a `T`, and takes what `T` says. See [Coercion](#coercion-t-v).
- `(: T key: value ...)` says it of the values of `T`, which makes a type of it. See [Derived types](#derived-types).

```glisp
Count = (: number default: 1 label: "Count")
^{doc: "Square"} (=> [x: number]: number (* x x))
^{label: "Width" color: "red"} (circle [0 0] 10)
```

### Semantics

Evaluation reads only `default` of it: what `^{default: d} v` comes to where `v` comes to `()`, and what a type gives where what it is given does not fit. Annotations do not change what fits what, so `(: number suffix: "%")` holds the same values as `number`, and a `Percent` can be passed where an `Angle` is wanted. Hosts read the rest, for a label, a doc, a color, a range.

Static analysis carries them along with a type, through names, parameters' and return types, and generics, and what is written nearer goes over what came before, key by key:

<!-- test -->
```glisp
Percent = (: number min: 0 max: 100 suffix: "%")
Half = (: Percent max: 50)      ;; min, suffix, and a max of 50
a = ^Percent 20                 ;; : (: number min: 0 max: 100 suffix: "%")
b = ^{min: 0} 5                 ;; : (: number min: 0)
c = b                           ;; : (: number min: 0)
w = ^Percent ^{label: "W"} 20   ;; : (: number min: 0 max: 100 suffix: "%" label: "W")
d = (+ b 1)                     ;; : number, since `+` says it returns a number
f = (=> [p: Percent]: number p) ;; `p` is a Percent, and so is what is passed to it, for an editor
```

Every key goes along, `doc`, `label` and `icon` as much as `min`. A name is the label of where it is written, which is nearer than what a type says, so `(opacity: Percent)` is shown as `opacity` however `Percent` is labelled. What marks a place goes nowhere: `@`, `#_`, `#` and the name itself. Annotations stay out of type names in diagnostics.

Only what is written as a literal can be read back from `^{...}`, as `^{max: a}` cannot be without running `a`. `(: T max: a)` evaluates `a`, as any type expression is evaluated, and keeps what it comes to. A `default` can be any expression whose value is of the type, and one that is not is a diagnostic and has no effect. A host that writes a default into a program, such as for an argument being added, writes that expression, so that `(: mat2d default: (mat2d.trs [50 0]))` starts as something that can be read, or what it comes to if it would not come to the same there.

### Reserved metadata keys

The language core assigns semantic meaning only to:

| Key | Meaning |
|---|---|
| `default` | Fallback value when `()` arrives at a typed slot of this type, or when a non-`()` type mismatch occurs |

All other keys are unrestricted. Hosts may register typed schemas for them via the host API.

A value written as a type can have metadata of its own, which goes with it: `(| (: "a" icon: "ph:a") (: "b" icon: "ph:b"))`. It is the same type as `(| "a" "b")`. As elsewhere, only what is written as a literal can be read back, so a value spread in, as in `(| ...xs)`, has none. An editor shows the values by their `icon` if all of them have one. What an icon's name means is up to the host.

### `()` and default fallback

`()` (the unit literal) plays a dual role:

- As an explicit value, it is the unique inhabitant of `unit`.
- As an implicit signal, it represents "value cannot be determined" — the canonical missing-value sentinel produced by any evaluator failure (unresolvable name, path failure, out-of-bounds access, cycle, etc.).

`()` is polymorphic: it is accepted at any typed slot. When `()` arrives at a slot whose declared type is `T`, it is coerced to `T`'s `default` metadata value.

Default substitution happens in any of these situations:

- **`()` arrives at a typed slot**: function parameter, record field declared with `:`, `^T v`, predicate of `if`, etc. The slot's `default` is used.
  - For required slots: a diagnostic is emitted at the substitution site.
  - A slot of a type that `()` fits, as `(| T unit)`, takes `()` as it is. This is what can be left out: `y?: T` is `y: (| T unit)`. Left out, it takes the default, which is `T`'s, silently. See [Left out](#left-out).
- **Non-`()` type mismatch at a typed slot**: a diagnostic is emitted and the slot's `default` is used.
- **Static-time**: when the type checker proves an expression will fail, the substitution happens at compile time without waiting for runtime.

### Left out

What can be left out is what can be `()`: a field or a parameter of a type that is `unit` or a union with it. `y?: T` is another way to write `y: (| T unit)`.

<!-- test -->
```glisp
Style = {width: number dash?: number}
^Style {width: 2}                      ;; → {width: 2}
((=> [d?: number]: _ d))                  ;; → 0   (left out: the default of number, silently)
((=> [d?: number]: _ d) ())               ;; → ()  (given as nothing, it stays so)
((=> [d: (| number unit)]: _ d))          ;; → 0
```

A field that is missing is read as `()`, and so a record without it fits. An editor shows such a slot as one that can be emptied.

Evaluation never throws at the language level. Errors and warnings flow on a parallel diagnostics channel.

## Type inference

### Mandatory annotations

- Function parameter types.

### Inferred

- Local bindings in a let-block.
- Sub-expression types within a function body.
- Generic type parameters at call sites.
- A function's return type, when it is left out or written `_`: what the body comes to, with each parameter of its declared type. Evaluated, such a return is `_`, so what the function gives is not turned into a default; only static analysis knows more of it.

```glisp
(=> {T} [xs: [...T] i: number]: T (xs i))

((=> {T} [xs: [...T] i: number]: T (xs i)) [1 2 3] 0)
;; T is inferred from the argument as number; result type is number.
```

### Algorithm

Signatures are mandatory, so types flow locally rather than through a global solver. `infer(ast, env)` runs no value expression. The only thing it evaluates is a type expression, since types are values.

- **A literal has its base type**, whatever `number` or `string` means in scope, since a program can bind those names to something else. A slot also takes a literal for what it is, so `"round"` goes in a slot of `(| "round" "butt")` and `"z"` does not. This is true of what is written there, a vector or record of literals included. A name bound to `"round"` is a `string`, which `^J name` casts.
- **Generics are solved at a call**, one argument at a time, by matching types structurally: `(xs: [...T])` given `[1 2]` solves `T` as `number`. A generic seen twice takes whichever of the two types the other fits; if neither does, that is a diagnostic. An unsolved generic is `_`.
- **Function literals are inferred after other arguments**, against what those solved. In `(map [1 2] #(+ % 1))`, `%` is a `number`, so the result is `[...number]`. A parameter or return declared `_` takes what is known from the slot and from the body.
- **Type constructors can be generic.** In `(=> {F T} [x: (F T)]: T ...)`, given `(IO number)`, `F` is `IO` and `T` is `number`; given `[1 2]`, `F` is `vector`.
- **Inside a generic function's body, `T` is opaque**: it fits only itself.
- **A return that says nothing comes from the body.** `(=> [x: number] (* x x))` is a `(=> [number]: number)`. While the body is read, a call of the function in it comes to `_`, so a recursive one still has a type, as `(* n (f (- n 1)))` is a `number`. A parameter declared `_` leaves it to what the function is given, as for `map`.
- **Unions come only from `?`.** A vector with no common element type is a vector of `_` when it meets `[...T]`.
- **`?`** has the type its clauses have in common, and with none, the union of them: `(? x 0 "zero" _ x)` is a `(| string number)`.

`check(ast, env)` walks everything, including what evaluation would not reach: references, call arguments, return types, and clauses of `?`.

## Open questions

- Anonymous recursive types `(rec X ...)`. Currently named bindings cover the use cases; revisit if a clear motivation appears.
- Whether function types carry their own metadata (e.g. purity/effect annotations).
- Whether inference should make a union of the elements of `[1 "a"]`, as it does of the clauses of `?`, and whether a clause of `?` should narrow the type of what it matched.
- Tagged sums. A union of records that differ by a field, as `{kind: (| "a") ...}`, covers them for now.
- **Type classes / constraint-based generics** (`(=> [T: Addable] (a: T b: T): T ...)`). v1 uses `overload` as a closed set of candidates. Type classes would add open extension (new instances declarable later) at the cost of a constraint syntax, instance declaration, and dictionary-passing implementation. Defer to v2; if introduced, `overload` may become syntactic sugar for a closed type-class definition.
