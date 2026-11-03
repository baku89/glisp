import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--expose-gc'] } },
  },
})
