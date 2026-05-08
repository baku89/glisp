# Glisp Specification

## Documents

- [`syntax.md`](./syntax.md) — Concrete syntax: tokens, structure (`()`, `[]`, `{}`), functions, metadata `^{...}`, quoting.
- [`types.md`](./types.md) — Type system: values-as-types, type constructors, metadata semantics, cast, inference.

## Design pillars

1. Pure functional, S-expression, lazy, strongly typed with static inference.
2. Same-ADT for values and types: types are first-class values.
3. No subtyping. Types are nominal/equality-based.
4. Mandatory function signatures, inferred bodies.
5. Metadata as a separate value-layer, attached via `^{...}` prefix. Only `default` has language-core semantic meaning; other keys are host-defined.
6. Evaluation never throws. Failures fall back to the expected type's `default`. Errors flow on a parallel diagnostics channel.
7. All values are callable: function → apply, type → cast, vector → index, record → field, others → fallback.
8. Code-as-data. Backquote produces syntax-tree values; `~`/`~@` for splicing.
9. Language core only. No UI, IDE, or graphics features.
