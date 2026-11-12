import { randomBytes } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export interface AtomicWriteOptions {
  /** Replaced in tests to simulate a crash or a locked file. */
  renameFile?: (from: string, to: string) => Promise<void>;
  retries?: number;
  retryDelayMs?: number;
}

const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * Writes `data` so that `path` always holds either the complete old or the complete new
 * content, never a half-written file: write a temporary file next to it, flush it to disk,
 * then rename it over the target. A rename within one directory is atomic on NTFS, ext4 and
 * APFS, so a crash at any point leaves a valid file behind.
 */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  { renameFile = rename, retries = 5, retryDelayMs = 50 }: AtomicWriteOptions = {},
): Promise<void> {
  const tempPath = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await open(tempPath, 'wx');
    try {
      await handle.writeFile(data, typeof data === 'string' ? 'utf8' : undefined);
      // Without fsync, a power cut right after the rename could leave an empty file behind.
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tempPath, path, renameFile, retries, retryDelayMs);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

// On Windows a virus scanner or the search indexer can hold the target for a moment, and the
// rename fails with EPERM or EBUSY. Waiting briefly and trying again is the usual remedy.
async function renameWithRetry(
  from: string,
  to: string,
  renameFile: (from: string, to: string) => Promise<void>,
  retries: number,
  retryDelayMs: number,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(from, to);
      return;
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      await new Promise((done) => setTimeout(done, retryDelayMs * 2 ** attempt));
    }
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && RETRYABLE_CODES.has(String(error.code));
}
