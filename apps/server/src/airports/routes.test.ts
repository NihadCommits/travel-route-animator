import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Place } from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { airportsFromCsv } from './airportData';
import { airportsFile } from './airportStore';
import { AIRPORTS_CSV } from './testAirports';

describe('airport search API', () => {
  let dataDir: string;
  let app: ReturnType<typeof buildApp>;

  const schwechat: Place = {
    id: 'photon:W1',
    name: 'Flughafen Wien-Schwechat',
    lngLat: [16.5849, 48.105],
    kind: 'airport',
    source: 'search',
  };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-airports-'));
    app = buildApp({
      dataDir,
      geocodingIntervalMs: 0,
      geocodingProvider: {
        name: 'fake',
        search: () => Promise.resolve([schwechat]),
        reverse: () => Promise.resolve(undefined),
      },
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function writeAirports() {
    const file = airportsFile(dataDir);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(airportsFromCsv(AIRPORTS_CSV)));
  }

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('explains how to get the data while it is missing, and works once it is there', async () => {
    const missing = await get('/api/airports?q=VIE');
    expect(missing.statusCode).toBe(503);
    expect(missing.json<{ message: string }>().message).toMatch(/pnpm data:airports/);

    // No restart needed after running the script.
    await writeAirports();
    const found = await get('/api/airports?q=VIE');
    expect(found.statusCode).toBe(200);
    expect(found.json<{ places: Place[] }>().places[0]?.airportCode).toBe('VIE');
  });

  it('rejects a request without a query', async () => {
    await writeAirports();
    expect((await get('/api/airports')).statusCode).toBe(400);
  });

  it('gives airports from the place search their IATA code', async () => {
    expect(
      (await get('/api/geocode?q=Flughafen%20Wien')).json<{ places: Place[] }>().places[0],
    ).not.toHaveProperty('airportCode');

    await writeAirports();
    const { places } = (await get('/api/geocode?q=Wien%20Schwechat')).json<{ places: Place[] }>();
    expect(places[0]).toMatchObject({ name: 'Flughafen Wien-Schwechat', airportCode: 'VIE' });
  });
});
