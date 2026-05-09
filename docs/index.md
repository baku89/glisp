---
home: true
heroImage: /logo.svg
heroHeight: 160
actions:
  - text: Guide →
    link: /guide

features:
  - title: Made to be embedded
    details: Built as a scripting layer for creative software (design tools, motion editors, generative pipelines). Hosts expose typed bindings; Glisp glues them.
  - title: Bidirectional by construction
    details: The CST round-trips with whitespace and comments. A GUI block-editor, a direct-manipulation canvas, and a text editor can all touch the same file without fighting each other.
  - title: Failure as data
    details: Evaluation never throws. Type slots silently fall back to defaults; mismatches surface as side-channel diagnostics. The host always has something to draw.
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

## Why these specific design choices?

Every core decision maps to a problem creative software hits:

- **CST that preserves trivia.** GUI edits and text edits round-trip; comments and formatting survive both.
- **Evaluation never throws.** Mid-edit programs always have a value the canvas can render. Type mismatches accumulate as diagnostics, not exceptions.
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
