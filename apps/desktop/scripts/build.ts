/**
 * Builds what the Windows app runs, into apps/desktop/dist:
 *
 *   main.mjs, preload.cjs     the main process (with the whole server) and the preload
 *   resources/editor/         the editor, built by Vite
 *   resources/scene-bundle/   the scene, bundled by Remotion: the app never bundles itself
 *   resources/airports.json   the airport list (OurAirports, public domain)
 *
 * `pnpm app` runs the app from here; the installer (M7b, second part) packs the same files.
 */
import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleScene } from '@travel-route-animator/scene/render';
import { build } from 'esbuild';

const desktopDir = join(import.meta.dirname, '..');
const repoRoot = join(desktopDir, '../..');
const dist = join(desktopDir, 'dist');
const resources = join(dist, 'resources');

function step(title: string) {
  console.log(`\n▸ ${title}`);
}

/** Runs a fixed pnpm command; a shell, because pnpm is a .cmd script on Windows. */
function run(command: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(resources, { recursive: true });

step('Editor (Vite)');
run('pnpm --filter @travel-route-animator/editor build');
await cp(join(repoRoot, 'apps/editor/dist'), join(resources, 'editor'), { recursive: true });

step('Scene (Remotion bundle)');
await bundleScene({ outDir: join(resources, 'scene-bundle') });

step('Airport list');
// The one `pnpm data:airports` made in the repo, or a fresh download into a temporary folder.
const repoAirports = join(repoRoot, 'data/airports/airports.json');
if (await exists(repoAirports)) {
  await cp(repoAirports, join(resources, 'airports.json'));
} else {
  const dataDir = await mkdtemp(join(tmpdir(), 'tra-airports-'));
  run('pnpm data:airports', { DATA_DIR: dataDir });
  await cp(join(dataDir, 'airports/airports.json'), join(resources, 'airports.json'));
  await rm(dataDir, { recursive: true, force: true });
}

step('Example trip');
// Copied into the projects on the very first start, so there is something to open and render.
await cp(join(repoRoot, 'examples/portugal-2026'), join(resources, 'example'), { recursive: true });

step('Main process and preload (esbuild)');
const shared = {
  bundle: true,
  platform: 'node' as const,
  target: 'node24',
  sourcemap: 'linked' as const,
  logLevel: 'warning' as const,
};
await build({
  ...shared,
  entryPoints: [join(desktopDir, 'src/main.ts')],
  outfile: join(dist, 'main.mjs'),
  format: 'esm',
  // Electron is the runtime. Remotion's renderer finds its compositor next to itself and must
  // stay a real package; the bundler is only loaded where the app never goes (bundleScene).
  external: ['electron', '@remotion/renderer', '@remotion/bundler', '@remotion/compositor-*'],
  // Bundled CommonJS dependencies (Fastify and friends) call require(); ESM has none.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
await build({
  ...shared,
  entryPoints: [join(desktopDir, 'src/preload.ts')],
  outfile: join(dist, 'preload.cjs'),
  // A sandboxed preload must be a CommonJS script.
  format: 'cjs',
  external: ['electron'],
});

console.log(`\nDone: ${dist}`);
