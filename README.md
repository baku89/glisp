# Glisp

A pure functional, S-expression based language with lazy evaluation, static type inference, and incremental evaluation, made to be embedded in creative software.

## Layout

- `packages/lang`: the language (`@glisp/lang`). No dependencies.
- `packages/repl`: the terminal REPL.
- `packages/tweeq`: edit an AST directly through [Tweeq](https://github.com/baku89/tweeq) widgets.
- `site`: the website, with the guide and the browser REPL.
- `spec`: the specification.

## Try it

```sh
git submodule update --init
npm install
npm run repl   # terminal REPL
npm run dev    # website, with the browser REPL
npm test
```

## License

MIT. See [LICENSE](./LICENSE).
