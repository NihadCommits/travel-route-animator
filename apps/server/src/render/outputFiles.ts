import { access, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const VIDEO_EXTENSION = '.mp4';
// Written by renderEtappe while a video is rendered (see partialPathOf in packages/scene).
const PARTIAL_SUFFIX = `.partial${VIDEO_EXTENSION}`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a new video goes: <dir>/<name>.mp4, or <name>-2.mp4, -3 … if that file exists or a
 * waiting job already claimed it. Never overwrites a finished video.
 */
export async function pickOutputPath(
  dir: string,
  name: string,
  claimed: ReadonlySet<string>,
): Promise<string> {
  for (let n = 1; ; n += 1) {
    const path = join(dir, `${n === 1 ? name : `${name}-${n}`}${VIDEO_EXTENSION}`);
    if (!claimed.has(path) && !(await exists(path))) return path;
  }
}

/**
 * Removes videos that were still being rendered when the server stopped (a restart by
 * tsx watch, a crash). Only files with the partial suffix, one folder deep, as the server
 * writes them: output/<project>/<name>.partial.mp4. Returns what it removed.
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
    for (const file of await readdir(dir)) {
      if (!file.endsWith(PARTIAL_SUFFIX)) continue;
      await rm(join(dir, file), { force: true });
      removed.push(join(dir, file));
    }
  }
  return removed;
}
