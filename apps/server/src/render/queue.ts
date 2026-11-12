import { randomUUID } from 'node:crypto';
import {
  isRenderJobFinished,
  type OutputSettings,
  type Project,
  type RenderJob,
  type Theme,
} from '@travel-route-animator/core';
import type { EtappeProps } from '@travel-route-animator/scene/render';
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
  /** The stage's images as data: URLs, by asset ID (ADR 0009). */
  assetUrls?: Record<string, string>;
  /** The own theme the stage's style names (ADR 0010). */
  themes?: Record<string, Theme>;
  /** This server, for satellite tiles. */
  serverUrl?: string;
}

interface Entry {
  job: RenderJob;
  props: EtappeProps;
  abort: AbortController;
  lastPublished: number;
}

/**
 * Render jobs, one at a time (WebGL maps want the whole GPU, ARCHITEKTUR: Render-Pipeline).
 * Kept in memory: after a restart the list starts empty, the videos are in the output folder.
 */
export function createRenderQueue({
  renderer,
  now = () => new Date(),
  createId = randomUUID,
  progressIntervalMs = 250,
  keepFinished = 50,
}: RenderQueueOptions) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<(job: RenderJob) => void>();
  const idleWaiters: (() => void)[] = [];
  let running: Entry | undefined;
  // Adding picks a free file name; one after the other, so two jobs never get the same one.
  let adding: Promise<unknown> = Promise.resolve();

  const timestamp = () => now().toISOString();

  function publish(entry: Entry) {
    entry.lastPublished = now().getTime();
    for (const listener of listeners) listener(entry.job);
  }

  function update(entry: Entry, patch: Partial<RenderJob>, { progressOnly = false } = {}) {
    entry.job = { ...entry.job, ...patch };
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
      entries.delete(job.id);
    }
  }

  async function run(entry: Entry) {
    const { signal } = entry.abort;
    update(entry, { state: 'preparing', startedAt: timestamp() });
    let result: Partial<RenderJob>;
    try {
      const serveUrl = await renderer.prepare();
      // Bundling cannot be stopped halfway; a cancel during it takes effect here.
      if (signal.aborted) throw new Error('The render was cancelled');
      update(entry, { state: 'rendering' });
      const video = await renderer.render({
        serveUrl,
        props: entry.props,
        outputLocation: entry.job.outputPath,
        signal,
        onProgress: (progress, remainingMs) =>
          update(entry, { progress, remainingMs }, { progressOnly: true }),
      });
      result = { state: 'done', progress: 1, video };
    } catch (error) {
      result = signal.aborted
        ? { state: 'cancelled' }
        : { state: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
    update(entry, { ...result, remainingMs: null, finishedAt: timestamp() });
  }

  async function runNext(): Promise<void> {
    if (running) return;
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
    return runNext();
  }

  return {
    async add(input: NewRenderJob): Promise<RenderJob> {
      const claimed = adding.then(async () => {
        const outputPath = await pickOutputPath(input.dir, input.name, claimedPaths());
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
            etappeId: input.etappe.id,
            output: input.overrides,
            ...(input.assetUrls && { assetUrls: input.assetUrls }),
            ...(input.themes && { themes: input.themes }),
            ...(input.serverUrl && { serverUrl: input.serverUrl }),
          },
          abort: new AbortController(),
          lastPublished: 0,
        };
        entries.set(job.id, entry);
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
      return entries.delete(id);
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
