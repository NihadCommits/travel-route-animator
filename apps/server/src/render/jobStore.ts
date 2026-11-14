import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderJob } from '@travel-route-animator/core';
import type { StageProps } from '@travel-route-animator/scene/render';
import { writeFileAtomic } from '../fs/writeFileAtomic';

// The render queue on disk (M13), so that a restart of the server (tsx watch, a crash, the
// Windows app closed with jobs waiting) does not lose the jobs. One file per job: writing
// one job never touches the others, and a broken file costs only its own job.

/** A job as stored: unfinished ones with everything needed to render them again. */
export interface StoredJob {
  job: RenderJob;
  /** Missing for finished jobs: the list only shows them, nothing renders them again. */
  props?: StageProps;
}

export interface JobStore {
  /** Every stored job, oldest first. */
  load(): Promise<StoredJob[]>;
  save(stored: StoredJob): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Keeps nothing: tests, and a queue that should forget on restart. */
export const memoryJobStore: JobStore = {
  load: () => Promise.resolve([]),
  save: () => Promise.resolve(),
  remove: () => Promise.resolve(),
};

// Job IDs are UUIDs from the queue; anything else is not a file this store wrote.
const SAFE_ID = /^[\w-]{1,100}$/;

export function createFileJobStore(dir: string, warn: (message: string) => void): JobStore {
  const fileOf = (id: string) => {
    if (!SAFE_ID.test(id)) throw new Error(`Not a render job ID: ${id}`);
    return join(dir, `${id}.json`);
  };
  return {
    async load() {
      let files: string[];
      try {
        files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
      } catch {
        return [];
      }
      const jobs: StoredJob[] = [];
      for (const file of files) {
        try {
          const stored = JSON.parse(await readFile(join(dir, file), 'utf8')) as StoredJob;
          if (typeof stored.job?.id !== 'string') throw new Error('no job in it');
          jobs.push(stored);
        } catch (error) {
          warn(`Skipping the stored render job ${file}: ${String(error)}`);
        }
      }
      return jobs.sort((a, b) => a.job.createdAt.localeCompare(b.job.createdAt));
    },
    async save(stored) {
      await mkdir(dir, { recursive: true });
      await writeFileAtomic(fileOf(stored.job.id), JSON.stringify(stored));
    },
    async remove(id) {
      await rm(fileOf(id), { force: true });
    },
  };
}
