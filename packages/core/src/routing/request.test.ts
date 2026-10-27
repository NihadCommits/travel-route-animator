import { describe, expect, it } from 'vitest';
import { MAX_ROUTE_WAYPOINTS, RouteFailureSchema, RouteRequestSchema } from './request';

const waypoint = (i: number) => ({
  id: `w${i}`,
  lngLat: [i * 0.01, 38] as [number, number],
  kind: 'stop',
});

describe('RouteRequestSchema', () => {
  it('takes the route-relevant parts of the waypoints and an optional router', () => {
    const request = {
      waypoints: [waypoint(0), { ...waypoint(1), kind: 'shape' }],
      routing: { mode: 'road', avoid: ['tolls'] },
      router: 'osrm',
    };
    expect(RouteRequestSchema.parse(request)).toEqual(request);
  });

  it('needs two to 50 points and nothing a route does not depend on', () => {
    const routing = { mode: 'road' };
    expect(RouteRequestSchema.safeParse({ waypoints: [waypoint(0)], routing }).success).toBe(false);
    const many = Array.from({ length: MAX_ROUTE_WAYPOINTS + 1 }, (_, i) => waypoint(i));
    expect(RouteRequestSchema.safeParse({ waypoints: many, routing }).success).toBe(false);
    const named = { waypoints: [{ ...waypoint(0), name: 'Lisboa' }, waypoint(1)], routing };
    expect(RouteRequestSchema.safeParse(named).success).toBe(false);
  });
});

describe('RouteFailureSchema', () => {
  it('reads the error answers of the server', () => {
    expect(
      RouteFailureSchema.parse({ error: 'point_not_found', message: '…', waypointIndex: 1 }),
    ).toEqual({ error: 'point_not_found', message: '…', waypointIndex: 1 });
    expect(RouteFailureSchema.safeParse({ error: 'teapot', message: '' }).success).toBe(false);
  });
});
