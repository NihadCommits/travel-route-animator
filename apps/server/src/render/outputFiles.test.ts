import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pickOutputPath, removePartialVideos } from './outputFiles';

let outputDir: string;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'tra-output-'));
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe('pickOutputPath', () => {
  it('takes the name as it is while it is free', async () => {
    const dir = join(outputDir, 'portugal-2026');
    expect(await pickOutputPath(dir, 'lissabon', '.mp4', new Set())).toBe(
      join(dir, 'lissabon.mp4'),
    );
    // A PNG sequence is a folder without extension.
    expect(await pickOutputPath(dir, 'lissabon', '', new Set())).toBe(join(dir, 'lissabon'));
  });

  it('never overwrites a video, nor one a waiting job will write', async () => {
    const dir = join(outputDir, 'portugal-2026');
    await mkdir(dir);
    await writeFile(join(dir, 'lissabon.mp4'), '');
    const claimed = new Set([join(dir, 'lissabon-2.mp4')]);
    expect(await pickOutputPath(dir, 'lissabon', '.mp4', claimed)).toBe(
      join(dir, 'lissabon-3.mp4'),
    );
    expect(await pickOutputPath(dir, 'lissabon', '.mov', claimed)).toBe(join(dir, 'lissabon.mov'));
  });
});

describe('removePartialVideos', () => {
  it('removes unfinished renders and nothing else', async () => {
    const dir = join(outputDir, 'portugal-2026');
    await mkdir(dir);
    for (const file of ['fertig.mp4', 'halb.partial.mp4', 'halb.partial.mov', 'notizen.txt']) {
      await writeFile(join(dir, file), '');
    }
    await mkdir(join(dir, 'bilder.partial'));
    await writeFile(join(dir, 'bilder.partial', 'bilder_0000.png'), '');
    await mkdir(join(dir, 'fertige-bilder'));
    expect((await removePartialVideos(outputDir)).sort()).toEqual(
      [
        join(dir, 'bilder.partial'),
        join(dir, 'halb.partial.mov'),
        join(dir, 'halb.partial.mp4'),
      ].sort(),
    );
    expect((await readdir(dir)).sort()).toEqual(['fertig.mp4', 'fertige-bilder', 'notizen.txt']);
  });

  it('is fine without an output folder', async () => {
    expect(await removePartialVideos(join(outputDir, 'missing'))).toEqual([]);
  });
});
