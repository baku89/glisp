import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const source = (name: string) =>
  fileURLToPath(new URL(`dev_modules/${name}/src$1`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^pave(\/.*)?$/, replacement: source('pave') },
      { find: /^geome(\/.*)?$/, replacement: source('geome') },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'site/*/src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--expose-gc'] } },
  },
})
