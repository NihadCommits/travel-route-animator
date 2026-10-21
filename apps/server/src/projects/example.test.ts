import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeIssues, parseProjectFile, type Project } from '@travel-route-animator/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';

const EXAMPLE_DIR = resolve(import.meta.dirname, '../../../../examples/portugal-2026');

describe('example project "Portugal 2026"', () => {
  let dataDir: string | undefined;

  afterEach(async () => {
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  it('is a valid project file', async () => {
    const raw: unknown = JSON.parse(await readFile(join(EXAMPLE_DIR, 'project.json'), 'utf8'));
    const result = parseProjectFile(raw);
    expect(result.success, result.success ? '' : describeIssues(result.issues)).toBe(true);
  });

  it('can be opened through the API when copied into the data folder', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-example-'));
    await cp(EXAMPLE_DIR, join(dataDir, 'projects', 'portugal-2026'), { recursive: true });
    const app = buildApp({ dataDir });

    const response = await app.inject({ method: 'GET', url: '/api/projects/p_portugal26' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const project = response.json<Project>();
    expect(project.groups.map((group) => group.name)).toEqual(['Hinreise', 'Tag 4']);
    expect(project.groups.flatMap((group) => group.etappen.map((etappe) => etappe.name))).toEqual([
      'SBG – Wien',
      'Wien – Porto',
      'Flughafen – Hotel',
      'Lissabon – Algarve',
      'Wohin morgen?',
    ]);
  });
});
