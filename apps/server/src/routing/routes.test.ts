import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ComputedRouteSchema,
  computeRouteInputHash,
  type RouteRequest,
  type RouteShape,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { RoutingError, type RoutingProvider } from './provider';

const NOW = new Date('2026-10-27T10:00:00.000Z');

const lisboaToFaro: RouteRequest = {
  waypoints: [
    { id: 'w_lis', lngLat: [-9.1393, 38.7223], kind: 'stop' },
    { id: 'w_sil', lngLat: [-8.4385, 37.1889], kind: 'stop' },
    { id: 'w_far', lngLat: [-7.9304, 37.0194], kind: 'stop' },
  ],
  routing: { mode: 'road', avoid: ['tolls'] },
};

const shape = (provider: string): RouteShape => ({
  provider,
  legs: [
    {
      line: [
        [-9.1393, 38.7223],
        [-8.9, 38.3],
        [-8.4385, 37.1889],
      ],
      distanceM: 255_000,
      durationS: 13_900,
    },
    {
      line: [
        [-8.4385, 37.1889],
        [-7.9304, 37.0194],
      ],
      distanceM: 62_000,
      durationS: 3_100,
    },
  ],
});

function fakeProvider(name: 'ors' | 'osrm'): RoutingProvider {
  return { name, route: vi.fn(() => Promise.resolve(shape(name))) };
}

describe('routing API', () => {
  let dataDir: string;
  let ors: RoutingProvider;
  let osrm: RoutingProvider;
  let logs: string[];
  let app: ReturnType<typeof buildApp>;

  function start(providers: Partial<Record<'ors' | 'osrm', RoutingProvider>>) {
    app = buildApp({
      dataDir,
      logger: false,
      now: () => NOW,
      routingProviders: providers,
      routingIntervalsMs: { ors: 0, osrm: 0 },
    });
    // The app logs through Fastify; collect the info lines the router writes.
    vi.spyOn(app.log, 'info').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'tra-route-'));
    ors = fakeProvider('ors');
    osrm = fakeProvider('osrm');
    logs = [];
    start({ ors, osrm });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const post = (payload: object) => app.inject({ method: 'POST', url: '/api/route', payload });

  it('routes a car with openrouteservice and answers with the route to store', async () => {
    const response = await post(lisboaToFaro);
    expect(response.statusCode).toBe(200);
    const route = ComputedRouteSchema.parse(response.json());
    expect(route).toMatchObject({
      inputHash: computeRouteInputHash(lisboaToFaro),
      provider: 'ors',
      distanceM: 317_000,
      durationS: 17_000,
      computedAt: NOW.toISOString(),
    });
    expect(route.legs.map((leg) => [leg.fromWaypointId, leg.toWaypointId, leg.startIndex])).toEqual(
      [
        ['w_lis', 'w_sil', 0],
        ['w_sil', 'w_far', 2],
      ],
    );
    expect(ors.route).toHaveBeenCalledWith(
      {
        points: lisboaToFaro.waypoints.map((w) => w.lngLat),
        profile: 'driving',
        avoid: ['tolls'],
      },
      expect.any(AbortSignal),
    );
  });

  it('asks only once for the same points, even after a restart or a stop turned shape point', async () => {
    await post(lisboaToFaro);
    await app.close();
    start({ ors, osrm });

    const asShape = structuredClone(lisboaToFaro);
    asShape.waypoints[1]!.kind = 'shape';
    const response = await post(asShape);
    expect(response.statusCode).toBe(200);
    // A new input hash for the editor, but the same request for the router.
    expect(response.json<{ inputHash: string }>().inputHash).toBe(computeRouteInputHash(asShape));
    expect(ors.route).toHaveBeenCalledTimes(1);
    expect(logs).toContain('route cache hit (ors): driving, 3 points');
  });

  it('asks again when a point moves or "avoid" changes', async () => {
    await post(lisboaToFaro);
    expect(logs).toContain('route → ors: driving, 3 points');
    const moved = structuredClone(lisboaToFaro);
    moved.waypoints[1]!.lngLat = [-8.5, 37.2];
    await post(moved);
    await post({ ...lisboaToFaro, routing: { mode: 'road' } });
    expect(ors.route).toHaveBeenCalledTimes(3);
  });

  it('takes OSRM on request, which knows no "avoid"', async () => {
    const response = await post({ ...lisboaToFaro, router: 'osrm' });
    expect(response.json<{ provider: string }>().provider).toBe('osrm');
    expect(osrm.route).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'driving', avoid: [] }),
      expect.any(AbortSignal),
    );
    expect(ors.route).not.toHaveBeenCalled();
  });

  it('says so when the openrouteservice key is missing', async () => {
    await app.close();
    start({ osrm });
    const response = await post(lisboaToFaro);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'no_key', message: 'ORS_API_KEY is not set in .env' });
  });

  it('passes router failures on with the waypoint they concern', async () => {
    vi.mocked(ors.route).mockRejectedValueOnce(
      new RoutingError('point_not_found', 'Could not find routable point … coordinate 2', 2),
    );
    const response = await post(lisboaToFaro);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'point_not_found',
      message: 'Could not find routable point … coordinate 2',
      waypointIndex: 2,
    });

    vi.mocked(ors.route).mockRejectedValueOnce(new RoutingError('quota', 'used up'));
    expect((await post(lisboaToFaro)).statusCode).toBe(429);
    vi.mocked(ors.route).mockRejectedValueOnce(new RoutingError('unavailable', 'down'));
    expect((await post(lisboaToFaro)).statusCode).toBe(502);
  });

  it('computes flights itself, without a router', async () => {
    const response = await post({
      waypoints: [
        { id: 'vie', lngLat: [16.5697, 48.1103], kind: 'stop' },
        { id: 'opo', lngLat: [-8.6814, 41.2481], kind: 'stop' },
      ],
      routing: { mode: 'great-circle' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ provider: string }>().provider).toBe('local-great-circle');
    expect(ors.route).not.toHaveBeenCalled();
  });

  it('rejects malformed requests and GPX tracks', async () => {
    expect((await post({ waypoints: [], routing: { mode: 'road' } })).statusCode).toBe(400);
    const swapped = structuredClone(lisboaToFaro);
    swapped.waypoints[0]!.lngLat = [38.7223, -91.1393];
    expect((await post(swapped)).statusCode).toBe(400);
    const gpx = await post({ ...lisboaToFaro, routing: { mode: 'gpx' } });
    expect(gpx.statusCode).toBe(400);
    expect(gpx.json<{ message: string }>().message).toMatch(/imported file/);
  });
});
