import { defineConfig } from 'vitest/config';

// One Vitest run for the whole monorepo. Tests live next to the code as *.test.ts.
// Split into per-package projects once a package needs its own environment (e.g. jsdom for the editor).
export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
});
