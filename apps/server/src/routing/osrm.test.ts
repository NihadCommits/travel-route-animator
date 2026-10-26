import { describe, expect, it, vi } from 'vitest';
import { createOsrmProvider } from './osrm';
import { RoutingError } from './provider';

// Shaped like a real answer of routing.openstreetmap.de for Lisboa → Silves → Faro (2026-10-27).
const answer = {
  code: 'Ok',
  routes: [
    {
      distance: 314140.6,
      duration: 13215.4,
      legs: [
        {
          distance: 251971.4,
          duration: 10351.6,
          steps: [
            {
              geometry: {
                coordinates: [
                  [-9.139301, 38.722306],
                  [-8.9, 38.3],
                ],
              },
            },
            {
              geometry: {
                coordinates: [
                  [-8.9, 38.3],
                  [-8.438562, 37.189062],
                ],
              },
            },
            // The arrival step is a single point.
            {
              geometry: {
                coordinates: [
                  [-8.438562, 37.189062],
                  [-8.438562, 37.189062],
                ],
              },
            },
          ],
        },
        {
          distance: 62169.2,
          duration: 2863.8,
          steps: [
            {
              geometry: {
                coordinates: [
                  [-8.438562, 37.189062],
                  [-7.930384, 37.019602],
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};

const points: [number, number][] = [
  [-9.1393, 38.7223],
  [-8.4385, 37.1889],
  [-7.9304, 37.0194],
];

function osrmReturning(body: unknown, status = 200) {
  const fetch = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  const provider = createOsrmProvider({
    userAgent: 'travel-route-animator (tests)',
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { provider, fetch };
}

describe('OSRM provider', () => {
  it('asks the FOSSGIS server per profile, with steps, and sends the User-Agent', async () => {
    const { provider, fetch } = osrmReturning(answer);
    await provider.route({ points, profile: 'cycling', avoid: ['tolls'] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url.origin + url.pathname).toBe(
      'https://routing.openstreetmap.de/routed-bike/route/v1/driving/-9.1393,38.7223;-8.4385,37.1889;-7.9304,37.0194',
    );
    expect(url.searchParams.get('steps')).toBe('true');
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe(
      'travel-route-animator (tests)',
    );
  });

  it('builds each leg from its steps, without doubled points', async () => {
    const { provider } = osrmReturning(answer);
    const shape = await provider.route({ points, profile: 'driving', avoid: [] });
    expect(shape).toEqual({
      provider: 'osrm',
      legs: [
        {
          line: [
            [-9.139301, 38.722306],
            [-8.9, 38.3],
            [-8.438562, 37.189062],
          ],
          distanceM: 251971.4,
          durationS: 10351.6,
        },
        {
          line: [
            [-8.438562, 37.189062],
            [-7.930384, 37.019602],
          ],
          distanceM: 62169.2,
          durationS: 2863.8,
        },
      ],
    });
  });

  it('tells the kinds of failure apart', async () => {
    const cases: [unknown, number, string][] = [
      [{ code: 'NoRoute', message: 'Impossible route between points' }, 400, 'no_route'],
      [{ code: 'NoSegment', message: 'Could not find a matching segment' }, 400, 'point_not_found'],
      [{ code: 'TooBig', message: 'Too many coordinates' }, 400, 'too_long'],
      [{ message: 'Too many requests' }, 429, 'quota'],
      [{ code: 'Ok', routes: [] }, 200, 'unavailable'],
      ['<html>maintenance</html>', 503, 'unavailable'],
    ];
    for (const [body, status, kind] of cases) {
      const { provider } = osrmReturning(body, status);
      const error = await provider.route({ points, profile: 'driving', avoid: [] }).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(RoutingError);
      expect((error as RoutingError).kind).toBe(kind);
    }
  });
});
