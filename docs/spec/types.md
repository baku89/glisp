# Glisp Type System

## Same-ADT model

Values and types share a single ADT. A type is itself a value of the language. There is no separate type-expression language layered on top of values.

```
Value ::=
    | Number n
    | String s
    | Boolean b
    | Unit
    | Vector [Value]
    | Record {key → Value}
    | Function ...
    | Type ...
    | Top
    | Bottom
```

Types can be `let`-bound, passed as arguments, returned from functions, quoted.

## Equality

Types are compared by identity / structural form of the base type. Two types are equal iff they are constructed identically modulo metadata.

```glisp
^{default: 1} Number  ==  ^{default: 0} Number   ;; same type (metadata ignored for equality)
Number  !=  String
(Vector Number)  ==  (Vector Number)
```

## Subtyping

There is no subtyping. Types are nominal/equality-based.

## Built-in types

| Type | Inhabitants |
|---|---|
| `Number` | All numeric values (IEEE 754 double internally) |
| `String` | All strings |
| `Boolean` | `true`, `false` |
| `Unit` | `()` |
| `Top` (`***`) | Any value |
| `Bottom` (`_|_`) | No value |

## Type constructors

A type constructor is a value that, when applied to one or more arguments, produces a new type.

| Form | Description |
|---|---|
| `(Vector T)` | Vectors of `T` |
| `(=> (T1 T2 ...): T)` | Function type |
| `(Enum v1 v2 ...)` | Enumeration of literal values |

`Enum` is the mechanism for finite sets of literal values. Members are validated by membership test at cast time.

## Types are callable: cast

A type value, when applied to a single argument, casts/validates the argument:

```glisp
(Number 42)                 ;; → 42
(Number "hello")            ;; → default fallback
((Vector Number) [1 2 3])   ;; → [1 2 3]
(JoinType "round")          ;; → "round"   (JoinType = (Enum "round" "butt" "square"))
(JoinType "diamond")        ;; → default fallback
```

The host's `cast(t, v)` is a thin wrapper that calls the type value.

## Metadata

Any value (including types) can be wrapped with metadata via `^{...}` prefix.

```glisp
^{default: 1 label: "Count"} Number
^{doc: "Square"} (=> (x: Number): Number (* x x))
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

`()` (the Unit literal) plays a dual role:

- As an explicit value, it is the unique inhabitant of `Unit`.
- As an implicit signal, it represents "value cannot be determined" — the canonical missing-value sentinel produced by any evaluator failure (unresolvable name, path failure, out-of-bounds access, cycle, etc.).

`()` is polymorphic: it is accepted at any typed slot. When `()` arrives at a slot whose declared type is `T`, it is coerced to `T`'s `default` metadata value.

Default substitution happens in any of these situations:

- **`()` arrives at a typed slot**: function parameter, record field declared with `:`, cast `(T v)`, predicate of `if`, etc. The slot's `default` is used.
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
(=> (T) (xs: (Vector T) i: Number): T (xs i))

((=> (T) (xs: (Vector T) i: Number): T (xs i)) [1 2 3] 0)
;; T is inferred from the argument as Number; result type is Number.
```

### Algorithm

Hindley-Milner-style unification. Generics are inferred at call sites.

## Open questions

- Whether to adopt a "types as sets of values" model (would introduce union types, literal types, set-inclusion subtyping).
- Recursive type definitions and how naming/equality interacts.
- Whether function types carry their own metadata (e.g. purity/effect annotations).
- Diagnostics propagation mechanism: Boxed value, `WeakMap<Value, Diagnostics>`, or hybrid (the primitive-key problem).
- TypeScript-side type derivation: how rich a TS type can be derived from a Glisp `Type` value.
