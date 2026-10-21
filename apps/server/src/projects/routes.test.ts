import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEtappe,
  createTrack,
  createWaypoint,
  validateProject,
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
      await writeFile(projectFile('broken'), '{ "schemaVersion": 1, "name": ');
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

  it('handles parallel creates without picking the same folder twice', async () => {
    await Promise.all([createViaApi('Trip'), createViaApi('Trip'), createViaApi('Trip')]);
    expect((await readdir(join(dataDir, 'projects'))).sort()).toEqual(['trip', 'trip-2', 'trip-3']);
  });
});
