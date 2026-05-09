# Glisp Playground

Browser REPL for the Glisp language core (`../src`). Vite + Vue 3, deployed
to GitHub Pages on push to `main` / `lang-2026`.

## Develop

```sh
cd playground
npm install
npm run dev
```

Opens at `http://localhost:5173`. The dev server imports `../src/*` directly,
so changes to the language core are picked up on the next reload.

## Build

```sh
npm run build
```

Outputs `dist/`. The `BASE_PATH` env var controls the site's base path
(`/glisp/` on GitHub Pages, `/` for a custom domain).

## Deploy

The CI workflow (`.github/workflows/deploy-pages.yml`) builds with
`BASE_PATH=/glisp/` and publishes via the `actions/deploy-pages` flow.
Trigger by pushing to `main` or `lang-2026`, or by running the workflow
manually from the Actions tab.
