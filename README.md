# Glisp

A pure functional, S-expression based language with lazy evaluation, static type inference, and incremental evaluation, made to be embedded in creative software.

This branch (`lang-2026`) is a redesign focused on the language.

## Layout

- `packages/lang`: the language (`@glisp/lang`). No dependencies.
- `packages/repl`: the terminal REPL.
- `site`: the website, with the guide and the browser REPL.
- `spec`: the specification.

## Try it

```sh
npm install
npm run repl   # terminal REPL
npm run dev    # website, with the browser REPL
npm test
```

## License

MIT. See [LICENSE](./LICENSE).
