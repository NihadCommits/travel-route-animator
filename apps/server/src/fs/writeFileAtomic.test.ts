import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomic } from './writeFileAtomic';

function errorWithCode(code: string): Error {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

describe('writeFileAtomic', () => {
  let dir: string;
  let target: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tra-atomic-'));
    target = join(dir, 'project.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a new file', async () => {
    await writeFileAtomic(target, '{"v":1}');
    expect(await readFile(target, 'utf8')).toBe('{"v":1}');
  });

  it('replaces an existing file and leaves no temporary files behind', async () => {
    await writeFile(target, 'old');
    await writeFileAtomic(target, 'new');
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['project.json']);
  });

  it('keeps the old content intact when the write is aborted before the rename', async () => {
    await writeFile(target, 'old and complete');
    const crash = () => Promise.reject(new Error('process killed'));

    await expect(writeFileAtomic(target, 'new', { renameFile: crash })).rejects.toThrow(
      'process killed',
    );
    expect(await readFile(target, 'utf8')).toBe('old and complete');
    expect(await readdir(dir)).toEqual(['project.json']);
  });

  it('retries when Windows briefly locks the target', async () => {
    await writeFile(target, 'old');
    const { rename } = await import('node:fs/promises');
    let attempts = 0;
    const flakyRename = async (from: string, to: string) => {
      attempts++;
      if (attempts <= 2) throw errorWithCode('EPERM');
      await rename(from, to);
    };

    await writeFileAtomic(target, 'new', { renameFile: flakyRename, retryDelayMs: 1 });
    expect(attempts).toBe(3);
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('gives up after the last retry and keeps the old file', async () => {
    await writeFile(target, 'old');
    const alwaysBusy = () => Promise.reject(errorWithCode('EBUSY'));

    await expect(
      writeFileAtomic(target, 'new', { renameFile: alwaysBusy, retries: 2, retryDelayMs: 1 }),
    ).rejects.toThrow('EBUSY');
    expect(await readFile(target, 'utf8')).toBe('old');
    expect(await readdir(dir)).toEqual(['project.json']);
  });

  it('does not retry errors that will not go away', async () => {
    let attempts = 0;
    const missingDir = () => {
      attempts++;
      return Promise.reject(errorWithCode('ENOENT'));
    };
    await expect(writeFileAtomic(target, 'x', { renameFile: missingDir })).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});
