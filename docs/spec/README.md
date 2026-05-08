# Glisp Specification

This directory holds the working specification for the Glisp language redesign on the `lang-2026` branch.

The spec is **drafted incrementally** alongside design discussion. Sections marked TBD are open questions.

## Documents

- [`syntax.md`](./syntax.md) — Concrete syntax: tokens, structure (`()`, `[]`, `{}`), functions, metadata `^{...}`, quoting.
- [`types.md`](./types.md) — Type system: values-as-types, type constructors, metadata semantics, cast, inference.
- `eval.md` — Evaluation model (TBD): DAG, lazy, partial, incremental, bidirectional. Diagnostics mechanism.
- `host-api.md` — TS/JS host API (TBD): `parse`, `evaluate`, `infer`, `cast`, metadata schema registration.
- `stdlib.md` — Core standard library (TBD): arithmetic, comparison, vector, record operations.

## Design pillars (current consensus)

1. **Pure functional, S-expression, lazy, strongly typed** with static inference.
2. **Same-ADT for values and types**: types are first-class values.
3. **No subtyping**: types are nominal/equality-based. (Open: "types as sets" alternative.)
4. **Mandatory function signatures, inferred bodies**.
5. **Metadata as a separate value-layer**, attached via `^{...}` prefix. Only `default` has language-core semantic meaning; others are host-defined.
6. **Evaluation never throws**: failures fall back to the expected type's `default`. Errors flow on a parallel diagnostics channel.
7. **All values are callable**: function → apply, type → cast, vector → index, record → field, others → fallback.
8. **Code-as-data**: backquote produces syntax-tree values; `~`/`~@` for splicing.
9. **No UI / IDE / graphics features in core**. Hosts add those layers.

## Out of scope on this branch

- The previous Vue/Electron Glisp app (UI, drawing, project files).
- Domain-specific literals (angle, color, rational) and graphic primitives.
- Editor integrations.
