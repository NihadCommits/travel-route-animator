import { randomUUID } from 'node:crypto';
import {
  isRenderJobFinished,
  outputExtensionOf,
  type OutputSettings,
  type OverlayStyle,
  type Project,
  type RenderJob,
  type Theme,
} from '@travel-route-animator/core';
import type { StageProps } from '@travel-route-animator/scene/render';
import { memoryJobStore, type JobStore } from './jobStore';
import { pickOutputPath } from './outputFiles';
import type { StageRenderer } from './renderer';

export interface RenderQueueOptions {
  renderer: StageRenderer;
  now?: () => Date;
  createId?: () => string;
  /** Progress reaches listeners at most this often; state changes always go out at once. */
  progressIntervalMs?: number;
  /** Finished jobs kept in the list; the oldest go first. */
  keepFinished?: number;
  /** Where jobs outlive a restart (jobStore.ts); in memory only without one. */
  store?: JobStore;
  /** Where a failed write of the stored queue is reported. */
  warn?: (message: string) => void;
}

export interface NewRenderJob {
  project: Project;
  etappe: { id: string; name: string };
  /** The dialog's overrides, as the composition gets them. */
  overrides: Partial<OutputSettings>;
  /** The settings that come out of them, for the list. */
  output: OutputSettings;
  /** The folder and the cleaned file name; the queue picks a free file in it. */
  dir: string;
  name: string;
  /** Several stages as one video (ADR 0011); `etappe` then names the whole of it. */
  etappeIds?: string[];
  /** The stage's images as data: URLs, by asset ID (ADR 0009). */
  assetUrls?: Record<string, string>;
  /** The own theme the stage's style names (ADR 0010). */
  themes?: Record<string, Theme>;
  /** The own overlay styles the stages name (M17). */
  overlayStyles?: OverlayStyle[];
  /** This server, for satellite tiles. */
  serverUrl?: string;
  /** Also write where each vehicle is in every frame (M13). */
  motionData?: boolean;
}

interface Entry {
  job: RenderJob;
  /** Missing only for finished jobs restored from the store. */
  props: StageProps | undefined;
  abort: AbortController;
  lastPublished: number;
}

/**
 * Render jobs, one at a time (WebGL maps want the whole GPU, ARCHITEKTUR: Render-Pipeline).
 * With a store they outlive a restart (M13): waiting jobs wait on, and a job that was running
 * starts again from the beginning; its partial file is gone by then (removePartialVideos).
 */
export function createRenderQueue({
  renderer,
  now = () => new Date(),
  createId = randomUUID,
  progressIntervalMs = 250,
  keepFinished = 50,
  store = memoryJobStore,
  warn = () => undefined,
}: RenderQueueOptions) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<(job: RenderJob) => void>();
  const idleWaiters: (() => void)[] = [];
  let running: Entry | undefined;
  // Set on shutdown: nothing new starts, and the running job is stopped without being marked
  // cancelled, so the store still has it as running and the next start renders it again.
  let suspended = false;
  // Adding picks a free file name; one after the other, so two jobs never get the same one.
  let adding: Promise<unknown> = Promise.resolve();

  const timestamp = () => now().toISOString();
  // Writes to the store one after the other, so a later state never loses to an earlier one.
  let writes: Promise<unknown> = Promise.resolve();

  function persist(entry: Entry) {
    const finished = isRenderJobFinished(entry.job.state);
    const stored =
      finished || !entry.props ? { job: entry.job } : { job: entry.job, props: entry.props };
    writes = writes
      .then(() => store.save(stored))
      .catch((error: unknown) => warn(`The render queue could not be saved: ${String(error)}`));
  }

  function forget(id: string) {
    entries.delete(id);
    writes = writes
      .then(() => store.remove(id))
      .catch((error: unknown) => warn(`The render queue could not be saved: ${String(error)}`));
  }

  function publish(entry: Entry) {
    entry.lastPublished = now().getTime();
    for (const listener of listeners) listener(entry.job);
  }

  function update(entry: Entry, patch: Partial<RenderJob>, { progressOnly = false } = {}) {
    entry.job = { ...entry.job, ...patch };
    // Progress is not stored: after a restart a job starts from the beginning anyway.
    if (!progressOnly) persist(entry);
    // A progress event per frame would flood the browser; the last one before a state
    // change is not lost, the state change carries it.
    if (progressOnly && now().getTime() - entry.lastPublished < progressIntervalMs) return;
    publish(entry);
  }

  function claimedPaths(): Set<string> {
    return new Set(
      [...entries.values()]
        .filter(({ job }) => !isRenderJobFinished(job.state))
        .map(({ job }) => job.outputPath),
    );
  }

  function forgetOldFinished() {
    const finished = [...entries.values()].filter(({ job }) => isRenderJobFinished(job.state));
    for (const { job } of finished.slice(0, Math.max(0, finished.length - keepFinished))) {
      forget(job.id);
    }
  }

  async function run(entry: Entry) {
    const { signal } = entry.abort;
    const { props } = entry;
    if (!props) {
      update(entry, { state: 'failed', error: 'Nothing left to render', finishedAt: timestamp() });
      return;
    }
    update(entry, { state: 'preparing', startedAt: timestamp() });
    let result: Partial<RenderJob>;
    try {
      const serveUrl = await renderer.prepare();
      // Bundling cannot be stopped halfway; a cancel during it takes effect here.
      if (signal.aborted) throw new Error('The render was cancelled');
      update(entry, { state: 'rendering' });
      const video = await renderer.render({
        serveUrl,
        props,
        outputLocation: entry.job.outputPath,
        signal,
        onProgress: (progress, remainingMs) =>
          update(entry, { progress, remainingMs }, { progressOnly: true }),
      });
      result = { state: 'done', progress: 1, video };
    } catch (error) {
      if (suspended && signal.aborted) return;
      result = signal.aborted
        ? { state: 'cancelled' }
        : { state: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
    update(entry, { ...result, remainingMs: null, finishedAt: timestamp() });
  }

  async function runNext(): Promise<void> {
    if (running || suspended) return;
    const next = [...entries.values()].find(({ job }) => job.state === 'queued');
    if (!next) {
      idleWaiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    running = next;
    try {
      await run(next);
    } finally {
      running = undefined;
      forgetOldFinished();
    }
    if (suspended) {
      idleWaiters.splice(0).forEach((resolve) => resolve());
      return;
    }
    return runNext();
  }

  return {
    /**
     * Takes up the stored jobs after a restart and starts the first waiting one. Returns how
     * many will render again.
     */
    async restore(): Promise<number> {
      let again = 0;
      for (const { job, props } of await store.load()) {
        if (entries.has(job.id)) continue;
        const unfinished = !isRenderJobFinished(job.state);
        const restored: RenderJob = unfinished
          ? { ...job, state: 'queued', progress: 0, remainingMs: null, startedAt: null }
          : job;
        const entry: Entry = {
          job: restored,
          props: unfinished ? props : undefined,
          abort: new AbortController(),
          lastPublished: 0,
        };
        entries.set(job.id, entry);
        if (unfinished) {
          again++;
          persist(entry);
        }
      }
      forgetOldFinished();
      void runNext();
      return again;
    },

    async add(input: NewRenderJob): Promise<RenderJob> {
      const claimed = adding.then(async () => {
        const outputPath = await pickOutputPath(
          input.dir,
          input.name,
          outputExtensionOf(input.output.codec),
          claimedPaths(),
        );
        const job: RenderJob = {
          id: createId(),
          projectId: input.project.id,
          projectName: input.project.name,
          etappeId: input.etappe.id,
          etappeName: input.etappe.name,
          output: input.output,
          outputPath,
          state: 'queued',
          progress: 0,
          remainingMs: null,
          createdAt: timestamp(),
          startedAt: null,
          finishedAt: null,
          video: null,
          error: null,
        };
        const entry: Entry = {
          job,
          props: {
            project: input.project,
            ...(input.etappeIds ? { etappeIds: input.etappeIds } : { etappeId: input.etappe.id }),
            output: input.overrides,
            ...(input.assetUrls && { assetUrls: input.assetUrls }),
            ...(input.themes && { themes: input.themes }),
            ...(input.overlayStyles && { overlayStyles: input.overlayStyles }),
            ...(input.serverUrl && { serverUrl: input.serverUrl }),
            ...(input.motionData && { motionData: true }),
          },
          abort: new AbortController(),
          lastPublished: 0,
        };
        entries.set(job.id, entry);
        persist(entry);
        publish(entry);
        return entry;
      });
      adding = claimed.catch(() => undefined);
      const entry = await claimed;
      void runNext();
      return entry.job;
    },

    list: (): RenderJob[] => [...entries.values()].map(({ job }) => job),

    get: (id: string): RenderJob | undefined => entries.get(id)?.job,

    /**
     * A waiting job is cancelled at once; a running one when the renderer has stopped and
     * removed its partial file. Returns the job, or undefined if there is none.
     */
    cancel(id: string): RenderJob | undefined {
      const entry = entries.get(id);
      if (!entry) return undefined;
      if (entry.job.state === 'queued') {
        update(entry, { state: 'cancelled', finishedAt: timestamp() });
      } else if (!isRenderJobFinished(entry.job.state)) {
        entry.abort.abort(new Error('The render was cancelled'));
      }
      return entry.job;
    },

    /** Takes a finished job off the list; the video stays where it is. */
    remove(id: string): boolean {
      const entry = entries.get(id);
      if (!entry || !isRenderJobFinished(entry.job.state)) return false;
      forget(id);
      return true;
    },

    /**
     * Stops for a shutdown: the running render ends and removes its partial file, but every
     * unfinished job stays stored and renders after the next start. Resolves once the
     * renderer has let go and the store is written.
     */
    async suspend(): Promise<void> {
      suspended = true;
      const current = running;
      current?.abort.abort(new Error('The server is shutting down'));
      if (current) await new Promise<void>((resolve) => idleWaiters.push(resolve));
      await writes;
    },

    /** Resolves when every change so far is on disk (tests, shutdown). */
    flushed(): Promise<void> {
      return writes.then(() => undefined);
    },

    /** Called with a job on every change; returns the unsubscribe. */
    subscribe(listener: (job: RenderJob) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Resolves when nothing is waiting or running any more (tests, shutdown). */
    idle(): Promise<void> {
      if (!running && ![...entries.values()].some(({ job }) => job.state === 'queued')) {
        return Promise.resolve();
      }
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}

export type RenderQueue = ReturnType<typeof createRenderQueue>;
