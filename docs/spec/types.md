# Glisp Type System

Status: **draft**, in active design discussion.

## Foundations

### Same-ADT model

Values and types share **a single ADT**. A type is itself a value of the language. There is no separate "type expression" language layered on top of values.

Concretely, the runtime representation is:

```
Value ::=
    | Number n
    | String s
    | Boolean b
    | Unit
    | Vector [Value]
    | Record {key → Value}
    | Function ...
    | Type ...                ;; types are values
    | Top
    | Bottom
```

This means types can be `let`-bound, passed as arguments, returned from functions, quoted, etc.

### Equality / nominal

Types are compared by identity / structural form of the **base** type. There is no subtyping. Two types are equal iff they are constructed identically modulo metadata.

```glisp
^{default: 1} Number  ==  ^{default: 0} Number   ;; same type (metadata ignored for equality)
Number  !=  String                                ;; different types
(Vector Number)  ==  (Vector Number)              ;; same type
```

(See [Open questions](#open-questions-tbd) — a "types as sets of values" alternative is not yet committed.)

## Built-in types

| Type | Inhabitants |
|---|---|
| `Number` | All numeric values (IEEE 754 double internally) |
| `String` | All strings |
| `Boolean` | `true`, `false` |
| `Unit` | `()` |
| `Top` (`***`) | Any value |
| `Bottom` (`_|_`) | No value (uninhabited) |

## Type constructors

A type constructor is a value that, when applied to one or more types, produces a new type.

| Form | Description |
|---|---|
| `(Vector T)` | Vectors of `T` |
| `(=> (T1 T2 ...): T)` | Function type |
| `(Enum v1 v2 ...)` | Enumeration of literal values |

`Enum` is the mechanism for finite sets of literal values (e.g. `(Enum "round" "butt" "square")`). Members of an `Enum` are validated by membership test at cast time. This does **not** introduce subtyping — `"round"` itself remains of type `String`, distinct from any `Enum` containing it.

## Types are callable: cast

A type value, when applied to a single argument, casts/validates the argument:

```glisp
(Number 42)                 ;; → 42
(Number "hello")            ;; → default fallback (no implicit conversion)
((Vector Number) [1 2 3])   ;; → [1 2 3]
(JoinType "round")          ;; → "round"   (where JoinType = (Enum "round" "butt" "square"))
(JoinType "diamond")        ;; → default fallback
```

This is the in-language equivalent of `cast(t, v)` in the host (TS/JS) API. The host's `cast` is a thin wrapper that calls the type value.

## Metadata

Any value (including types) can be wrapped with metadata via `^{...}` prefix:

```glisp
^{default: 1 label: "Count"} Number
^{doc: "Square"} (=> (x: Number): Number (* x x))
^{label: "Width"} 100
```

### Metadata is a value-level layer

Metadata sits "on top of" the underlying value. The underlying value's type is unchanged. Metadata is consulted at three points:

1. **`default` fallback**. The `default` key, if present on the expected type, is the fallback value when type mismatch or runtime error occurs.
2. **Host introspection**. Hosts (TS/JS API, GUIs, IDEs) read metadata for label, doc, color, etc. The language core treats these as opaque pass-through.
3. **Inheritance**. When a value/type is derived, metadata merges with last-write-wins. Unset keys are inherited.

### Reserved metadata keys

The language core only assigns semantic meaning to:

| Key | Meaning |
|---|---|
| `default` | Fallback value when type mismatch / error |

All other keys are unrestricted. Hosts may register typed schemas for them via the host API:

```ts
// Pseudo-host API
const Label = defineMetadata<string>('label')
const Color = defineMetadata<`#${string}`>('color')
```

### Default fallback timing

`default` is substituted in any of these situations:

- Function application: a type-mismatched argument is replaced with the parameter type's default before the body runs.
- Cast: `(T v)` returns `T`'s default when `v` does not validate as `T`.
- Any evaluation: a runtime error in a context expecting type `T` is replaced by `T`'s default.
- Static-time: when the type checker proves an expression will fail, the substitution happens at compile time, without waiting for runtime.

This means **evaluation never throws** at the language level. Errors and warnings are surfaced via a parallel diagnostics channel (see [Diagnostics](#diagnostics-tbd)).

## Type inference

### Mandatory annotations

- Function parameter types: required.
- Function return type: required.

### Inferred

- Local bindings in a let-block.
- Sub-expression types within a function body.
- Generic type parameters at call sites.

```glisp
(=> <T> (xs: (Vector T) i: Number): T (xs i))

;; at the call site:
((=> <T> (xs: (Vector T) i: Number): T (xs i)) [1 2 3] 0)
;; T is inferred from the argument type as Number; result type is Number.
```

### Algorithm

To be specified. Given the no-subtyping decision and mandatory function signatures, a Hindley-Milner-style unification algorithm applies straightforwardly. Generics are inferred at call sites.

## Diagnostics (TBD)

Evaluation never throws. Errors, warnings, and info are produced as a parallel stream alongside the result value. The exact mechanism is undecided:

- Wrap every value in a `Boxed` value carrying its source `(expr, env)` and any diagnostics. (Robust, but every primitive is now wrapped.)
- Maintain a `WeakMap<Value, Diagnostics>` keyed by value identity. (Cheap, but primitives can't be keys.)
- Some hybrid: identity-mapped diagnostics for compound values, and a side-channel for primitive operations.

This must be settled together with the evaluation model (see `eval.md`, TBD).

## Host API surface (sketch)

```ts
parse(source: string): Expr
evaluate(expr: Expr, env: Env): { value: Value; diagnostics: Diagnostics }
infer(expr: Expr, env: Env): { type: Type; diagnostics: Diagnostics }
cast<T>(type: Type, value: unknown): Value
```

`cast` is the host equivalent of in-language `(T v)`. With a TS-side metadata schema registry, the return type can be narrowed to a typed JS value.

## Open questions (TBD)

- Whether to revisit the no-subtyping decision with a "types as sets of values" model. This would allow union types (`(or T1 T2)`), literal types (`42 : 42 : Number`), and unify with `Enum`. Cost: bidirectional type checking, more complex inference.
- `Unit` vs empty `()`: are they truly identical or is `Unit` a distinct type with `()` as its sole value?
- Recursive type definitions and how naming/equality interacts.
- Whether function types carry their own metadata (e.g. for purity/effect annotations).
- TypeScript-side type derivation: how rich a TS type can be derived from a Glisp `Type` value (e.g. `(Vector (Enum "a" "b"))` → `("a" | "b")[]`).
