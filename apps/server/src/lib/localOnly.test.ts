import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { isLocalHost, isLocalOrigin } from './localOnly';

describe('isLocalHost', () => {
  it.each(['127.0.0.1:5174', 'localhost:5173', 'LOCALHOST', '[::1]:5174', '127.0.0.1'])(
    'accepts %s',
    (host) => expect(isLocalHost(host)).toBe(true),
  );

  it.each([
    undefined,
    '',
    'evil.example',
    'evil.example:5174',
    '127.0.0.1.evil.example',
    '192.168.1.20:5174',
  ])('turns away %s', (host) => expect(isLocalHost(host)).toBe(false));
});

describe('isLocalOrigin', () => {
  it.each(['http://127.0.0.1:5173', 'http://localhost:3000', 'http://[::1]:5175'])(
    'accepts %s',
    (origin) => expect(isLocalOrigin(origin)).toBe(true),
  );

  it.each([
    'https://evil.example',
    'http://localhost.evil.example',
    'null',
    'file://',
    'https://127.0.0.1',
  ])('turns away %s', (origin) => expect(isLocalOrigin(origin)).toBe(false));
});

describe('requests from other sites', () => {
  let dataDir: string;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-local-'));
    app = buildApp({ dataDir });
  });

  afterAll(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('answers the editor on this computer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5173' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('turns away a site that points its own domain at this computer', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: 'rebind.evil.example:5174' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('turns away a form on another site before it can change anything', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        host: '127.0.0.1:5174',
        origin: 'https://evil.example',
        'content-type': 'text/plain',
      },
      payload: '{"name":"Planted"}',
    });
    expect(response.statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(list.json()).toEqual([]);
  });
});
