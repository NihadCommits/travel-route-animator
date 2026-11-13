import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProject,
  defaultOutput,
  type RenderJob,
  type RenderJobState,
  type VideoInfo,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFileJobStore } from './jobStore';
import { createRenderQueue, type NewRenderJob } from './queue';
import type { StageRenderer, StageRenderJob } from './renderer';

const VIDEO: VideoInfo = { width: 1920, height: 1080, fps: 25, durationSec: 12.04 };

/** A renderer whose renders the test finishes, fails or watches being aborted. */
function fakeRenderer() {
  const renders: {
    job: StageRenderJob;
    finish: () => void;
    fail: (message: string) => void;
  }[] = [];
  let finishPrepare: (() => void) | undefined;
  const renderer: StageRenderer & { holdPrepare: () => void } = {
    holdPrepare() {
      renderer.prepare = () =>
        new Promise((resolve) => (finishPrepare = () => resolve('serve-url')));
    },
    prepare: vi.fn(() => Promise.resolve('serve-url')),
    render: vi.fn(
      (job: StageRenderJob) =>
        new Promise<VideoInfo>((resolve, reject) => {
          renders.push({
            job,
            finish: () => resolve(VIDEO),
            fail: (message) => reject(new Error(message)),
          });
          job.signal.addEventListener('abort', () =>
            reject(new Error('renderMedia() got cancelled')),
          );
        }),
    ),
  };
  return { renderer, renders, finishPrepare: () => finishPrepare?.() };
}

let outputDir: string;
let clock: number;

beforeEach(async () => {
  outputDir = await mkdtemp(join(tmpdir(), 'tra-queue-'));
  clock = Date.UTC(2026, 9, 29, 15, 30);
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

function setup(options: { keepFinished?: number } = {}) {
  const fake = fakeRenderer();
  let ids = 0;
  const queue = createRenderQueue({
    renderer: fake.renderer,
    now: () => new Date(clock),
    createId: () => `job-${(ids += 1)}`,
    ...options,
  });
  const states: Record<string, RenderJobState[]> = {};
  queue.subscribe((job) => {
    const seen = (states[job.id] ??= []);
    if (seen.at(-1) !== job.state) seen.push(job.state);
  });
  return { ...fake, queue, states };
}

function job(name = 'lissabon-algarve'): NewRenderJob {
  return {
    project: createProject('Portugal 2026'),
    etappe: { id: 'e_lissabon', name: 'Lissabon – Algarve' },
    overrides: { aspect: '9:16' },
    output: { ...defaultOutput(), aspect: '9:16' },
    dir: join(outputDir, 'portugal-2026'),
    name,
  };
}

/** Lets the queue's promise chains run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createRenderQueue', () => {
  it('renders one job at a time, in order', async () => {
    const { queue, renders, states } = setup();
    const first = await queue.add(job());
    const second = await queue.add(job('wohin-morgen'));
    await settle();
    expect(renders).toHaveLength(1);
    expect(renders[0]!.job.props).toMatchObject({
      etappeId: 'e_lissabon',
      output: { aspect: '9:16' },
    });
    expect(queue.get(second.id)?.state).toBe('queued');

    renders[0]!.finish();
    await settle();
    expect(queue.get(first.id)).toMatchObject({ state: 'done', progress: 1, video: VIDEO });
    expect(renders).toHaveLength(2);
    renders[1]!.finish();
    await queue.idle();
    expect(states[first.id]).toEqual(['queued', 'preparing', 'rendering', 'done']);
  });

  it('gives two jobs with the same name two files', async () => {
    const { queue } = setup();
    const a = await queue.add(job());
    const b = await queue.add(job());
    expect(a.outputPath).toBe(join(outputDir, 'portugal-2026', 'lissabon-algarve.mp4'));
    expect(b.outputPath).toBe(join(outputDir, 'portugal-2026', 'lissabon-algarve-2.mp4'));
  });

  it('passes progress on, but not more often than every 250 ms', async () => {
    const { queue, renders } = setup();
    const seen: RenderJob[] = [];
    queue.subscribe((update) => seen.push(update));
    await queue.add(job());
    await settle();
    const { onProgress } = renders[0]!.job;
    const before = seen.length;
    onProgress(0.1, 9000);
    onProgress(0.2, 8000);
    clock += 300;
    onProgress(0.3, 7000);
    expect(seen.slice(before).map((update) => update.progress)).toEqual([0.3]);
    expect(seen.at(-1)?.remainingMs).toBe(7000);
  });

  it('cancels a waiting job at once and a running one through the renderer', async () => {
    const { queue, renders, renderer } = setup();
    const running = await queue.add(job());
    const waiting = await queue.add(job('wohin-morgen'));
    await settle();

    expect(queue.cancel(waiting.id)?.state).toBe('cancelled');
    queue.cancel(running.id);
    expect(renders[0]!.job.signal.aborted).toBe(true);
    await queue.idle();
    expect(queue.get(running.id)).toMatchObject({ state: 'cancelled', error: null });
    expect(queue.get(running.id)?.finishedAt).not.toBeNull();
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('takes a cancel during bundling into account before the first frame', async () => {
    const { queue, renderer, finishPrepare } = setup();
    renderer.holdPrepare();
    const added = await queue.add(job());
    await settle();
    expect(queue.get(added.id)?.state).toBe('preparing');
    queue.cancel(added.id);
    finishPrepare();
    await queue.idle();
    expect(queue.get(added.id)?.state).toBe('cancelled');
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('reports a failed render and goes on with the next job', async () => {
    const { queue, renders } = setup();
    const failing = await queue.add(job());
    await queue.add(job('wohin-morgen'));
    await settle();
    renders[0]!.fail('The rendered file is 1080×1920 at 24 fps, not 1080×1920 at 25 fps');
    await settle();
    expect(queue.get(failing.id)?.state).toBe('failed');
    expect(queue.get(failing.id)?.error).toMatch(/24 fps/);
    expect(renders).toHaveLength(2);
  });

  it('removes only finished jobs from the list and forgets the oldest ones', async () => {
    const { queue, renders } = setup({ keepFinished: 1 });
    const first = await queue.add(job());
    await settle();
    expect(queue.remove(first.id)).toBe(false);
    renders[0]!.finish();
    await queue.idle();
    const second = await queue.add(job('zweiter'));
    await settle();
    renders[1]!.finish();
    await queue.idle();
    expect(queue.list().map(({ id }) => id)).toEqual([second.id]);
    expect(queue.remove(second.id)).toBe(true);
    expect(queue.list()).toEqual([]);
  });
});

describe('the queue on disk', () => {
  const settle = () => new Promise((done) => setTimeout(done, 0));

  function persistent(dir: string) {
    const fake = fakeRenderer();
    let ids = 0;
    const queue = createRenderQueue({
      renderer: fake.renderer,
      now: () => new Date((clock += 1000)),
      createId: () => `job-${dir.length}-${(ids += 1)}`,
      store: createFileJobStore(dir, () => undefined),
    });
    return { ...fake, queue };
  }

  it('takes up waiting and interrupted jobs after a restart, and runs them through', async () => {
    const dir = join(outputDir, 'render-queue');
    const before = persistent(dir);
    for (let i = 1; i <= 5; i++) await before.queue.add(job(`etappe-${i}`));
    await settle();
    before.renders[0]!.finish();
    await settle();
    // The second one is running when the server stops.
    expect(before.queue.list().map((j) => j.state)).toEqual([
      'done',
      'rendering',
      'queued',
      'queued',
      'queued',
    ]);
    await before.queue.suspend();
    expect(before.renders[1]!.job.signal.aborted).toBe(true);
    // Stopped, not cancelled: nothing changed for the list.
    expect(before.queue.list()[1]!.state).toBe('rendering');

    const after = persistent(dir);
    expect(await after.queue.restore()).toBe(4);
    const jobs = after.queue.list();
    expect(jobs.map((j) => j.state)).toEqual(['done', 'rendering', 'queued', 'queued', 'queued']);
    // The same files as before; the interrupted one starts from the beginning.
    expect(jobs.map((j) => j.outputPath)).toEqual(before.queue.list().map((j) => j.outputPath));
    expect(after.renders[0]!.job.props).toEqual(before.renders[1]!.job.props);

    // Four renders in a row, without anyone stepping in.
    for (let i = 0; i < 4; i++) {
      await settle();
      after.renders[i]!.finish();
    }
    await after.queue.idle();
    expect(after.queue.list().map((j) => j.state)).toEqual(Array(5).fill('done'));
    await after.queue.flushed();

    // Finished jobs come back for the list only.
    const third = persistent(dir);
    expect(await third.queue.restore()).toBe(0);
    expect(third.queue.list()).toHaveLength(5);
    expect(third.renderer.render).not.toHaveBeenCalled();
  });

  it('forgets a job taken off the list, and skips a broken file', async () => {
    const dir = join(outputDir, 'render-queue');
    const first = persistent(dir);
    const added = await first.queue.add(job());
    await settle();
    first.renders[0]!.finish();
    await first.queue.idle();
    expect(first.queue.remove(added.id)).toBe(true);
    await first.queue.flushed();
    await writeFile(join(dir, 'kaputt.json'), '{ "job": ');

    const warnings: string[] = [];
    const store = createFileJobStore(dir, (message) => warnings.push(message));
    expect(await store.load()).toEqual([]);
    expect(warnings[0]).toMatch(/kaputt\.json/);
  });
});
