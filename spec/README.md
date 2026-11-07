# Glisp Specification

## Documents

- [`syntax.md`](./syntax.md) — Concrete syntax: tokens, structure (`()`, `[]`, `{}`), functions, metadata `^{...}`, `~`.
- [`types.md`](./types.md) — Type system: values-as-types, subtyping, type constructors, metadata semantics, coercion, inference.
- [`eval.md`](./eval.md) — Evaluation model: scopes, name resolution, lazy semantics, the abstraction ladder, incremental evaluation, diagnostics.
- [`host-api.md`](./host-api.md) — Host API: `Runtime`, `Session`, host functions, AST builders, checking.

## Core premise

Glisp is designed to move freely between several modes of use:

- **Structural GUI editing** (Scratch-like): the AST is exposed as visual blocks; the user edits structurally.
- **Direct manipulation** (canvas-like): the AST is hidden; the user manipulates the result on a viewport, and the AST is updated underneath via bidirectional evaluation.
- **Textual programming** (classical source editing): the user types code in a text editor.
- **Description files** (config / project / document): a Glisp program is also a serializable, declarative file that an application can read and write. It can start as pure static data and be progressively enhanced with bindings, cross-references, and macros — gaining programmability, modularity, and DRY without giving up declarative readability.

The same language must serve all of these. The implication: the **syntax and sugar are kept minimal**, because mode-to-mode round-tripping breaks if any one mode introduces forms the others cannot represent.

Most of the design choices below follow from this. The language core itself contains no UI, IDE, or graphics features — those belong to host applications — but the language is shaped throughout by the assumption that hosts span this full range of use modes.

## Derived principles

These follow from the GUI-primary premise:

1. **CST, not AST**. The parse tree retains delimiters' trivia (whitespace, comments) so that GUI edits can be serialized back without losing formatting.
2. **Abstraction ladder**. Every expression has progressively-more-evaluated forms with the same final value. `expand` walks one step down the ladder; `eval` jumps to the bottom. Hosts can show any rung.
3. **Path-based cross-reference**. `./name`, `../key:` address AST positions structurally, by the names written with `=` and by keys, so the GUI can wire nodes together without inventing names.
4. **Evaluation never throws**. Failures produce `()`, which is coerced to the slot type's `default` at typed boundaries. The GUI always has a value to display.
5. **Diagnostics as a side channel**. Errors and warnings are accumulated on each evaluation node, with `(message, source)` structure, queryable by the host without disrupting evaluation.
6. **Static name resolution**. Names and paths can be resolved without running the program, so the GUI can show types and references.
7. **Incremental evaluation**. A result is cached on what a node refers to, so an edit recomputes what depends on it, and everything else stays `===`. See [eval.md](./eval.md#incremental-evaluation).
8. **Values are callable**. Function → apply, vector → index, record → field. Types are the exception: coercion is written `^T v`. The GUI exposes one uniform "feed something in" affordance per node.
9. **Metadata as a separate value-layer**. `^{...}` carries `default`, `label`, `color`, `icon`, `doc`, etc. The core only assigns meaning to `default`; the rest is for hosts.
10. **Authored abstraction steps**. A function's body is its next rung on the ladder, and `~` keeps implementation details off it. `~` is transparent in `eval`, so the host can climb the ladder while the runtime gets the final value.

## Foundational language choices

These align with the premise but are also independent design decisions:

- Pure functional, lazy, strongly typed with static inference. Evaluation changes nothing; editing a program means producing a new AST.
- S-expression syntax (parser simplicity, portability, no dedicated keywords).
- Types are first-class values.
- Types are sets of values, with structural subtyping.
- Mandatory function signatures, inferred bodies.
- Identifiers may use any Unicode letter or symbol.
- Language core only — no UI, IDE, or graphics features in the language itself.
