# Glisp

A pure functional, S-expression based programming language with strong static typing, type inference, lazy evaluation, and DAG-based execution semantics.

This branch (`lang-2026`) is a clean redesign focused on the language core only — no UI, no editor integration, no domain-specific (graphics) features. Specification is being drafted from scratch.

## Status

Specification in design. Core in active implementation under `src/`.

## Try it

- **Terminal REPL**: `npm install && npm run repl`
- **Browser REPL**: see [`playground/`](./playground/) — Vite + Vue 3.
  Live demo deploys from `main` / `lang-2026` to GitHub Pages
  (workflow in [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)).

## License

MIT — see [LICENSE](./LICENSE).
