import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileCache } from './fileCache';

describe('createFileCache', () => {
  let dir: string;
  let clock: Date;

  beforeEach(async () => {
    dir = join(await mkdtemp(join(tmpdir(), 'tra-cache-')), 'geocode');
    clock = new Date('2026-10-25T10:00:00.000Z');
  });
  afterEach(async () => {
    await rm(join(dir, '..'), { recursive: true, force: true });
  });

  const cache = () => createFileCache<string[]>({ dir, ttlMs: 60_000, now: () => clock });

  it('returns what was stored under the same key, also for a new instance', async () => {
    await cache().set('silves', ['Silves']);
    expect(await cache().get('silves')).toEqual(['Silves']);
    expect(await cache().get('faro')).toBeUndefined();
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('forgets entries once they are too old', async () => {
    await cache().set('silves', ['Silves']);
    clock = new Date(clock.getTime() + 60_000);
    expect(await cache().get('silves')).toBeUndefined();
  });

  it('treats a broken file as not cached', async () => {
    await cache().set('silves', ['Silves']);
    const [file] = await readdir(dir);
    await writeFile(join(dir, file!), '{ broken');
    expect(await cache().get('silves')).toBeUndefined();
  });
});
