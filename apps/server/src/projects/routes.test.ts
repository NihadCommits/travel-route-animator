import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEtappe,
  createTrack,
  createWaypoint,
  IMAGE_LIMITS,
  setImageIcon,
  validateProject,
  type ImageAsset,
  type Project,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

describe('project API', () => {
  let dataDir: string;
  let app: ReturnType<typeof buildApp>;
  let clock: Date;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-projects-'));
    clock = new Date('2026-10-21T10:00:00.000Z');
    app = buildApp({ dataDir, now: () => clock });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function createViaApi(name: string): Promise<Project> {
    const response = await app.inject({ method: 'POST', url: '/api/projects', payload: { name } });
    expect(response.statusCode).toBe(201);
    return response.json<Project>();
  }

  const projectFile = (slug: string) => join(dataDir, 'projects', slug, 'project.json');
  const readProjectFile = async (slug: string) =>
    JSON.parse(await readFile(projectFile(slug), 'utf8')) as Project;

  describe('POST /api/projects', () => {
    it('creates a valid project file under a slug of its name', async () => {
      const project = await createViaApi('Portugal 2026');

      expect(project).toMatchObject({ name: 'Portugal 2026', createdAt: clock.toISOString() });
      const stored = await readProjectFile('portugal-2026');
      expect(stored).toEqual(project);
      expect(validateProject(stored).success).toBe(true);
    });

    it('gives a second project with the same name its own folder', async () => {
      await createViaApi('Portugal 2026');
      await createViaApi('Portugal 2026');
      expect((await readdir(join(dataDir, 'projects'))).sort()).toEqual([
        'portugal-2026',
        'portugal-2026-2',
      ]);
    });

    it('rejects a request without a name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        payload: { name: '  ' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'invalid_request',
        issues: [{ path: 'name', message: 'A project needs a name' }],
      });
    });
  });

  describe('GET /api/projects', () => {
    it('lists projects, most recently changed first', async () => {
      const older = await createViaApi('Older');
      clock = new Date('2026-10-22T10:00:00.000Z');
      const newer = await createViaApi('Newer');

      const response = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(response.json()).toEqual([
        { id: newer.id, name: 'Newer', slug: 'newer', updatedAt: '2026-10-22T10:00:00.000Z' },
        { id: older.id, name: 'Older', slug: 'older', updatedAt: '2026-10-21T10:00:00.000Z' },
      ]);
    });

    it('starts empty and skips folders without a valid project', async () => {
      await mkdir(join(dataDir, 'projects', 'broken'), { recursive: true });
      await writeFile(projectFile('broken'), '{ "schemaVersion": 5, "name": ');
      await mkdir(join(dataDir, 'projects', 'empty-folder'));

      const response = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns the project', async () => {
      const project = await createViaApi('Trip');
      const response = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });
      expect(response.json()).toEqual(project);
    });

    it('answers 404 for an unknown ID', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/projects/p_nope' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: 'not_found',
        message: 'Project "p_nope" does not exist',
      });
    });
  });

  describe('PUT /api/projects/:id', () => {
    function withTrainStage(project: Project): Project {
      const train = createTrack({
        vehicleType: 'train',
        waypoints: [
          createWaypoint({ name: 'Salzburg Hbf', lngLat: [13.0458, 47.8131] }),
          createWaypoint({ name: 'Wien Hbf', lngLat: [16.3755, 48.1851] }),
        ],
      });
      return {
        ...project,
        name: 'Portugal 2026 (renamed)',
        groups: [
          {
            id: 'g_out',
            name: 'Outbound',
            etappen: [createEtappe({ name: 'SBG – Wien', tracks: [train] })],
          },
        ],
      };
    }

    it('saves changes, keeps createdAt and the folder, and sets updatedAt', async () => {
      const project = await createViaApi('Portugal 2026');
      clock = new Date('2026-10-23T12:00:00.000Z');
      const edited = { ...withTrainStage(project), createdAt: '1999-01-01T00:00:00.000Z' };

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}`,
        payload: edited,
      });

      expect(response.statusCode).toBe(200);
      const saved = response.json<Project>();
      expect(saved).toMatchObject({
        name: 'Portugal 2026 (renamed)',
        createdAt: project.createdAt,
        updatedAt: '2026-10-23T12:00:00.000Z',
      });
      expect(await readProjectFile('portugal-2026')).toEqual(saved);
    });

    it('rejects an invalid project with the path of each problem and keeps the file', async () => {
      const project = await createViaApi('Trip');
      const broken = withTrainStage(project);
      broken.groups[0]!.etappen[0]!.tracks[0]!.waypoints[0]!.lngLat = [47.8131, 103.0458];

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}`,
        payload: broken,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: 'invalid_project',
        issues: [
          {
            path: 'groups[0].etappen[0].tracks[0].waypoints[0].lngLat[1]',
            message: expect.stringMatching(/Looks like \[lat, lng\]/) as string,
          },
        ],
      });
      expect(await readProjectFile('trip')).toEqual(project);
    });

    it('refuses to save a project under another ID', async () => {
      const project = await createViaApi('Trip');
      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}`,
        payload: { ...project, id: 'p_other' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ issues: unknown[] }>().issues).toEqual([
        { path: 'id', message: `Project ID "p_other" does not match the URL (${project.id})` },
      ]);
    });

    it('answers 404 when the project does not exist', async () => {
      const project = await createViaApi('Trip');
      const response = await app.inject({
        method: 'PUT',
        url: '/api/projects/p_gone',
        payload: { ...project, id: 'p_gone' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('moves the project to the trash instead of deleting it', async () => {
      const project = await createViaApi('Trip');

      const response = await app.inject({ method: 'DELETE', url: `/api/projects/${project.id}` });
      expect(response.statusCode).toBe(204);

      expect(await readdir(join(dataDir, 'projects'))).toEqual([]);
      expect(await readdir(join(dataDir, '.trash'))).toEqual(['trip_2026-10-21T10-00-00-000Z']);
      const notFound = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });
      expect(notFound.statusCode).toBe(404);
    });

    it('answers 404 for an unknown ID', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/projects/p_nope' });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('a project whose file is broken', () => {
    // Simulates a hand edit: the file is still there, but no longer a valid project.
    async function breakFile(slug: string, edit: (text: string) => string) {
      const file = projectFile(slug);
      await writeFile(file, edit(await readFile(file, 'utf8')));
    }

    it('says why it cannot be opened instead of claiming it does not exist', async () => {
      const project = await createViaApi('Portugal 2026');
      await breakFile('portugal-2026', (text) =>
        text.replace('"schemaVersion": 5', '"schemaVersion": 5, "colour": "red"'),
      );

      const response = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: 'invalid_project_file',
        message: `Project "${project.id}" cannot be opened: projects/portugal-2026/project.json is not a valid project file`,
        file: 'projects/portugal-2026/project.json',
        issues: [{ path: '', message: 'Unrecognized key: "colour"', check: { kind: 'other' } }],
      });
    });

    it('reports a JSON syntax error and still knows which project it is', async () => {
      const project = await createViaApi('Trip');
      await breakFile('trip', (text) => text.replace('"groups": []', '"groups": [,]'));

      const response = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });

      expect(response.statusCode).toBe(422);
      const body = response.json<{ issues: { path: string; message: string }[] }>();
      expect(body.issues).toHaveLength(1);
      expect(body.issues[0]?.message).toMatch(/^Not valid JSON: /);
    });

    it('stays out of the list', async () => {
      const broken = await createViaApi('Broken');
      const fine = await createViaApi('Fine');
      await breakFile('broken', (text) => text.replace(/"name": "Broken"/, '"name": ""'));

      const response = await app.inject({ method: 'GET', url: '/api/projects' });
      const ids = response.json<{ id: string }[]>().map((summary) => summary.id);
      expect(ids).toEqual([fine.id]);
      expect(ids).not.toContain(broken.id);
    });

    it('cannot be overwritten before it is fixed', async () => {
      const project = await createViaApi('Trip');
      await breakFile('trip', (text) => text.replace('"fps": 25', '"fps": 29.97'));

      const response = await app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}`,
        payload: project,
      });
      expect(response.statusCode).toBe(422);
    });

    it('can still be moved to the trash', async () => {
      const project = await createViaApi('Trip');
      await breakFile('trip', (text) => text.replace('"fps": 25', '"fps": 29.97'));

      const response = await app.inject({ method: 'DELETE', url: `/api/projects/${project.id}` });
      expect(response.statusCode).toBe(204);
      expect(await readdir(join(dataDir, 'projects'))).toEqual([]);
    });
  });

  describe('images for vehicles', () => {
    /** A PNG header is all the server reads; the pixels do not matter here. */
    function png(width: number, height: number, size = 64): Buffer {
      const bytes = Buffer.alloc(size);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).copy(bytes);
      bytes.write('IHDR', 12, 'ascii');
      bytes.writeUInt32BE(width, 16);
      bytes.writeUInt32BE(height, 20);
      return bytes;
    }

    function stageWithCar() {
      const car = createTrack({
        vehicleType: 'car',
        waypoints: [
          createWaypoint({ name: 'Porto', lngLat: [-8.61, 41.15] }),
          createWaypoint({ name: 'Lisboa', lngLat: [-9.14, 38.72] }),
        ],
      });
      return createEtappe({ name: 'Porto – Lisboa', tracks: [{ ...car, id: 't_car' }] });
    }

    const upload = (id: string, payload: Buffer, name = 'Läufer.png', type = 'image/png') =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${id}/assets?name=${encodeURIComponent(name)}`,
        headers: { 'content-type': type },
        payload,
      });

    it('stores an image in the project folder and serves it back', async () => {
      const project = await createViaApi('Trip');
      const bytes = png(120, 160);
      const response = await upload(project.id, bytes, 'C:\\Bilder\\Läufer.png');
      expect(response.statusCode).toBe(201);
      const asset = response.json<ImageAsset>();
      expect(asset.id).toMatch(/^a_.{12}$/);
      expect(asset).toEqual({
        id: asset.id,
        kind: 'image',
        name: 'Läufer.png',
        mimeType: 'image/png',
        widthPx: 120,
        heightPx: 160,
        frameCount: 1,
      });
      const file = join(dataDir, 'projects', 'trip', 'assets', `${asset.id}.png`);
      expect(await readFile(file)).toEqual(bytes);
      // The project only learns of it when the editor saves the image together with its use.
      expect((await readProjectFile('trip')).assets).toEqual([]);

      const served = await app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/assets/${asset.id}.png`,
      });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['cache-control']).toContain('immutable');
      expect(served.rawPayload).toEqual(bytes);

      const used = setImageIcon(
        { ...project, groups: [{ id: 'g', name: 'G', etappen: [stageWithCar()] }] },
        't_car',
        asset,
      );
      const saved = await app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}`,
        payload: used,
      });
      expect(saved.statusCode).toBe(200);
      expect((await readProjectFile('trip')).assets).toEqual([asset]);
    });

    it('says why an image cannot be used', async () => {
      const project = await createViaApi('Trip');
      const problem = async (pending: ReturnType<typeof upload>) => {
        const response = await pending;
        return [response.statusCode, response.json<{ problem: string }>().problem];
      };
      expect(await problem(upload(project.id, Buffer.from('<svg/>')))).toEqual([
        422,
        'image.unsupported',
      ]);
      expect(await problem(upload(project.id, png(600, 100)))).toEqual([422, 'image.tooWide']);
      expect(await problem(upload(project.id, png(10, 10, IMAGE_LIMITS.bytes + 1)))).toEqual([
        413,
        'image.tooLarge',
      ]);
      expect(await problem(upload(project.id, png(10, 10), 'x.jpg', 'image/jpeg'))).toEqual([
        415,
        'image.unsupported',
      ]);
      expect((await upload('p_nope', png(10, 10))).statusCode).toBe(404);
      expect(await readdir(join(dataDir, 'projects', 'trip'))).toEqual(['project.json']);
    });

    it('serves nothing but the files it stored', async () => {
      const project = await createViaApi('Trip');
      const get = (file: string) =>
        app.inject({ method: 'GET', url: `/api/projects/${project.id}/assets/${file}` });
      expect((await get('a_missing.png')).statusCode).toBe(404);
      expect((await get('..%2Fproject.json')).statusCode).toBe(404);
      expect((await get('..%5Cproject.json')).statusCode).toBe(404);
      expect((await get('project.json')).statusCode).toBe(404);
    });
  });

  it('handles parallel creates without picking the same folder twice', async () => {
    await Promise.all([createViaApi('Trip'), createViaApi('Trip'), createViaApi('Trip')]);
    expect((await readdir(join(dataDir, 'projects'))).sort()).toEqual(['trip', 'trip-2', 'trip-3']);
  });
});
