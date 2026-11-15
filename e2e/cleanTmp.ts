import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Runs right before the test's server starts (playwright.config.ts): every run begins with no
// projects, no queued renders and no videos, so it cannot pass on leftovers. A global setup
// would come too late, Playwright starts its web servers first.
const tmp = resolve(import.meta.dirname, '.tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// The example trip, for the README screenshots (tests/screenshots.spec.ts).
cpSync(
  resolve(import.meta.dirname, '../examples/portugal-2026'),
  resolve(tmp, 'data/projects/portugal-2026'),
  { recursive: true },
);
