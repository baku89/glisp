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
    | Top
    | Bottom
```

Types can be `let`-bound, passed as arguments, returned from functions, quoted.

## Equality

Types are compared by their **structural form**, modulo metadata. Two types are equal iff they are built from the same primitive / constructor with equal arguments, regardless of whether they share memory identity. Two distinct AST nodes that construct the same type produce equal types.

```glisp
^{default: 1} number  ==  ^{default: 0} number   ;; same type (metadata ignored for equality)
number  !=  string
[...number]  ==  [...number]
```

### Function-type equality

A function type is identified by its **list of parameter types** (positional, in declared order) and its **return type**. Parameter *names* are part of the function value's keyword-argument interface but **not** part of the type identity:

```glisp
(=> (a: number b: number): number)  ==  (=> (x: number y: number): number)
```

Two functions of these types are interchangeable at any slot expecting that type. Calls that use keyword arguments still need to supply the receiving function's actual parameter names — that is a per-value concern, not a type concern.

## Subtyping

There is no subtyping. Types are nominal/equality-based.

## Built-in types

| Type | Inhabitants |
|---|---|
| `number` | All numeric values (IEEE 754 double internally) |
| `string` | All strings |
| `boolean` | `true`, `false` |
| `unit` | `()` |
| `ast` | Any AST node (the value form of a quoted expression / a macro's input or output) |
| `IO` | Deferred host effects — opaque values produced by `def`, `undef`, etc. Parametric: `(IO T)` is an IO that produces a `T` when forced; bare `IO` is sugar for `(IO _)` (see [eval.md](./eval.md)) |
| `_` (top) | Any value |
| `!` (bottom) | No value |

The top and bottom types are bound in the prelude under their syntactic names (`_` and `!`); they are not also exposed as longer aliases.

### Naming convention

Built-in primitive type names are **lowercase**: `number`, `string`, `boolean`, `unit`, `vector`, `enum`. Host-imported types and user-defined types are conventionally **uppercase-initial**: `Date`, `URL`, `JoinType`, `Point`. The convention is not enforced (identifier syntax allows either case) but signals the type's origin at a glance.

## Type constructors

A type constructor is a value that, when applied to one or more arguments, produces a new type.

| Form | Description |
|---|---|
| `[T1 T2 ... Tn]` | tuple type: fixed `n` elements with the given types (in order) |
| `[T1 T2 ... Tn ...Trest]` | tuple with a trailing rest: first `n` fixed, then any number of `Trest` |
| `[...T]` | rest-only tuple — equivalent to "vector of `T`" with no fixed prefix |
| `{k1: T1 k2: T2 ...}` | record with the given field types (same shape as a record value) |
| `(=> (a: T1 b: T2 ...): R)` | Function type (parameter names are required syntactically; not part of identity) |
| `(enum v1 v2 ...)` | enumeration of literal values (all of the same type) |
| `(refine T default pred)` | refinement: subset of `T` satisfying `pred: (=> (v: T): boolean)`, with an explicit default for failed casts |
| `(IO T)` | parametric IO: a deferred effect that, when forced, produces a `T`. Compatibility is covariant in the payload (`(IO !)` fits `(IO _)`) |

Tuple, vector, and record types share their syntax with the corresponding value literals. The interpretation depends on the slot in which the AST appears — see [Type interpretation at type slots](#type-interpretation-at-type-slots).

Notes on tuple types:

- The rest part `...T` may appear **only as the last element**. A middle rest like `[T1 ...T2 T3]` is rejected.
- A tuple of zero fixed elements with no rest is `[]`, the type whose only inhabitant is the empty vector.
- Equality is structural: `[number number] == [number number]`, `[number string] != [string number]`.

`enum` is the mechanism for finite sets of literal values. Members must share a single base type; validation at cast time is membership in the value set.

`refine` is the mechanism for value-restricted subtypes — a base type narrowed by a predicate. Coercing through `(refine T default pred)` via `(@ ... v)` first checks that `v` fits `T`; if so, `pred(v)` is called; if `pred` returns true, the value is accepted, otherwise the result falls back to the explicit `default`. The default is supplied separately because `T`'s default need not satisfy `pred`.

```glisp
ColorCode = (refine string "#000000"
                    (=> (s: string): boolean
                       (and (= (size s) 7)
                            (= (s 0) "#"))))

(ColorCode "#FF0000")    ;; → "#FF0000"
(ColorCode "hello")      ;; → "#000000" (default — size mismatch)

NonNegative = (refine number 0 (=> (n: number): boolean (>= n 0)))
```

`refine` does not introduce subtyping. A `ColorCode` value is a distinct type from `string`; passing it where `string` is expected requires an explicit coercion `(@ string c)` (which trivially succeeds since the underlying representation is the same). `enum` could in principle be expressed as a special-cased `refine`, but is kept as its own constructor for readability of the common literal-set case.

When `@` is used to coerce, a value that does not fit `T` produces a diagnostic in addition to falling back to the default. This is the same surfacing rule typed function slots use: explicit `@` and implicit slot share the diagnostic boundary so type mismatches are never silent.

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

A **type slot** is a position in the AST where a type is expected — the right of `:` in a parameter or record-field annotation, the return-type position of `(=> ... : T ...)`, the first argument of `(@ T v)`, and the equivalent positions in metadata.

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
| function | (closure)          | `(=> (a: T): R)`        |

`[...T]` is the special case of a tuple type with no fixed prefix and a rest of `T` — the type of "any-length vector of `T`". `[T1 T2 ...T3]` mixes fixed and rest. The rest spread may appear only at the end (see [Type constructors](#type-constructors)).

### What type slots do *not* mean

A type-slot annotation like `x: number` always reads as "x has type `number`" — that is, x is a numeric value. It is **not** read as "x is the singleton whose only inhabitant is the type value `number`". Glisp does not introduce singleton types over type values; you cannot say "x must be the type value `number`, nothing else". If you need to constrain a value to a literal-set membership, use `enum` (which is for value literals like `"red"`, `42`, etc., not for type values).

This rule keeps the meaning of every annotation unambiguous: the right side of `:` always describes the *kind of values* the slot accepts, never a specific value pinned by identity.

## Coercion: `(@ T v)`

Explicit type coercion uses the `@` special form. `T` must evaluate to a type value, `v` is the value to coerce:

```glisp
(@ number 42)                 ;; → 42
(@ number "hello")            ;; → 0      (default — diagnostic)
(@ [...number] [1 2 3])       ;; → [1 2 3]
(@ JoinType "round")          ;; → "round"   (JoinType = (enum "round" "butt" "square"))
(@ JoinType "diamond")        ;; → "round"   (default — diagnostic)
```

`@` is the only way to invoke the cast/validate semantics on a type value. The bare-call form `(T v)` is **not** a cast — type values are not callable. Calling a type value emits a diagnostic suggesting `(@ T v)`.

The rule:

1. `t.fits(v)` succeeds → return `v` unchanged.
2. `v` is `()` → return `t.default` silently (matches the typed-slot fallback in [Type interpretation at type slots](#type-interpretation-at-type-slots)).
3. otherwise → return `t.default` and emit a diagnostic.

The host's `coerceTo(t, v)` is a thin wrapper that performs steps (1) and (3) without surfacing diagnostics — used by the evaluator at typed slots and by the static checker.

For non-fallback type tests (membership without consuming the default), pattern-match via `?`:

```glisp
(? v
   (number) (handle-number v)
   (string) (handle-string v)
   _        (handle-other v))
```

### Constant-function lifting

When `@`'s target type is a function type `(=> (...): R)` and the input `v` is **not** a function, the coercion tries to interpret `v` as the return value of a constant function:

- If `v` coerces to `R`, the result is a constant function `(=> (...): R v)` — calling it ignores its arguments and returns `v`.
- Otherwise, the standard default fallback applies.

```glisp
(@ (=> (x: number): number) 20)        ;; → (=> (x: number): number 20)
(map [1 2 3] (@ (=> (x: number): number) 20))   ;; → [20 20 20]
```

Lifting only happens inside `@` against a function type. Outside `@` a value's identity is unchanged. This rule complements the ban on zero-parameter functions: instead of writing `(=> (): T body)` (which is a syntax error), pass `body` through `@` wherever a function is expected.

## Metadata

Any value (including types) can be wrapped with metadata via `^{...}` prefix.

```glisp
^{default: 1 label: "Count"} number
^{doc: "Square"} (=> (x: number): number (* x x))
^{label: "Width"} 100
```

### Semantics

Metadata sits as a layer on top of the underlying value. The underlying value's type is unchanged. Metadata is consulted at three points:

1. **`default` fallback**. The `default` key, if present on the expected type, is the fallback value when type mismatch or runtime error occurs.
2. **Host introspection**. Hosts read metadata for label, doc, color, etc. The language core treats these as opaque pass-through.
3. **Inheritance**. When a value/type is derived, metadata merges with last-write-wins. Unset keys are inherited.

### Reserved metadata keys

The language core assigns semantic meaning only to:

| Key | Meaning |
|---|---|
| `default` | Fallback value when `()` arrives at a typed slot of this type, or when a non-`()` type mismatch occurs |

All other keys are unrestricted. Hosts may register typed schemas for them via the host API.

### `()` and default fallback

`()` (the unit literal) plays a dual role:

- As an explicit value, it is the unique inhabitant of `unit`.
- As an implicit signal, it represents "value cannot be determined" — the canonical missing-value sentinel produced by any evaluator failure (unresolvable name, path failure, out-of-bounds access, cycle, etc.).

`()` is polymorphic: it is accepted at any typed slot. When `()` arrives at a slot whose declared type is `T`, it is coerced to `T`'s `default` metadata value.

Default substitution happens in any of these situations:

- **`()` arrives at a typed slot**: function parameter, record field declared with `:`, `(@ T v)`, predicate of `if`, etc. The slot's `default` is used.
  - For required slots: a diagnostic is emitted at the substitution site.
  - For optional slots (declared with `?`): substitution is silent.
- **Non-`()` type mismatch at a typed slot**: a diagnostic is emitted and the slot's `default` is used.
- **Static-time**: when the type checker proves an expression will fail, the substitution happens at compile time without waiting for runtime.

Evaluation never throws at the language level. Errors and warnings flow on a parallel diagnostics channel.

## Type inference

### Mandatory annotations

- Function parameter types.
- Function return type.

### Inferred

- Local bindings in a let-block.
- Sub-expression types within a function body.
- Generic type parameters at call sites.

```glisp
(=> (T) (xs: [...T] i: number): T (xs i))

((=> (T) (xs: [...T] i: number): T (xs i)) [1 2 3] 0)
;; T is inferred from the argument as number; result type is number.
```

### Algorithm

Hindley-Milner-style unification. Generics are inferred at call sites.

## Open questions

- Anonymous recursive types `(rec X ...)`. Currently named bindings cover the use cases; revisit if a clear motivation appears.
- Whether function types carry their own metadata (e.g. purity/effect annotations).
- Diagnostics propagation mechanism: Boxed value, `WeakMap<Value, Diagnostics>`, or hybrid (the primitive-key problem).
- TypeScript-side type derivation for `refine`-based subtypes: how to surface the predicate constraint in the inferred TS type.
- Sum types / ADTs: not introduced. Tagged-record-by-convention covers the common cases; revisit if needed.
- **Type classes / constraint-based generics** (`(=> (T: Addable) (a: T b: T): T ...)`). v1 uses `overload` as a closed set of candidates. Type classes would add open extension (new instances declarable later) at the cost of a constraint syntax, instance declaration, and dictionary-passing implementation. Defer to v2; if introduced, `overload` may become syntactic sugar for a closed type-class definition.
