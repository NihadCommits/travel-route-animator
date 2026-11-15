import { join } from 'node:path';

// Where the Windows app keeps and finds things. Pure, so it can be tested without Electron;
// main.ts passes in what Electron knows (app.getPath, process.resourcesPath, app.isPackaged).

export interface PathInputs {
  /** app.isPackaged: installed app, or started from the build with `pnpm app`. */
  isPackaged: boolean;
  /** process.resourcesPath: the installed app's resources folder. */
  resourcesPath: string;
  /** Where main.mjs lives (dist/ in both cases). */
  mainDir: string;
  /** app.getPath('userData'): %APPDATA%\Routen-Animator */
  userData: string;
  /** app.getPath('videos'): the user's Videos folder */
  videos: string;
}

export interface AppPaths {
  /** Projects, caches and the airport list, like data/ in the repo. */
  dataDir: string;
  /** Where videos go unless the settings say otherwise. */
  defaultOutputDir: string;
  settingsFile: string;
  logFile: string;
  /** Made while building the app (scripts/build.ts) and shipped with it. */
  editorDir: string;
  sceneBundleDir: string;
  airportsFile: string;
  /** The example trip, a project folder copied in on the very first start. */
  exampleDir: string;
  /**
   * The Chrome Headless Shell and Remotion's compositor shipped with the installed app.
   * Undefined when started from the build: Remotion then uses its own from node_modules.
   */
  browserExecutable: string | undefined;
  binariesDirectory: string | undefined;
}

/** Remotion's compositor for 64-bit Windows, which also brings ffmpeg. */
export const COMPOSITOR_PACKAGE = '@remotion/compositor-win32-x64-msvc';

export function appPaths({
  isPackaged,
  resourcesPath,
  mainDir,
  userData,
  videos,
}: PathInputs): AppPaths {
  // The build puts its resources next to main.mjs; the installer copies them to resources/.
  const resources = isPackaged ? resourcesPath : join(mainDir, 'resources');
  // Programs cannot run from inside app.asar; the installer unpacks them next to it.
  const unpacked = join(resourcesPath, 'app.asar.unpacked');
  return {
    dataDir: join(userData, 'data'),
    defaultOutputDir: join(videos, 'Routen-Animator'),
    settingsFile: join(userData, 'settings.json'),
    logFile: join(userData, 'logs', 'server.log'),
    editorDir: join(resources, 'editor'),
    sceneBundleDir: join(resources, 'scene-bundle'),
    airportsFile: join(resources, 'airports.json'),
    exampleDir: join(resources, 'example'),
    browserExecutable: isPackaged
      ? join(
          unpacked,
          'dist',
          'remotion-browser',
          'win64',
          'chrome-headless-shell-win64',
          'chrome-headless-shell.exe',
        )
      : undefined,
    binariesDirectory: isPackaged ? join(unpacked, 'node_modules', COMPOSITOR_PACKAGE) : undefined,
  };
}
