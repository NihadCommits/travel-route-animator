import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Theme } from '@travel-route-animator/core';
import { resolveTheme } from '@travel-route-animator/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { createMapTilerSatellite } from '../tiles/satellite';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'tra-themes-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const sunset: Theme = {
  ...resolveTheme('clean-light').theme,
  id: 'my-sunset',
  name: 'Sonnenuntergang',
};

describe('own themes', () => {
  it('are stored as files, listed, read back and deleted', async () => {
    const app = buildApp({ dataDir });
    expect((await app.inject({ method: 'GET', url: '/api/themes' })).json()).toEqual([]);

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/themes/my-sunset',
      payload: sunset,
    });
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(await readFile(join(dataDir, 'themes', 'my-sunset.json'), 'utf8'))).toEqual(
      sunset,
    );
    expect((await app.inject({ method: 'GET', url: '/api/themes' })).json()).toEqual([sunset]);
    expect((await app.inject({ method: 'GET', url: '/api/themes/my-sunset' })).json()).toEqual(
      sunset,
    );

    const removed = await app.inject({ method: 'DELETE', url: '/api/themes/my-sunset' });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/themes/my-sunset' })).statusCode).toBe(
      404,
    );
    await app.close();
  });

  it('refuses invalid themes, mismatched IDs and the names of built-in ones', async () => {
    const app = buildApp({ dataDir });
    const put = (id: string, payload: object) =>
      app.inject({ method: 'PUT', url: `/api/themes/${id}`, payload });
    expect((await put('my-sunset', { ...sunset, tokens: {} })).statusCode).toBe(400);
    expect((await put('other', sunset)).json()).toMatchObject({ error: 'invalid_theme' });
    expect((await put('night', { ...sunset, id: 'night' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/themes/..%2Fx' })).statusCode).toBe(404);
    await app.close();
  });
});

describe('satellite tiles', () => {
  it('are off without a key, and the server says so', async () => {
    const app = buildApp({ dataDir });
    expect((await app.inject({ method: 'GET', url: '/api/capabilities' })).json()).toEqual({
      satellite: false,
    });
    const tile = await app.inject({ method: 'GET', url: '/api/tiles/satellite/1/0/0' });
    expect(tile.statusCode).toBe(503);
    expect(tile.headers['access-control-allow-origin']).toBe('*');
    await app.close();
  });

  it('come through this server with the key hidden, and are fetched once', async () => {
    const fetchImpl = vi.fn((url: string) => {
      const text = url;
      if (text.includes('tiles.json')) {
        return Promise.resolve(
          Response.json({
            tiles: ['https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}.jpg?key=SECRET'],
            attribution: '© MapTiler',
            maxzoom: 20,
          }),
        );
      }
      return Promise.resolve(
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
    });
    const satellite = createMapTilerSatellite({
      apiKey: 'SECRET',
      cacheDir: join(dataDir, 'cache', 'tiles'),
      // Our fake only takes the URL string the source sends.
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const app = buildApp({ dataDir, satellite });

    const tileJson = await app.inject({ method: 'GET', url: '/api/tiles/satellite/tiles.json' });
    expect(tileJson.body).not.toContain('SECRET');
    expect(tileJson.json()).toMatchObject({
      attribution: '© MapTiler',
      maxzoom: 20,
      tiles: [expect.stringMatching(/^http:\/\/.+\/api\/tiles\/satellite\/\{z\}\/\{x\}\/\{y\}$/)],
    });

    for (let i = 0; i < 2; i++) {
      const tile = await app.inject({ method: 'GET', url: '/api/tiles/satellite/3/4/5' });
      expect(tile.statusCode).toBe(200);
      expect(tile.headers['content-type']).toBe('image/jpeg');
      expect(tile.rawPayload).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    }
    const tileCalls = fetchImpl.mock.calls.filter(([url]) => url.includes('/3/4/5'));
    expect(tileCalls).toHaveLength(1);
    expect(tileCalls[0]![0]).toBe(
      'https://api.maptiler.com/tiles/satellite-v4/3/4/5.jpg?key=SECRET',
    );
    expect(
      (await app.inject({ method: 'GET', url: '/api/tiles/satellite/2/4/0' })).statusCode,
    ).toBe(400);
    await app.close();
  });
});
