import { describe, expect, it } from 'vitest';
import { distanceM } from '../geo/distance';
import type { LngLat } from '../geo/lngLat';
import { ComputedRouteSchema, type Track, type Waypoint } from '../model/track';
import { validateProject } from '../model/validation';
import { sampleProject } from '../testing/sampleProject';
import { assembleComputedRoute } from './assemble';
import { computeRouteInputHash, isRouteStale } from './inputHash';
import { legIndexAtSegment } from './legs';
import { computeLocalRoute, isLocalRoutingMode } from './localRoute';

const NOW = '2026-10-26T12:00:00.000Z';
const project = sampleProject();
const train = (): Track => project.groups[0]!.etappen[0]!.tracks[0]!;
const plane = (): Track => project.groups[0]!.etappen[1]!.tracks[0]!;

function waypoint(id: string, lngLat: LngLat): Waypoint {
  return { id, lngLat, name: id, kind: 'stop', source: 'manual', holdSec: 0, showLabel: true };
}

const at = (route: { geometry: LngLat[] }, index: number) => route.geometry[index];

describe('computeLocalRoute', () => {
  it('flies Vienna → Porto on a great circle, fresh for exactly this track', () => {
    const track = plane();
    const route = computeLocalRoute(track, NOW)!;
    expect(ComputedRouteSchema.safeParse(route).success).toBe(true);
    expect(route.provider).toBe('local-great-circle');
    expect(route.computedAt).toBe(NOW);
    expect(route.inputHash).toBe(computeRouteInputHash(track));
    expect(isRouteStale({ ...track, computed: route })).toBe(false);

    expect(route.geometry[0]).toEqual(track.waypoints[0]!.lngLat);
    expect(route.geometry.at(-1)).toEqual(track.waypoints[1]!.lngLat);
    expect(route.geometry.length).toBeGreaterThan(20);
    expect(route.legs).toEqual([
      {
        fromWaypointId: 'w_vie',
        toWaypointId: 'w_opo',
        startIndex: 0,
        distanceM: expect.any(Number) as number,
      },
    ]);
    const direct = distanceM(track.waypoints[0]!.lngLat, track.waypoints[1]!.lngLat);
    expect(Math.abs(route.distanceM - direct)).toBeLessThan(100);
    // Planes have no router to estimate a duration.
    expect(route.durationS).toBeUndefined();
  });

  it('stores the route in a project that still validates', () => {
    const withRoute = sampleProject();
    const track = withRoute.groups[0]!.etappen[1]!.tracks[0]!;
    track.computed = computeLocalRoute(track, NOW);
    expect(validateProject(withRoute).success).toBe(true);
  });

  it('gives a multi-stop flight one leg per hop', () => {
    const track: Track = {
      ...plane(),
      waypoints: [
        waypoint('vie', [16.5697, 48.1103]),
        waypoint('lis', [-9.1359, 38.7756]),
        waypoint('opo', [-8.6814, 41.2481]),
      ],
    };
    const route = computeLocalRoute(track, NOW)!;
    expect(route.legs.map((leg) => [leg.fromWaypointId, leg.toWaypointId])).toEqual([
      ['vie', 'lis'],
      ['lis', 'opo'],
    ]);
    expect(at(route, route.legs[1]!.startIndex)).toEqual([-9.1359, 38.7756]);
  });

  it('runs the train smoothly through its shape point and cuts the legs there', () => {
    const track = train();
    const route = computeLocalRoute(track, NOW)!;
    expect(route.provider).toBe('local-smooth');
    expect(route.legs).toHaveLength(2);
    expect(at(route, route.legs[1]!.startIndex)).toEqual(track.waypoints[1]!.lngLat);
    expect(route.geometry.length).toBeGreaterThan(track.waypoints.length);
    expect(route.geometry.at(-1)).toEqual(track.waypoints[2]!.lngLat);
  });

  it('joins the points with straight lines for "straight"', () => {
    const track: Track = { ...train(), routing: { mode: 'straight' } };
    const route = computeLocalRoute(track, NOW)!;
    expect(route.provider).toBe('local-straight');
    expect(route.geometry).toEqual(track.waypoints.map((w) => w.lngLat));
    expect(route.legs.map((leg) => leg.startIndex)).toEqual([0, 1]);
  });

  it('leaves router modes, GPX and unfinished tracks alone', () => {
    const car = project.groups[1]!.etappen[0]!.tracks[0]!;
    expect(computeLocalRoute(car, NOW)).toBeUndefined();
    expect(computeLocalRoute({ ...car, routing: { mode: 'gpx' } }, NOW)).toBeUndefined();
    expect(computeLocalRoute({ ...plane(), waypoints: plane().waypoints.slice(0, 1) }, NOW)).toBe(
      undefined,
    );
    expect(isLocalRoutingMode('smooth')).toBe(true);
    expect(isLocalRoutingMode('road')).toBe(false);
  });
});

describe('assembleComputedRoute', () => {
  const track = {
    routing: { mode: 'road' as const },
    waypoints: [waypoint('a', [0, 0]), waypoint('b', [0.1, 0]), waypoint('c', [0.2, 0])],
  };

  it('needs one leg per pair of waypoints', () => {
    expect(() => assembleComputedRoute(track, { provider: 'x', legs: [] }, NOW)).toThrow(
      RangeError,
    );
    expect(() =>
      assembleComputedRoute(track, { provider: 'x', legs: [{ line: [] }, { line: [] }] }, NOW),
    ).toThrow(/no points/);
  });

  it('adds up distance and duration, simplifies each leg and keeps the boundaries', () => {
    const route = assembleComputedRoute(
      track,
      {
        provider: 'ors',
        legs: [
          {
            line: [
              [0, 0],
              [0.05, 0],
              [0.1, 0],
            ],
            distanceM: 12_000,
            durationS: 600,
          },
          {
            line: [
              [0.1, 0],
              [0.15, 0.0000001],
              [0.2, 0],
            ],
            distanceM: 11_500,
            durationS: 540,
          },
        ],
      },
      NOW,
    );
    // The straight middle points go; the waypoint in between stays and is stored once.
    expect(route.geometry).toEqual([
      [0, 0],
      [0.1, 0],
      [0.2, 0],
    ]);
    expect(route.legs.map((leg) => leg.startIndex)).toEqual([0, 1]);
    expect(route.distanceM).toBe(23_500);
    expect(route.durationS).toBe(1_140);
  });

  it('leaves out the total duration when a leg has none, and measures missing distances', () => {
    const route = assembleComputedRoute(
      { ...track, waypoints: track.waypoints.slice(0, 2) },
      {
        provider: 'x',
        legs: [
          {
            line: [
              [0, 0],
              [0.1, 0],
            ],
          },
        ],
      },
      NOW,
    );
    expect(route.durationS).toBeUndefined();
    expect(route).not.toHaveProperty('durationS');
    expect(route.legs[0]!.distanceM).toBeCloseTo(distanceM([0, 0], [0.1, 0]), 6);
  });

  it('keeps a gap when a leg does not start where the last one ended', () => {
    const route = assembleComputedRoute(
      track,
      {
        provider: 'x',
        legs: [
          {
            line: [
              [0, 0],
              [0.1, 0],
            ],
          },
          {
            line: [
              [0.1001, 0],
              [0.2, 0],
            ],
          },
        ],
      },
      NOW,
    );
    expect(route.geometry).toHaveLength(4);
    expect(route.legs[1]!.startIndex).toBe(2);
  });

  it('rounds to six decimals and makes a line of a single point', () => {
    const route = assembleComputedRoute(
      { ...track, waypoints: [waypoint('a', [1, 1]), waypoint('b', [1, 1])] },
      { provider: 'x', legs: [{ line: [[1.123456789, 1.987654321]] }] },
      NOW,
    );
    expect(route.geometry).toEqual([
      [1.123457, 1.987654],
      [1.123457, 1.987654],
    ]);
  });
});

describe('legIndexAtSegment', () => {
  const route = {
    legs: [{ startIndex: 0 }, { startIndex: 4 }, { startIndex: 9 }].map((leg, i) => ({
      ...leg,
      fromWaypointId: `${i}`,
      toWaypointId: `${i + 1}`,
      distanceM: 0,
    })),
  };

  it('finds the leg a segment of the line belongs to', () => {
    expect(legIndexAtSegment(route, 0)).toBe(0);
    expect(legIndexAtSegment(route, 3)).toBe(0);
    expect(legIndexAtSegment(route, 4)).toBe(1);
    expect(legIndexAtSegment(route, 12)).toBe(2);
  });
});
