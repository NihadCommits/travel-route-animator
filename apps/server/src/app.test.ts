import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('GET /api/health', () => {
  let dataDir: string;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-health-'));
    app = buildApp({ dataDir });
  });

  afterAll(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('reports that the server is up', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
