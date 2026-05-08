# Glisp Specification

## Documents

- [`syntax.md`](./syntax.md) — Concrete syntax: tokens, structure (`()`, `[]`, `{}`), functions, metadata `^{...}`, quoting.
- [`types.md`](./types.md) — Type system: values-as-types, type constructors, metadata semantics, cast, inference.
- [`eval.md`](./eval.md) — Evaluation model: scopes, name resolution, lazy semantics, DAG, diagnostics.

## Core premise

Glisp's primary host is a visual / GUI editor in which users edit the AST directly without reading source text. Most of the design choices below are consequences of taking this premise seriously: the language should never produce a state in which the GUI cannot show *something*, the user should not have to invent names just to share intermediate values, edits should preserve formatting and trivia, and the host should be able to show and reason at any depth of evaluation.

The language core itself does not include UI, IDE, or graphics features — those belong to host applications — but the language is shaped throughout by the assumption that such a host exists.

## Derived principles

These follow from the GUI-primary premise:

1. **CST, not AST**. The parse tree retains delimiters' trivia (whitespace, comments) so that GUI edits can be serialized back without losing formatting.
2. **Abstraction ladder**. Every expression has progressively-more-evaluated forms with the same final value. `expand` walks one step down the ladder; `eval` jumps to the bottom. Hosts can show any rung.
3. **Path-based cross-reference**. `./key`, `../key` address arbitrary AST positions structurally, so the GUI can wire nodes together without inventing names.
4. **Evaluation never throws**. Failures produce `()`, which is coerced to the slot type's `default` at typed boundaries. The GUI always has a value to display.
5. **Diagnostics as a side channel**. Errors and warnings are accumulated on each evaluation node, with `(message, source)` structure, queryable by the host without disrupting evaluation.
6. **Static name resolution**. Names and paths can be resolved without running the program, so the GUI can show types and references.
7. **DAG with memoization**. Shared sub-computations form a graph; memoization keyed on `(AST, env)` makes sharing explicit and supports incremental re-evaluation when one node changes.
8. **All values are callable**. Function → apply, type → cast, vector → index, record → field. The GUI exposes one uniform "feed something in" affordance per node.
9. **Metadata as a separate value-layer**. `^{...}` carries `default`, `label`, `color`, `icon`, `doc`, etc. The core only assigns meaning to `default`; the rest is for hosts.
10. **Code-as-data with macro transparency**. `` ` ``, `~`, `~@` shape the AST produced by `expand` but are transparent in `eval`. The host can climb the ladder; the runtime gets the final value.

## Foundational language choices

These align with the premise but are also independent design decisions:

- Pure functional, lazy, strongly typed with static inference.
- S-expression syntax (parser simplicity, portability, no dedicated keywords).
- Same-ADT for values and types — types are first-class values.
- No subtyping. Types are nominal/equality-based.
- Mandatory function signatures, inferred bodies.
- Language core only — no UI, IDE, or graphics features in the language itself.
