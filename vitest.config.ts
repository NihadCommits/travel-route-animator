import { defineConfig } from 'vitest/config';

// The data model and inheritance are what every other part relies on, so they must stay
// almost fully tested. The run fails if they drop below these numbers.
const CORE_THRESHOLD = { lines: 90, functions: 90, branches: 90, statements: 90 };

// One Vitest run for the whole monorepo. Tests live next to the code as *.test.ts.
// Split into per-package projects once a package needs its own environment (e.g. jsdom for the editor).
export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'packages/core/src/testing/**'],
      reporter: ['text', 'html'],
      thresholds: {
        'packages/core/src/model/**': CORE_THRESHOLD,
        'packages/core/src/resolve/**': CORE_THRESHOLD,
      },
    },
  },
});
