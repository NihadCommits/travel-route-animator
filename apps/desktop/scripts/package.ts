/**
 * Packs the Windows app into an installer (M7b, second part):
 *
 *   1. scripts/build.ts makes dist/ (main process, editor, scene bundle, airport list).
 *   2. Chrome Headless Shell goes into dist/remotion-browser, so the installed app renders
 *      without a download of its own.
 *   3. electron-builder makes release/Routen-Animator Setup <version>.exe (NSIS) and
 *      release/win-unpacked/, the same app without installing it. It takes this package's
 *      runtime dependencies (Remotion's renderer and compositor) from pnpm's node_modules.
 *
 * Remotion's own programs cannot run from inside app.asar; they are unpacked next to it
 * (asarUnpack), where src/paths.ts looks for them.
 */
import { spawnSync } from 'node:child_process';
import { cp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureBrowser } from '@remotion/renderer';
import { Arch, build, Platform } from 'electron-builder';

const desktopDir = join(import.meta.dirname, '..');

function step(title: string) {
  console.log(`\n▸ ${title}`);
}

type PackageJson = { devDependencies: Record<string, string> };
const own = JSON.parse(await readFile(join(desktopDir, 'package.json'), 'utf8')) as PackageJson;

step('Build (scripts/build.ts)');
// A shell, because pnpm is a .cmd script on Windows.
const built = spawnSync('pnpm build', { cwd: desktopDir, stdio: 'inherit', shell: true });
if (built.status !== 0) throw new Error('pnpm build failed');

step('Chrome Headless Shell');
// Downloads once into node_modules/.remotion next to this package, then copies it in.
await ensureBrowser();
const browserDir = join(desktopDir, 'dist/remotion-browser/win64');
await rm(browserDir, { recursive: true, force: true });
await cp(join(desktopDir, 'node_modules/.remotion/chrome-headless-shell/win64'), browserDir, {
  recursive: true,
});

step('Installer (electron-builder)');
await build({
  projectDir: desktopDir,
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  config: {
    appId: 'io.github.nihadcommits.routen-animator',
    productName: 'Routen-Animator',
    copyright: 'NihadCommits, MIT License',
    electronVersion: own.devDependencies.electron!,
    directories: { output: 'release', buildResources: 'assets' },
    // Only what runs: everything else of the server and editor is in main.mjs already.
    files: ['package.json', 'dist/main.mjs', 'dist/preload.cjs', 'dist/remotion-browser/**'],
    npmRebuild: false,
    asar: true,
    asarUnpack: ['node_modules/@remotion/compositor-*/**', 'dist/remotion-browser/**'],
    // The scene bundle keeps its source maps: Remotion reads bundle.js.map while rendering
    // and fails without it.
    extraResources: [
      { from: 'dist/resources/editor', to: 'editor' },
      { from: 'dist/resources/scene-bundle', to: 'scene-bundle' },
      { from: 'dist/resources/airports.json', to: 'airports.json' },
      { from: 'dist/resources/example', to: 'example' },
    ],
    win: { icon: 'assets/icon.png' },
    nsis: {
      // A normal installer with a choice of folder, for this user only (no admin rights).
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Routen-Animator',
      // Projects and videos are the user's; uninstalling the app keeps them.
      deleteAppDataOnUninstall: false,
    },
  },
});

console.log(`\nDone: ${join(desktopDir, 'release')}`);
