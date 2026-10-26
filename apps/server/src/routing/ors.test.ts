import { describe, expect, it, vi } from 'vitest';
import { createOrsProvider } from './ors';
import { RoutingError } from './provider';

// Shaped like a real answer for Lisboa → Silves → Faro (2026-10-27), with a short geometry.
const answer = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-9.139301, 38.722306],
          [-8.9, 38.3],
          [-8.438562, 37.189062],
          [-8.2, 37.1],
          [-7.930383, 37.019602],
        ],
      },
      properties: {
        segments: [
          { distance: 255394.6, duration: 13914.6, steps: [] },
          { distance: 62101.9, duration: 3094, steps: [] },
        ],
        way_points: [0, 2, 4],
        summary: { distance: 317496.5, duration: 17008.6 },
      },
    },
  ],
};

const points: [number, number][] = [
  [-9.1393, 38.7223],
  [-8.4385, 37.1889],
  [-7.9304, 37.0194],
];

function orsReturning(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetch = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers })),
  );
  const onQuota = vi.fn();
  const provider = createOrsProvider({
    apiKey: 'test-key',
    userAgent: 'tests',
    fetch: fetch as unknown as typeof globalThis.fetch,
    onQuota,
  });
  return { provider, fetch, onQuota };
}

async function failure(promise: Promise<unknown>): Promise<RoutingError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(RoutingError);
  return error as RoutingError;
}

describe('openrouteservice provider', () => {
  it('asks for a car route with the key, avoid options and segments', async () => {
    const { provider, fetch } = orsReturning(answer);
    await provider.route({ points, profile: 'driving', avoid: ['tolls', 'highways'] });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url.href).toBe('https://api.openrouteservice.org/v2/directions/driving-car/geojson');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('test-key');
    expect(JSON.parse(init?.body as string)).toEqual({
      coordinates: points,
      instructions: true,
      options: { avoid_features: ['tollways', 'highways'] },
    });
  });

  it('cuts the line into legs at the waypoints, with distance and duration', async () => {
    const { provider } = orsReturning(answer);
    const shape = await provider.route({ points, profile: 'driving', avoid: [] });
    expect(shape).toEqual({
      provider: 'ors',
      legs: [
        {
          line: [
            [-9.139301, 38.722306],
            [-8.9, 38.3],
            [-8.438562, 37.189062],
          ],
          distanceM: 255394.6,
          durationS: 13914.6,
        },
        {
          line: [
            [-8.438562, 37.189062],
            [-8.2, 37.1],
            [-7.930383, 37.019602],
          ],
          distanceM: 62101.9,
          durationS: 3094,
        },
      ],
    });
  });

  it('uses the walking and hiking profiles and avoids nothing off the road', async () => {
    const { provider, fetch } = orsReturning(answer);
    await provider.route({ points, profile: 'hiking', avoid: ['tolls'] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.pathname).toBe('/v2/directions/foot-hiking/geojson');
    expect(JSON.parse(init?.body as string)).not.toHaveProperty('options');
  });

  it('reports the remaining quota from the headers', async () => {
    const { provider, onQuota } = orsReturning(answer, 200, {
      'x-ratelimit-limit': '200',
      'x-ratelimit-remaining': '197',
    });
    await provider.route({ points, profile: 'driving', avoid: [] });
    expect(onQuota).toHaveBeenCalledWith(197, 200);
  });

  it('names the waypoint that is too far from a road', async () => {
    const { provider } = orsReturning(
      {
        error: {
          code: 2010,
          message:
            'Could not find routable point within a radius of 350.0 meters of specified coordinate 1: -10.5000000 38.0000000.',
        },
      },
      404,
    );
    const error = await failure(provider.route({ points, profile: 'driving', avoid: [] }));
    expect(error.kind).toBe('point_not_found');
    expect(error.waypointIndex).toBe(1);
  });

  it('tells the kinds of failure apart', async () => {
    const cases: [unknown, number, string][] = [
      [{ error: { code: 2009, message: 'Route could not be found' } }, 404, 'no_route'],
      [
        { error: { code: 2004, message: 'distance must not be greater than 6000000.0 meters' } },
        400,
        'too_long',
      ],
      [{ error: 'Rate limit exceeded' }, 429, 'quota'],
      [{ error: 'Access to this API has been disallowed' }, 403, 'key_rejected'],
      [{ error: { code: 2099, message: 'Unknown internal error' } }, 500, 'unavailable'],
      ['<html>Bad gateway</html>', 502, 'unavailable'],
    ];
    for (const [body, status, kind] of cases) {
      const { provider } = orsReturning(body, status);
      const error = await failure(provider.route({ points, profile: 'driving', avoid: [] }));
      expect(error.kind).toBe(kind);
    }
  });

  it('treats an answer for other points as unavailable', async () => {
    const twoPoints = structuredClone(answer);
    twoPoints.features[0]!.properties.way_points = [0, 4];
    const { provider } = orsReturning(twoPoints);
    expect((await failure(provider.route({ points, profile: 'driving', avoid: [] }))).kind).toBe(
      'unavailable',
    );
  });

  it('turns a network failure into "unavailable" but passes a cancel through', async () => {
    const provider = createOrsProvider({
      apiKey: 'k',
      userAgent: 'tests',
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect((await failure(provider.route({ points, profile: 'driving', avoid: [] }))).kind).toBe(
      'unavailable',
    );

    const controller = new AbortController();
    controller.abort();
    const cancelled = createOrsProvider({
      apiKey: 'k',
      userAgent: 'tests',
      fetch: () => Promise.reject(new DOMException('aborted', 'AbortError')),
    });
    await expect(
      cancelled.route({ points, profile: 'driving', avoid: [] }, controller.signal),
    ).rejects.toThrow(DOMException);
  });
});
