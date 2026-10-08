import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pin NODE_ENV for this package's test run. The root vitest.config.ts is
    // NOT used when CI runs `pnpm --filter @energy-dex/api test`, so the guard
    // must live here to keep NODE_ENV=test regardless of the caller's shell.
    env: {
      NODE_ENV: 'test',
    },
  },
});
