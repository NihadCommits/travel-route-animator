import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEtappe,
  addGroup,
  createProject,
  templateOf,
  type Template,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

let dataDir: string;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'tra-templates-'));
  app = buildApp({ dataDir });
});

afterEach(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

function template(name: string, createdAt: string): Template {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const stage = addEtappe(group.project, group.id, name);
  return templateOf(stage.project, stage.id, { now: () => new Date(createdAt) });
}

describe('templates API', () => {
  it('stores, lists newest first and removes templates', async () => {
    const older = template('Flughafen-Taxi', '2026-11-01T10:00:00Z');
    const newer = template('Stadtrundgang', '2026-11-10T10:00:00Z');
    for (const t of [older, newer]) {
      const saved = await app.inject({ method: 'PUT', url: `/api/templates/${t.id}`, payload: t });
      expect(saved.statusCode).toBe(200);
    }
    const listed = await app.inject({ method: 'GET', url: '/api/templates' });
    expect(listed.json<Template[]>().map((t) => t.name)).toEqual([
      'Stadtrundgang',
      'Flughafen-Taxi',
    ]);

    expect(
      (await app.inject({ method: 'DELETE', url: `/api/templates/${older.id}` })).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/templates/${older.id}` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/templates' })).json<Template[]>(),
    ).toHaveLength(1);
  });

  it('refuses an invalid template and skips a broken file', async () => {
    const t = template('Taxi', '2026-11-01T10:00:00Z');
    const mismatch = await app.inject({ method: 'PUT', url: '/api/templates/other', payload: t });
    expect(mismatch.statusCode).toBe(400);
    const broken = await app.inject({
      method: 'PUT',
      url: `/api/templates/${t.id}`,
      payload: { ...t, kind: 'x' },
    });
    expect(broken.json()).toMatchObject({ error: 'invalid_template' });
    await mkdir(join(dataDir, 'templates'), { recursive: true });
    await writeFile(join(dataDir, 'templates', 'kaputt.json'), '{');
    expect((await app.inject({ method: 'GET', url: '/api/templates' })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: '/api/templates/..%2Fx' })).statusCode).toBe(
      404,
    );
  });
});
