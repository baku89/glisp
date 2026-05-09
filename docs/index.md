---
home: true
heroImage: /logo.svg
heroHeight: 140
heroText: Glisp
tagline: A small functional language with S-expression syntax, structural types, and lazy evaluation.
actions:
  - text: Get Started →
    link: /guide
    type: primary
  - text: Try in browser
    link: /playground

features:
  - title: S-expression core
    details: A minimal parser and CST that round-trips verbatim. Code is data, data is code, GUI editing is structural.
  - title: Strong, structural types
    details: Type values are first-class. Function types, enums, refinements, and parametric types like (IO T) all compose through the same surface.
  - title: Lazy with diagnostics
    details: Failures never throw. Every node accumulates (message, source) diagnostics; type slots silently coerce to a default so the host always has a value.
---

<div class="badges" style="margin: 1.2em 0">
	<a href="https://github.com/baku89/glisp">
		<img src="https://img.shields.io/badge/source-github-blue?style=flat-square" alt="GitHub">
	</a>
	&nbsp;
	<a href="https://opensource.org/licenses/MIT">
		<img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT">
	</a>
</div>

Glisp is a pure-functional language built around S-expressions, with strong static typing, type inference, and lazy evaluation. The current branch (`lang-2026`) is a clean redesign focused on the language core only — no UI, no graphics features.

```glisp
;; Variadic arithmetic with structural type-driven defaults
(+ 1 2 3 4 5)        ;; → 15
(* 2 3 4)            ;; → 24

;; Function literal with explicit signature, inferred body
(def "double"
  (=> (n: number): number (* n 2)))

(double 7)           ;; → 14

;; Pattern match — silent fall-through, never throws
(? value
  number  "is a number"
  string  "is a string"
  _       "something else")

;; Coerce explicitly with `@`. Failure falls back to the type's default.
(@ number "not a number")   ;; → 0  (with diagnostic)
```

## Why another Lisp?

Glisp is designed to round-trip cleanly across very different editing modes — visual / structural editors, direct-manipulation canvases, plain text, and serialized configuration files. The core is intentionally small so every form has a single meaning regardless of where it shows up.

Concretely:

- The CST preserves whitespace and comments, so block-style GUI edits and textual edits round-trip without fighting each other.
- Evaluation never throws — every typed slot has a `default`, and mismatches surface as side-channel diagnostics rather than exceptions.
- Names and paths (`./key`, `../arg`) are statically resolvable, so a host can show types and references without running the program.
- Macros are one transparent `expand` step; `eval` jumps straight to the result. A host can show any rung of the abstraction ladder.

See the [Specification](/spec/) for the full design rationale.

## Status

Core language is in active implementation under `src/`. The terminal REPL is usable today and the [browser playground](/playground) ships from this same source.

## Modules

- [`syntax`](/spec/syntax) — concrete syntax: tokens, structure, functions, metadata, quoting.
- [`types`](/spec/types) — type system: values-as-types, constructors, parametric IO, coercion via `@`.
- [`eval`](/spec/eval) — evaluation: scopes, name resolution, lazy semantics, DAG, abstraction ladder.
- [`host-api`](/spec/host-api) — embedding API: marshaling, AST/type combinators, TS type inference.
