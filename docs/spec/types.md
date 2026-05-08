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
| `default` | Fallback value when type mismatch or error |

All other keys are unrestricted. Hosts may register typed schemas for them via the host API.

### Default fallback timing

`default` is substituted in any of these situations:

- Function application: a type-mismatched argument is replaced with the parameter type's default before the body runs.
- Cast: `(T v)` returns `T`'s default when `v` does not validate as `T`.
- Any evaluation: a runtime error in a context expecting type `T` is replaced by `T`'s default.
- Static-time: when the type checker proves an expression will fail, the substitution happens at compile time.

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
(=> <T> (xs: (Vector T) i: Number): T (xs i))

((=> <T> (xs: (Vector T) i: Number): T (xs i)) [1 2 3] 0)
;; T is inferred from the argument as Number; result type is Number.
```

### Algorithm

Hindley-Milner-style unification. Generics are inferred at call sites.
