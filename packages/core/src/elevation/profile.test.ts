import { describe, expect, it } from 'vitest';
import { measureLine } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import { refreshLocalRoutes } from '../routing/refresh';
import { trip } from '../testing/trip';
import {
  climbAndDescent,
  compileProfile,
  elevationAt,
  elevationSampleCount,
  elevationSamplePoints,
  elevationStepFor,
  MAX_ELEVATION_SAMPLES,
  profileTrackOf,
  readProfile,
  toElevationRequest,
  tracksAwaitingElevation,
} from './profile';

describe('where the samples lie', () => {
  it('takes 20 m steps on short routes and wider ones on long drives', () => {
    expect(elevationStepFor(5_000)).toBe(20);
    expect(elevationStepFor(400_000)).toBeCloseTo(400_000 / (MAX_ELEVATION_SAMPLES - 1), 6);
    expect(elevationSampleCount(400_000, elevationStepFor(400_000))).toBe(MAX_ELEVATION_SAMPLES);
  });

  it('puts one sample every step and the last one at the very end', () => {
    expect(elevationSampleCount(100, 20)).toBe(6);
    expect(elevationSampleCount(110, 20)).toBe(7);
    expect(elevationSampleCount(5, 20)).toBe(2);
    const line = measureLine([
      [13, 47],
      [13.001, 47],
    ]);
    const points = elevationSamplePoints(line, 20);
    expect(points).toHaveLength(elevationSampleCount(line.lengthM, 20));
    expect(points[0]).toEqual([13, 47]);
    expect(points.at(-1)).toEqual([13.001, 47]);
  });

  it('reads the height between two samples, the shorter last step included', () => {
    const elevation = { source: 'dem' as const, stepM: 20, elevationsM: [0, 20, 40, 50] };
    // Samples at 0, 20, 40 and the end at 50 m.
    expect(elevationAt(elevation, 50, 10)).toBe(10);
    expect(elevationAt(elevation, 50, 45)).toBe(45);
    expect(elevationAt(elevation, 50, 50)).toBe(50);
    expect(elevationAt(elevation, 50, -5)).toBe(0);
    expect(elevationAt(elevation, 50, 99)).toBe(50);
  });
});

describe('climbAndDescent', () => {
  it('counts real climbs and descents', () => {
    const { gainM, lossM } = climbAndDescent([500, 600, 700, 650, 900], 3);
    expect(gainM.at(-1)).toBe(450);
    expect(lossM.at(-1)).toBe(50);
    expect(gainM).toEqual([0, 100, 200, 200, 450]);
  });

  it('lets wobbles below the threshold cancel out', () => {
    const wobbly = Array.from({ length: 100 }, (_, i) => 1000 + (i % 2 === 0 ? 0 : 2));
    const { gainM, lossM } = climbAndDescent(wobbly, 3);
    expect(gainM.at(-1)).toBe(0);
    expect(lossM.at(-1)).toBe(0);
    // Without a threshold every wobble would count: 50 × 2 m up.
    expect(climbAndDescent(wobbly, 0.1).gainM.at(-1)).toBe(100);
  });
});

describe('compileProfile and readProfile', () => {
  it('smooths, finds the range and counts along the way', () => {
    // 2 km climbing 1 m per 10 m with a ±4 m wobble on every second sample.
    const raw = Array.from({ length: 101 }, (_, i) => 500 + i * 2 + (i % 2 === 0 ? 4 : -4));
    const profile = compileProfile({ source: 'dem', stepM: 20, elevationsM: raw }, 2000);
    expect(profile.minM).toBeGreaterThanOrEqual(500);
    expect(profile.maxM).toBeLessThanOrEqual(704);
    // The wobble is gone: the climb is the 200 m of the slope, not 200 m plus 100 wobbles.
    expect(profile.gainM.at(-1)).toBeGreaterThan(185);
    expect(profile.gainM.at(-1)).toBeLessThan(205);
    expect(profile.lossM.at(-1)).toBe(0);

    const half = readProfile(profile, 1000);
    expect(half.atM).toBe(1000);
    expect(Math.abs(half.elevationM - 600)).toBeLessThan(2);
    expect(half.gainM).toBeGreaterThan(90);
    expect(half.gainM).toBeLessThan(105);
    expect(readProfile(profile, 5000).atM).toBe(2000);
  });
});

describe('which tracks get heights', () => {
  const salzburg: LngLat = [13.04, 47.81];
  const gaisberg: LngLat = [13.11, 47.8];
  const vienna: LngLat = [16.37, 48.21];

  function stage(follow?: 'plane' | 'hike') {
    const { project, trackIds } = trip({
      tracks: [
        {
          vehicle: 'plane',
          points: [
            ['SZG', salzburg],
            ['VIE', vienna],
          ],
        },
        {
          vehicle: 'hike',
          points: [
            ['Start', salzburg],
            ['Gaisberg', gaisberg],
          ],
        },
      ],
      camera: follow ? { mode: 'follow' } : {},
    });
    const fresh = refreshLocalRoutes(project, project.updatedAt);
    const etappe = fresh.groups[0]!.etappen[0]!;
    const [planeId, hikeId] = trackIds as [string, string];
    const followed = follow === 'plane' ? planeId : hikeId;
    return {
      etappe: {
        ...etappe,
        view: { ...etappe.view, camera: { ...etappe.view.camera, followTrackId: followed } },
      },
      planeId,
      hikeId,
    };
  }

  it('profiles the followed track, but never a plane', () => {
    const hiking = stage('hike');
    expect(profileTrackOf(hiking.etappe)?.id).toBe(hiking.hikeId);
    const flying = stage('plane');
    expect(profileTrackOf(flying.etappe)?.id).toBe(flying.hikeId);
  });

  it('asks for the profile track with the overlays, and for planes on 3D terrain', () => {
    const { etappe, planeId, hikeId } = stage('hike');
    expect(tracksAwaitingElevation(etappe)).toEqual([]);
    const profiled = {
      ...etappe,
      overlays: {
        ...etappe.overlays,
        widgets: [
          {
            id: 'w_profile',
            kind: 'elevationProfile' as const,
            anchor: 'bottom-left' as const,
            dx: 48,
            dy: 44,
            scale: 1,
            transition: 'none' as const,
          },
        ],
      },
    };
    expect(tracksAwaitingElevation(profiled).map((t) => t.id)).toEqual([hikeId]);
    const terrain = {
      ...profiled,
      view: { ...profiled.view, terrain: { enabled: true, exaggeration: 1.5 } },
    };
    expect(tracksAwaitingElevation(terrain).map((t) => t.id)).toEqual([planeId, hikeId]);

    // Once a route has heights, nothing is asked again.
    const withHeights = {
      ...terrain,
      tracks: terrain.tracks.map((track) => ({
        ...track,
        computed: {
          ...track.computed!,
          elevation: { source: 'dem' as const, stepM: 20, elevationsM: [0, 0] },
        },
      })),
    };
    expect(tracksAwaitingElevation(withHeights)).toEqual([]);
  });

  it('asks along the stored geometry, with the step for its length', () => {
    const { etappe, hikeId } = stage('hike');
    const hike = etappe.tracks.find((track) => track.id === hikeId)!;
    const request = toElevationRequest(hike)!;
    expect(request.line).toEqual(hike.computed!.geometry);
    expect(request.stepM).toBe(20);
    const { computed: _computed, ...unrouted } = hike;
    expect(toElevationRequest(unrouted)).toBeUndefined();
  });
});
