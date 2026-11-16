import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEtappe,
  addGroup,
  BUILT_IN_OVERLAY_STYLES,
  createProject,
  editEtappe,
  type OverlayStyle,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { createOverlayStyleStore, overlayStylesOf } from './overlayStyles';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'tra-overlay-styles-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const vlog: OverlayStyle = {
  id: 'style-vlog',
  name: 'Mein Vlog',
  tokens: { ...BUILT_IN_OVERLAY_STYLES.sport!, textColor: '#ffd23f' },
};

describe('own overlay styles', () => {
  it('are stored as files, listed and deleted', async () => {
    const app = buildApp({ dataDir });
    expect((await app.inject({ method: 'GET', url: '/api/overlay-styles' })).json()).toEqual([]);

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/overlay-styles/style-vlog',
      payload: vlog,
    });
    expect(saved.statusCode).toBe(200);
    expect(
      JSON.parse(await readFile(join(dataDir, 'overlay-styles', 'style-vlog.json'), 'utf8')),
    ).toEqual(vlog);
    expect((await app.inject({ method: 'GET', url: '/api/overlay-styles' })).json()).toEqual([
      vlog,
    ]);

    const removed = await app.inject({ method: 'DELETE', url: '/api/overlay-styles/style-vlog' });
    expect(removed.statusCode).toBe(204);
    expect(
      (await app.inject({ method: 'GET', url: '/api/overlay-styles/style-vlog' })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('refuses invalid styles, mismatched IDs and the names of built-in ones', async () => {
    const app = buildApp({ dataDir });
    const put = (id: string, payload: object) =>
      app.inject({ method: 'PUT', url: `/api/overlay-styles/${id}`, payload });
    const broken = await put('style-vlog', { ...vlog, tokens: { font: 'comic-sans' } });
    expect(broken.statusCode).toBe(400);
    expect(broken.json()).toMatchObject({ error: 'invalid_overlay_style' });
    expect((await put('other', vlog)).statusCode).toBe(400);
    expect((await put('classic', { ...vlog, id: 'classic' })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/overlay-styles/..%2Fx' })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('skips a broken file and sends along only the own styles the stages name', async () => {
    const warnings: string[] = [];
    const styles = createOverlayStyleStore({ dataDir, warn: (m) => warnings.push(m) });
    await styles.put(vlog.id, vlog);
    await writeFile(join(dataDir, 'overlay-styles', 'broken.json'), '{"id":"broken"}');
    expect(await styles.list()).toEqual([vlog]);
    expect(warnings).toEqual([
      'Skipping overlay-styles/broken.json, it is not a valid overlay style',
    ]);

    const group = addGroup(createProject('Trip'), 'Tag 1');
    const first = addEtappe(group.project, group.id, 'Eigener Stil');
    const second = addEtappe(first.project, group.id, 'Fehlender Stil');
    let project = editEtappe(second.project, first.id, (e) => ({
      ...e,
      overlays: { ...e.overlays, style: { styleId: vlog.id } },
    }));
    project = editEtappe(project, second.id, (e) => ({
      ...e,
      overlays: { ...e.overlays, style: { styleId: 'gone' } },
    }));
    expect(await overlayStylesOf(project, [first.id, second.id], styles)).toEqual([vlog]);
    // The project's own Classic needs nothing.
    expect(await overlayStylesOf(group.project, [], styles)).toEqual([]);
  });
});
