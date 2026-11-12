import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  setImageIcon,
  type ImageAsset,
  type Project,
  type RenderJob,
  type VideoInfo,
} from '@travel-route-animator/core';
import { resolveTheme } from '@travel-route-animator/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import type { StageRenderer, StageRenderJob } from './renderer';
import type { RevealFile } from './reveal';

const EXAMPLE_DIR = resolve(import.meta.dirname, '../../../../examples/portugal-2026');
const VIDEO: VideoInfo = { width: 1080, height: 1920, fps: 25, durationSec: 10.04 };

let dataDir: string;
let outputDir: string;
let app: ReturnType<typeof buildApp>;
let renders: { job: StageRenderJob; finish: () => void }[];
let revealFile: ReturnType<typeof vi.fn<RevealFile>>;

/** Renders only when the test says so; an abort ends it like Remotion's cancel does. */
const renderer: StageRenderer = {
  prepare: () => Promise.resolve('serve-url'),
  render: (job) =>
    new Promise((done, fail) => {
      renders.push({ job, finish: () => done(VIDEO) });
      job.signal.addEventListener('abort', () => fail(new Error('renderMedia() got cancelled')));
    }),
};

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'tra-render-'));
  outputDir = join(dataDir, 'videos');
  // The example: "Wien – Porto" is a flight, ready at once; "Lissabon – Algarve" is a car
  // whose road route the file does not hold yet.
  await cp(EXAMPLE_DIR, join(dataDir, 'projects', 'portugal-2026'), { recursive: true });
  renders = [];
  revealFile = vi.fn<RevealFile>(() => true);
  app = buildApp({
    dataDir,
    outputDir,
    renderer,
    revealFile,
    now: () => new Date(2026, 9, 29, 15, 30),
  });
});

afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

const startRender = (payload: object) =>
  app.inject({ method: 'POST', url: '/api/render', payload });

const wienPorto = { projectId: 'p_portugal26', etappeId: 'e_wien_porto' };

async function jobs(): Promise<RenderJob[]> {
  return (await app.inject({ method: 'GET', url: '/api/render' })).json<RenderJob[]>();
}

/** Lets the queue's promise chains run. */
const settle = () => new Promise((done) => setTimeout(done, 0));

describe('POST /api/render', () => {
  it('queues the stage with the dialog settings and a name that tells the format', async () => {
    const response = await startRender({ ...wienPorto, output: { aspect: '9:16' } });
    expect(response.statusCode).toBe(202);
    const job = response.json<RenderJob>();
    expect(job).toMatchObject({
      etappeName: 'Wien – Porto',
      projectName: 'Portugal 2026',
      output: { aspect: '9:16', resolution: '1080p', fps: 25 },
      outputPath: join(outputDir, 'portugal-2026', 'wien-porto_9x16_1080p_20261029-1530.mp4'),
    });

    await settle();
    // Only this render's settings change; the project keeps its own defaults.
    expect(renders[0]!.job.props).toMatchObject({
      etappeId: 'e_wien_porto',
      output: { aspect: '9:16' },
      project: { defaults: { output: { aspect: '16:9' } } },
    });
    renders[0]!.finish();
    await settle();
    expect((await jobs())[0]).toMatchObject({ state: 'done', video: VIDEO });
  });

  it('hands the images of the stage to the render as data URLs', async () => {
    // A 2 × 2 GIF of one picture: header, image descriptor, two bytes of data, trailer.
    const gif = Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00,
      0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
    ]);
    const uploaded = await app.inject({
      method: 'POST',
      url: '/api/projects/p_portugal26/assets?name=plane.gif',
      headers: { 'content-type': 'application/octet-stream' },
      payload: gif,
    });
    expect(uploaded.statusCode).toBe(201);
    const asset = uploaded.json<ImageAsset>();
    const project = (
      await app.inject({ method: 'GET', url: '/api/projects/p_portugal26' })
    ).json<Project>();
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/projects/p_portugal26',
      payload: setImageIcon(project, 't_flugzeug', asset),
    });
    expect(saved.statusCode).toBe(200);

    expect((await startRender(wienPorto)).statusCode).toBe(202);
    await settle();
    expect(renders[0]!.job.props.assetUrls).toEqual({
      [asset.id]: `data:image/gif;base64,${gif.toString('base64')}`,
    });
  });

  it('hands an own theme and its own address to the render', async () => {
    const theme = { ...resolveTheme('night').theme, id: 'my-night', name: 'Meine Nacht' };
    await app.inject({ method: 'PUT', url: '/api/themes/my-night', payload: theme });
    const project = (
      await app.inject({ method: 'GET', url: '/api/projects/p_portugal26' })
    ).json<Project>();
    const themed: Project = {
      ...project,
      defaults: { ...project.defaults, mapStyle: { base: 'vector', themeId: 'my-night' } },
    };
    await app.inject({ method: 'PUT', url: '/api/projects/p_portugal26', payload: themed });

    expect((await startRender(wienPorto)).statusCode).toBe(202);
    await settle();
    expect(renders[0]!.job.props.themes).toEqual({ 'my-night': theme });
    expect(renders[0]!.job.props.serverUrl).toMatch(/^http:\/\//);
  });

  it('refuses a stage whose road route is not there yet', async () => {
    const response = await startRender({ ...wienPorto, etappeId: 'e_lissabon_algarve' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'not_ready',
      awaitingRoute: [expect.any(String)],
    });
    expect(await jobs()).toEqual([]);
  });

  it('checks the request, the project, the stage and the file name', async () => {
    expect((await startRender({ ...wienPorto, output: { fps: 23 } })).statusCode).toBe(400);
    expect((await startRender({ ...wienPorto, projectId: 'p_nope' })).statusCode).toBe(404);
    expect((await startRender({ ...wienPorto, etappeId: 'e_nope' })).statusCode).toBe(404);
    const unusable = await startRender({ ...wienPorto, fileName: ' ... ' });
    expect(unusable.json()).toMatchObject({ error: 'invalid_file_name' });

    const sneaky = await startRender({ ...wienPorto, fileName: '../../flug' });
    expect(sneaky.json<RenderJob>().outputPath).toBe(
      join(outputDir, 'portugal-2026', '-..-flug.mp4'),
    );
  });
});

describe('GET /api/render/:id/events', () => {
  it('streams the job until it is finished', async () => {
    const job = (await startRender(wienPorto)).json<RenderJob>();
    await settle();
    const stream = app.inject({ method: 'GET', url: `/api/render/${job.id}/events` });
    await settle();
    renders[0]!.finish();

    const response = await stream;
    expect(response.headers['content-type']).toMatch(/^text\/event-stream/);
    const events = response.body
      .split('\n\n')
      .filter((block) => block.startsWith('event: job'))
      .map((block) => JSON.parse(block.split('data: ')[1]!) as RenderJob);
    expect(events.at(0)?.state).toBe('rendering');
    expect(events.at(-1)).toMatchObject({ state: 'done', video: VIDEO });
  });

  it('answers a finished job with its last state at once', async () => {
    const job = (await startRender(wienPorto)).json<RenderJob>();
    await settle();
    renders[0]!.finish();
    await settle();
    const response = await app.inject({ method: 'GET', url: `/api/render/${job.id}/events` });
    expect(response.body).toContain('"state":"done"');
    expect((await app.inject({ method: 'GET', url: '/api/render/nope/events' })).statusCode).toBe(
      404,
    );
  });
});

describe('DELETE /api/render/:id', () => {
  it('cancels a running job, then takes it off the list', async () => {
    const job = (await startRender(wienPorto)).json<RenderJob>();
    await settle();
    const cancel = await app.inject({ method: 'DELETE', url: `/api/render/${job.id}` });
    expect(cancel.statusCode).toBe(202);
    expect(renders[0]!.job.signal.aborted).toBe(true);
    await settle();
    expect((await jobs())[0]?.state).toBe('cancelled');

    const remove = await app.inject({ method: 'DELETE', url: `/api/render/${job.id}` });
    expect(remove.statusCode).toBe(204);
    expect(await jobs()).toEqual([]);
  });
});

describe('POST /api/render/:id/reveal', () => {
  it('shows a finished video in the file manager, and only that', async () => {
    const job = (await startRender(wienPorto)).json<RenderJob>();
    const reveal = () => app.inject({ method: 'POST', url: `/api/render/${job.id}/reveal` });
    expect((await reveal()).statusCode).toBe(409);

    await settle();
    renders[0]!.finish();
    await settle();
    expect((await reveal()).statusCode).toBe(204);
    expect(revealFile).toHaveBeenCalledWith(job.outputPath);

    revealFile.mockReturnValue(false);
    expect((await reveal()).json()).toMatchObject({ error: 'not_supported' });
  });
});
