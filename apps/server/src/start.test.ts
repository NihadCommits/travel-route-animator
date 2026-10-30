import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { resolveServiceConfig } from './config';
import { startServer, type RunningServer } from './start';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tra-start-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the built editor next to the API', () => {
  it('serves the editor at / and keeps /api for the API', async () => {
    const editorDir = join(dir, 'editor');
    await mkdir(join(editorDir, 'assets'), { recursive: true });
    await writeFile(join(editorDir, 'index.html'), '<!doctype html><title>Routen-Animator</title>');
    await writeFile(join(editorDir, 'assets', 'app.js'), 'console.log(1)');
    const app = buildApp({ dataDir: join(dir, 'data'), editorDir });

    const page = await app.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Routen-Animator');
    expect((await app.inject({ method: 'GET', url: '/assets/app.js' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({
      status: 'ok',
    });
    expect((await app.inject({ method: 'GET', url: '/api/nope' })).statusCode).toBe(404);
    await app.close();
  });
});

describe('startServer', () => {
  let blocker: Server | undefined;
  let running: RunningServer | undefined;

  afterEach(async () => {
    await running?.close();
    await new Promise((done) => (blocker ? blocker.close(done) : done(undefined)));
  });

  it('takes a free port when its own is taken, if allowed', async () => {
    blocker = createServer();
    const port = await new Promise<number>((done) =>
      blocker!.listen(0, '127.0.0.1', () => done((blocker!.address() as { port: number }).port)),
    );
    const options = {
      dataDir: join(dir, 'data'),
      outputDir: join(dir, 'videos'),
      services: resolveServiceConfig({}),
      render: { gl: 'angle' as const, prepareOnStart: false },
      listen: { host: '127.0.0.1', port },
      logger: false,
    };

    await expect(startServer(options)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    running = await startServer({ ...options, anyPortIfTaken: true });
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(running.url).not.toBe(`http://127.0.0.1:${port}`);
    // Nothing to stop: returns at once.
    await running.stopRenders(1000);
  });
});
