import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../fs/writeFileAtomic';

export interface FileCacheOptions {
  dir: string;
  /** How long an entry stays valid. */
  ttlMs: number;
  now?: () => Date;
}

export interface FileCache<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
}

interface Entry<T> {
  savedAt: string;
  value: T;
}

/**
 * One JSON file per key, named by the key's SHA-256 (ARCHITEKTUR: "Persistenz"). Enough for
 * the few thousand searches a person makes; a database only once that is not enough.
 * A missing, expired or unreadable entry simply counts as not cached.
 */
export function createFileCache<T>({
  dir,
  ttlMs,
  now = () => new Date(),
}: FileCacheOptions): FileCache<T> {
  const fileFor = (key: string) =>
    join(dir, `${createHash('sha256').update(key).digest('hex')}.json`);

  return {
    async get(key) {
      try {
        const entry = JSON.parse(await readFile(fileFor(key), 'utf8')) as Entry<T>;
        const age = now().getTime() - new Date(entry.savedAt).getTime();
        return age >= 0 && age < ttlMs ? entry.value : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      await mkdir(dir, { recursive: true });
      const entry: Entry<T> = { savedAt: now().toISOString(), value };
      await writeFileAtomic(fileFor(key), JSON.stringify(entry));
    },
  };
}
