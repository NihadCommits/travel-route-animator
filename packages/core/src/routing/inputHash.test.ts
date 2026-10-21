import { describe, expect, it } from 'vitest';
import type { Track } from '../model/track';
import { clone, sampleProject } from '../testing/sampleProject';
import { canonicalJson } from './canonicalJson';
import { computeRouteInputHash, isRouteStale } from './inputHash';

const carTrack = (): Track => sampleProject().groups[1]!.etappen[0]!.tracks[0]!;

describe('canonicalJson', () => {
  it('sorts object keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('keeps array order, because waypoint order matters', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('drops undefined fields like JSON.stringify', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('computeRouteInputHash', () => {
  it('is a SHA-256 hex string', () => {
    expect(computeRouteInputHash(carTrack())).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not depend on the order in which fields were written', () => {
    const track = carTrack();
    const reordered = {
      waypoints: track.waypoints.map((w) => ({
        showLabel: w.showLabel,
        kind: w.kind,
        lngLat: w.lngLat,
        id: w.id,
        name: w.name,
        source: w.source,
        holdSec: w.holdSec,
      })),
      routing: { avoid: track.routing.avoid, mode: track.routing.mode },
    } as Pick<Track, 'waypoints' | 'routing'>;
    expect(computeRouteInputHash(reordered)).toBe(computeRouteInputHash(track));
  });

  it('changes when a waypoint moves', () => {
    const track = carTrack();
    const moved = clone(track);
    moved.waypoints[1]!.lngLat = [-9.14, 38.72];
    expect(computeRouteInputHash(moved)).not.toBe(computeRouteInputHash(track));
  });

  it('changes when a waypoint switches between stop and shape point', () => {
    const track = carTrack();
    track.waypoints.splice(1, 0, {
      id: 'w_mid',
      lngLat: [-8.9, 40.2],
      name: 'Coimbra',
      kind: 'stop',
      source: 'manual',
      holdSec: 0,
      showLabel: true,
    });
    const asShape = clone(track);
    asShape.waypoints[1]!.kind = 'shape';
    expect(computeRouteInputHash(asShape)).not.toBe(computeRouteInputHash(track));
  });

  it('changes with the routing mode and the avoid list', () => {
    const track = carTrack();
    const straight = { ...clone(track), routing: { mode: 'straight' as const } };
    const noHighways = {
      ...clone(track),
      routing: { mode: 'road' as const, avoid: ['highways' as const] },
    };
    expect(computeRouteInputHash(straight)).not.toBe(computeRouteInputHash(track));
    expect(computeRouteInputHash(noHighways)).not.toBe(computeRouteInputHash(track));
  });

  it('ignores the order and duplicates of avoid, and treats a missing list as empty', () => {
    const base = carTrack();
    const a = { ...base, routing: { mode: 'road' as const, avoid: ['tolls', 'ferries'] as const } };
    const b = {
      ...base,
      routing: { mode: 'road' as const, avoid: ['ferries', 'tolls', 'tolls'] as const },
    };
    expect(
      computeRouteInputHash({ ...a, routing: { ...a.routing, avoid: [...a.routing.avoid] } }),
    ).toBe(computeRouteInputHash({ ...b, routing: { ...b.routing, avoid: [...b.routing.avoid] } }));
    const none = { ...base, routing: { mode: 'road' as const } };
    const empty = { ...base, routing: { mode: 'road' as const, avoid: [] } };
    expect(computeRouteInputHash(none)).toBe(computeRouteInputHash(empty));
  });

  it('ignores names, holds, labels and IDs, which do not change the route', () => {
    const track = carTrack();
    const renamed = clone(track);
    Object.assign(renamed.waypoints[0]!, {
      name: 'Porto (Hotel)',
      holdSec: 3,
      showLabel: false,
      id: 'w_other',
    });
    expect(computeRouteInputHash(renamed)).toBe(computeRouteInputHash(track));
  });
});

describe('isRouteStale', () => {
  it('is stale when no route has been computed yet', () => {
    expect(isRouteStale(carTrack())).toBe(true);
  });

  it('is fresh while the stored hash matches and stale once a waypoint moves', () => {
    const track = carTrack();
    track.computed = {
      inputHash: computeRouteInputHash(track),
      geometry: track.waypoints.map((w) => w.lngLat),
      legs: [],
      distanceM: 313_000,
      provider: 'test',
      computedAt: '2026-10-21T08:00:00.000Z',
    };
    expect(isRouteStale(track)).toBe(false);

    track.waypoints[1]!.lngLat = [-9.2, 38.7];
    expect(isRouteStale(track)).toBe(true);
  });
});
