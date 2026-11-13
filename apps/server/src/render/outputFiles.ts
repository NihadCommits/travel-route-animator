import { access, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Written by renderEtappe while a render runs (see partialPathOf in packages/scene): a video
// as <name>.partial.mp4 or .partial.mov, a PNG sequence as the folder <name>.partial.
const PARTIAL = /\.partial(\.(mp4|mov))?$/;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a new render goes: <dir>/<name><extension>, or <name>-2, -3 … if that exists or a
 * waiting job already claimed it. Never overwrites a finished render. The extension is empty
 * for a PNG sequence, which is a folder.
 */
export async function pickOutputPath(
  dir: string,
  name: string,
  extension: string,
  claimed: ReadonlySet<string>,
): Promise<string> {
  for (let n = 1; ; n += 1) {
    const path = join(dir, `${n === 1 ? name : `${name}-${n}`}${extension}`);
    if (!claimed.has(path) && !(await exists(path))) return path;
  }
}

/**
 * Removes renders that were still running when the server stopped (a restart by tsx watch, a
 * crash). Only what carries the partial mark, one folder deep, as the server writes it:
 * output/<project>/<name>.partial.mp4, .partial.mov or the folder <name>.partial. Returns
 * what it removed.
 */
export async function removePartialVideos(outputDir: string): Promise<string[]> {
  let projects;
  try {
    projects = await readdir(outputDir, { withFileTypes: true });
  } catch {
    return []; // No output folder yet: nothing rendered so far.
  }
  const removed: string[] = [];
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const dir = join(outputDir, project.name);
    for (const entry of await readdir(dir)) {
      if (!PARTIAL.test(entry)) continue;
      await rm(join(dir, entry), { recursive: true, force: true });
      removed.push(join(dir, entry));
    }
  }
  return removed;
}
