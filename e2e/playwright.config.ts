import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// The main flow in a real browser, against a real server that really renders. Both run on
// ports of their own with data in e2e/.tmp, so `pnpm dev` and the projects in data/ stay
// untouched while the test runs.

const SERVER_PORT = 5184;
const EDITOR_PORT = 5183;
export const TMP_DIR = resolve(import.meta.dirname, '.tmp');
export const OUTPUT_DIR = resolve(TMP_DIR, 'output');

export default defineConfig({
  testDir: 'tests',
  // One render takes a while: the server bundles the scene first, then renders frame by frame.
  timeout: 5 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${EDITOR_PORT}`,
    // The browser that is already installed, so nothing needs downloading: Edge comes with
    // Windows, GitHub's Linux runners have Chrome. PLAYWRIGHT_CHANNEL picks another one.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome'),
    viewport: { width: 1600, height: 900 },
    locale: 'de-AT',
    // A missing button fails fast instead of waiting for the whole render timeout.
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'main', testIgnore: /screenshots/ },
    // `pnpm screenshots`: the editor pictures in the README, from the example trip.
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: [
    {
      name: 'server',
      command: 'node e2e/cleanTmp.ts && pnpm --filter @travel-route-animator/server start',
      url: `http://127.0.0.1:${SERVER_PORT}/api/health`,
      cwd: resolve(import.meta.dirname, '..'),
      env: {
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: resolve(TMP_DIR, 'data'),
        OUTPUT_DIR,
        // Bundle the scene while the test builds its project.
        RENDER_PREPARE_ON_START: 'true',
        ...(process.env.RENDER_GL && { RENDER_GL: process.env.RENDER_GL }),
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      name: 'editor',
      command: `pnpm --filter @travel-route-animator/editor exec vite --port ${EDITOR_PORT}`,
      url: `http://127.0.0.1:${EDITOR_PORT}`,
      cwd: resolve(import.meta.dirname, '..'),
      env: { API_PROXY_TARGET: `http://127.0.0.1:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
