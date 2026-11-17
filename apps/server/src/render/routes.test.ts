import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  // The example: "Wien – Porto" is a flight, ready at once. It ships its road routes too; the
  // tests that need a missing one take it out (dropRoad).
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

  it('renders an overlay as ProRes 4444 or PNG for this render only, and refuses it as H.264', async () => {
    const overlay = await startRender({
      ...wienPorto,
      output: { codec: 'prores-4444', transparentOverlay: true },
    });
    expect(overlay.statusCode).toBe(202);
    expect(overlay.json<RenderJob>().outputPath).toMatch(
      /wien-porto_16x9_1080p_20261029-1530\.mov$/,
    );
    const pictures = await startRender({
      ...wienPorto,
      output: { codec: 'png-sequence', transparentOverlay: true },
    });
    // A PNG sequence is a folder named like the video.
    expect(pictures.json<RenderJob>().outputPath).toMatch(/wien-porto_16x9_1080p_20261029-1530$/);
    await settle();
    expect(renders[0]!.job.props).toMatchObject({
      output: { codec: 'prores-4444', transparentOverlay: true },
    });

    const withMotion = await startRender({
      ...wienPorto,
      motionData: true,
      editValues: true,
      blockVideos: true,
    });
    expect(withMotion.statusCode).toBe(202);

    const opaque = await startRender({ ...wienPorto, output: { transparentOverlay: true } });
    expect(opaque.statusCode).toBe(400);
    expect(opaque.json()).toMatchObject({ error: 'invalid_output' });
    renders[0]!.finish();
    renders.length = 0;
    await settle();
    renders[0]!.finish();
    await settle();
    // The third job asks for the vehicles' motion and the files for the edit (M18).
    expect(renders.at(-1)!.job.props).toMatchObject({
      motionData: true,
      editValues: true,
      blockVideos: true,
    });
  });

  it('fills in the heights a stage on 3D terrain needs before it renders', async () => {
    const project = (
      await app.inject({ method: 'GET', url: '/api/projects/p_portugal26' })
    ).json<Project>();
    const onTerrain: Project = {
      ...project,
      groups: project.groups.map((group) => ({
        ...group,
        etappen: group.etappen.map((etappe) =>
          etappe.id === wienPorto.etappeId
            ? { ...etappe, view: { ...etappe.view, terrain: { enabled: true, exaggeration: 1.5 } } }
            : etappe,
        ),
      })),
    };
    await app.inject({ method: 'PUT', url: '/api/projects/p_portugal26', payload: onTerrain });
    await app.close();
    const heights = { source: 'dem' as const, stepM: 1000, elevationsM: [183, 69] };
    const sample = vi.fn(() => Promise.resolve(heights));
    app = buildApp({ dataDir, outputDir, renderer, revealFile, elevation: { sample } });

    expect((await startRender(wienPorto)).statusCode).toBe(202);
    await settle();
    const rendered = renders[0]!.job.props.project.groups
      .flatMap((group) => group.etappen)
      .find((etappe) => etappe.id === wienPorto.etappeId)!;
    // The plane takes off at Vienna's height.
    expect(rendered.tracks[0]!.computed!.elevation).toEqual(heights);
    expect(sample).toHaveBeenCalledTimes(1);
  });

  /** Takes the computed road routes out of the example's stages, as before routing ran. */
  async function dropRoads(...etappeIds: string[]) {
    const file = join(dataDir, 'projects', 'portugal-2026', 'project.json');
    const project = JSON.parse(await readFile(file, 'utf8')) as Project;
    for (const etappe of project.groups.flatMap((group) => group.etappen)) {
      if (!etappeIds.includes(etappe.id)) continue;
      for (const track of etappe.tracks) {
        if (track.routing.mode === 'road') delete track.computed;
      }
    }
    await writeFile(file, JSON.stringify(project));
  }

  it('renders several stages as one video and names it after them', async () => {
    await dropRoads('e_flughafen_hotel');
    const response = await startRender({
      projectId: 'p_portugal26',
      etappeIds: ['e_sbg_wien', 'e_wien_porto'],
    });
    expect(response.statusCode).toBe(202);
    const job = response.json<RenderJob>();
    expect(job.etappeName).toBe('SBG – Wien bis Wien – Porto');
    expect(job.outputPath).toContain('sbg-wien-bis-wien-porto_16x9_1080p');
    await settle();
    expect(renders[0]!.job.props).toMatchObject({ etappeIds: ['e_sbg_wien', 'e_wien_porto'] });
    expect(renders[0]!.job.props).not.toHaveProperty('etappeId');

    // The whole outward journey waits for the taxi's road route, and the group is named.
    const group = await startRender({
      projectId: 'p_portugal26',
      etappeIds: ['e_sbg_wien', 'e_wien_porto', 'e_flughafen_hotel'],
    });
    expect(group.statusCode).toBe(409);
    expect(group.json<{ message: string }>().message).toContain('"Hinreise"');
    expect(
      (await startRender({ projectId: 'p_portugal26', etappeId: 'e_sbg_wien', etappeIds: ['x'] }))
        .statusCode,
    ).toBe(400);
  });

  it('refuses a stage whose road route is not there yet', async () => {
    await dropRoads('e_lissabon_algarve');
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
