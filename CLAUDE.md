# Glisp

A language made to be embedded in creative software: the same program is edited as code, as blocks, and through direct manipulation on a canvas.

## Where things are

- `spec/`: the specification, and what to read before changing behavior. `syntax.md`, `types.md`, `eval.md`, `host-api.md`.
- `packages/lang`: the language, `@glisp/lang`. No dependencies, and nothing about any UI.
- `packages/repl`: the terminal REPL. Logic in `core.ts`, `editor.ts`, `screen.ts`; `tui.ts` is the thin part that touches the terminal.
- `site`: the website, in English, with the guide and the browser REPL.

Hosts depend on `@glisp/lang`, and it depends on nothing. Keep it that way.

## Principles

These decide most questions. If a change seems to need breaking one, ask.

- **Evaluation changes nothing.** Not the AST, not any env. Editing means producing a new AST. An effect is an `IO` value that a host runs.
- **The environment is a let-block**, visible and editable, not hidden state. `prelude ← session ← project` are let-blocks in a chain.
- **Evaluation never throws on errors in the program.** A failure yields `()` with a diagnostic, and a typed slot turns `()` into the type's default, so there is always something to draw.
- **Syntax stays minimal.** Every form has to work in code, blocks, and direct manipulation alike. Reserved words are symbols where possible (`=>`, `?`, `|>`, `:`). There are no keyword literals (`:foo`).
- **Types are sets of values**, with structural subtyping. `_` on a value means "not known", so it fits any slot. Static analysis runs no value expression, only type expressions.
- **A function's body is its next rung on the abstraction ladder.** `~` marks what to work out within a step, so that helpers stay out of view. There is no quote form yet; `` ` `` is reserved for actions.
- **Results are cached on what a node refers to**, not on where it is (`freeRefs`, `Runtime`). Unchanged values stay `===` across edits.

## Working here

```sh
npm test            # vitest, with --expose-gc for the memory tests
npm run typecheck
npm run repl
npm run dev         # the website
npm run build
```

- Spec and implementation change together. `spec.test.ts` runs the marked examples in `spec/` and `site/guide.md`.
- Mark an example block with `<!-- test -->` above it when every `;; → value` in it should hold.
- The author writes the notes this design came from at baku89.com (`Glisp文法` and others). When they disagree with `spec/`, ask which one stands.
