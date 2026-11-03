import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--expose-gc'] } },
  },
})
