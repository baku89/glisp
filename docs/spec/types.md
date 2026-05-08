# Glisp Type System

## Same-ADT model

Values and types share a single ADT. A type is itself a value of the language. There is no separate type-expression language layered on top of values.

```
Value ::=
    | number n
    | string s
    | boolean b
    | unit
    | vector [Value]
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
(vector number)  ==  (vector number)
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
| `Top` (`_`) | Any value |
| `Bottom` (`!`) | No value |

### Naming convention

Built-in primitive type names are **lowercase**: `number`, `string`, `boolean`, `unit`, `vector`, `enum`. Host-imported types and user-defined types are conventionally **uppercase-initial**: `Date`, `URL`, `JoinType`, `Point`. The convention is not enforced (identifier syntax allows either case) but signals the type's origin at a glance.

## Type constructors

A type constructor is a value that, when applied to one or more arguments, produces a new type.

| Form | Description |
|---|---|
| `(vector T)` | vectors of `T` |
| `(=> (a: T1 b: T2 ...): R)` | Function type (parameter names are required syntactically; not part of identity) |
| `(enum v1 v2 ...)` | enumeration of literal values (all of the same type) |
| `(refine T pred)` | refinement: subset of `T` satisfying `pred: (=> (v: T): boolean)` |

`enum` is the mechanism for finite sets of literal values. Members must share a single base type; validation at cast time is membership in the value set.

`refine` is the mechanism for value-restricted subtypes — a base type narrowed by a predicate. The cast `(refine T pred)(v)` first casts `v` to `T`; if that succeeds, `pred(v)` is called; if `pred` returns true, the value is accepted, otherwise the standard default fallback applies.

```glisp
ColorCode = (refine string (=> (s: string): boolean
                              (and (= (size s) 7)
                                   (= (s 0) "#"))))

(ColorCode "#FF0000")    ;; → "#FF0000"
(ColorCode "hello")      ;; → default fallback (size mismatch)

NonNegative = (refine number (=> (n: number): boolean (>= n 0)))
```

`refine` does not introduce subtyping. A `ColorCode` value is a distinct type from `string`; passing it where `string` is expected requires an explicit cast `(string c)` (which trivially succeeds since the underlying representation is the same). `enum` could in principle be expressed as a special-cased `refine`, but is kept as its own constructor for readability of the common literal-set case.

## Recursive types

Recursive type definitions use named bindings in a let-block. Glisp's let-bindings are self-referential — a binding's right-hand side may reference the binding's own name — so:

```glisp
{
  Tree = (record value: number children: (vector Tree))
  ...
}
```

defines a recursive type. There is no anonymous recursive-type form (`(rec X ...)`); naming the type via let is the recommended pattern.

## Types are callable: cast

A type value, when applied to a single argument, casts/validates the argument:

```glisp
(number 42)                 ;; → 42
(number "hello")            ;; → default fallback
((vector number) [1 2 3])   ;; → [1 2 3]
(JoinType "round")          ;; → "round"   (JoinType = (enum "round" "butt" "square"))
(JoinType "diamond")        ;; → default fallback
```

The host's `cast(t, v)` is a thin wrapper that calls the type value.

### Constant-function lifting

When the target of a cast is a function type `(=> (...): R)` and the input `v` is **not** a function, the cast tries to interpret `v` as the return value of a constant function:

- If `v` casts to `R`, the result is a constant function `(=> (...): R v)` — calling it ignores its arguments and returns `v`.
- Otherwise, the standard default fallback applies.

```glisp
(map 20 [1 2 3])         ;; → [20 20 20]   (20 lifted to (=> (x: number): number 20))
(filter true [1 2 3])    ;; → [1 2 3]      (true lifted to a constant true predicate)
(map "n/a" [1 2 3])      ;; → ["n/a" "n/a" "n/a"]
```

Lifting only happens at cast time, in slots that expect a function type. Outside cast contexts a value's identity is unchanged. This rule complements the ban on zero-parameter functions: instead of writing `(=> (): T body)` (which is a syntax error), pass `body` directly wherever a function is expected.

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
(=> (T) (xs: (vector T) i: number): T (xs i))

((=> (T) (xs: (vector T) i: number): T (xs i)) [1 2 3] 0)
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
