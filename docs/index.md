---
home: true
heroImage: /logo.svg
heroHeight: 160
actions:
  - text: Guide →
    link: /guide

features:
  - title: Hosted, not standalone
    details: Glisp lives inside its host language (TypeScript today). No new VM to ship. The host provides the runtime, the I/O, and the typed bindings; Glisp glues them into a small programmable surface.
  - title: For creative software
    details: Built to script design tools, motion editors, and generative pipelines. The same project file can be edited as code, as visual blocks, or by direct manipulation on a canvas, without the editing modes fighting each other.
  - title: Failure flows into ()
    details: Evaluation never throws. Anything that fails (a missing name, a type mismatch, an arity error) yields the unit value (), which typed slots silently coerce to their declared default. The host always has something to draw.
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

Glisp is a small language designed to live inside creative software. Its predecessor explored "a Lisp-based design tool bridging graphic design and computational arts." This branch is the language carved out as a clean, embeddable core, ready to be reused by other tools that want to mix direct manipulation with code.

The design target is a tool where **the same project file** can be:

- structurally edited as visual blocks (Scratch-like),
- direct-manipulated on a canvas (Photoshop-like, with the AST mutated underneath),
- typed as plain code in a text editor,
- and serialized as a static configuration file that just happens to be programmable.

Most language design decisions follow from that target.

```glisp
;; A Glisp host might bind canvas primitives like this:
(def "circle"
  (=> (cx: number cy: number r: number): Shape ...))

;; The user's project file then mixes static data and computed values
{
  size = 200
  half = (/ size 2 %)
  ^{label: "background"}
  bg   = (rect 0 0 size size)

  ^{color: "#ff7b72" label: "dot"}
  dot  = (circle half half (* 0.2 size %))

  [bg dot]
}

;; A GUI editor can mutate `size` directly via a slider. The AST stays
;; canonical, comments and metadata round-trip, and the file is still a
;; valid Glisp program a programmer could open in vim.
```

## Why a Lisp?

Creative tools want code, blocks, and direct manipulation to be **views of the same artifact**, not separate modes that fight each other. Code-as-data is the cheapest way to get there. The AST is the data the host already needs to draw the GUI, so a block editor and a textual editor can edit the same tree without translation.

S-expressions also keep parsing trivial, which matters when the host needs to embed an evaluator and ship it across browsers, plugins, and servers.

## Hosted on TypeScript

Glisp is a **guest language**. It does not have a runtime, a build system, or an I/O story of its own. The host application *is* the runtime: it loads Glisp source, evaluates it, calls into Glisp values from JavaScript, and exposes its own values back to Glisp through `def` / `extern` / typed bindings. A Glisp value is a JavaScript value plus a thin layer of brands and metadata.

The practical consequence is that adopting Glisp does not mean adopting a second VM. A TypeScript app integrates Glisp as a library, types flow naturally between the two sides, and the host stays in charge of effects and lifetimes.

## `()` is where failure goes

Glisp does not throw on user errors. Every failure path (a name that does not resolve, a path that runs off the end, a missing positional argument, a type mismatch) returns `()`, the unit value. `()` is a real Glisp value with a real type (`unit`), but it is treated specially at typed boundaries:

1. A typed slot that receives `()` substitutes the slot's declared default and continues evaluation.
2. Diagnostics about *why* `()` appeared accumulate on the side, attached to the offending source range.

This means a half-written program is still a working program. The canvas keeps rendering, sliders keep responding, the type panel keeps showing what the next slot expects. The user fixes the diagnostics at their own pace.

## Why these specific design choices?

Every core decision maps to a problem creative software hits:

- **CST that preserves trivia.** GUI edits and text edits round-trip; comments and formatting survive both.
- **`()` as the failure sink.** Mid-edit programs always have a value the canvas can render. Type mismatches accumulate as diagnostics, not exceptions.
- **Parametric `(IO T)` and structural function types.** Host effects can be typed precisely without forcing a Haskell-shaped type system on the user.
- **Path-based references (`./key`, `../arg`).** The GUI can wire nodes together by structural address, no name invention required.
- **`expand` / abstraction ladder.** A host can show *any* rung between source and result, so a designer can drill from a high-level macro down to its expansion in real time.
- **Static name resolution.** The GUI can show types and references without running the program first.

See the [Specification](./spec/README.md) for the full design rationale.

## Status

The language core is in active implementation under `src/`. The terminal REPL is usable today, and the [browser playground](./playground.md) ships from the same source. Host integration API is documented in [`host-api`](./spec/host-api.md).

## Where to look

- [`syntax`](./spec/syntax.md): concrete syntax. Tokens, structure, functions, metadata, quoting.
- [`types`](./spec/types.md): type system. Values-as-types, constructors, parametric IO, coercion via `@`.
- [`eval`](./spec/eval.md): evaluation. Scopes, lazy semantics, DAG, diagnostics, abstraction ladder.
- [`host-api`](./spec/host-api.md): embedding API. Marshaling, AST/type combinators, TS type inference.
