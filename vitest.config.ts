import { defineConfig } from 'vitest/config'

// Isolated test config: the app's vite.config.ts pulls in the React plugin and
// the Rolldown bundler, which we don't need for pure-logic unit tests. Keeping
// a dedicated config makes `vitest` start fast and avoids loading those plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
