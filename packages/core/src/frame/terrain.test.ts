import { describe, expect, it } from 'vitest';
import type { LngLat } from '../geo/lngLat';
import type { Etappe } from '../model/etappe';
import type { Project } from '../model/project';
import type { RouteElevation } from '../model/track';
import { refreshLocalRoutes } from '../routing/refresh';
import { trip, type TripOptions } from '../testing/trip';
import { compileTimeline, mapOptionsOf } from '../timeline/compileTimeline';
import { compileSequence } from '../timeline/sequence';
import { computeFrameState } from './computeFrameState';

// 3D terrain and heights in the timeline and the frames (ADR 0012).

const innsbruck: LngLat = [11.35, 47.26];
const vienna: LngLat = [16.57, 48.11];
const hut: LngLat = [11.4, 47.3];

/** The trip with every route computed, the stage changed by `edit`, and heights per track. */
function stage(
  options: TripOptions,
  edit: (etappe: Etappe) => Etappe,
  heights: Record<number, RouteElevation> = {},
): { project: Project; etappeId: string; trackIds: string[] } {
  const made = trip(options);
  const fresh = refreshLocalRoutes(made.project, made.project.updatedAt);
  const group = fresh.groups[0]!;
  const etappe = edit(group.etappen[0]!);
  const tracks = etappe.tracks.map((track, i) =>
    heights[i] ? { ...track, computed: { ...track.computed!, elevation: heights[i] } } : track,
  );
  return {
    ...made,
    project: { ...fresh, groups: [{ ...group, etappen: [{ ...etappe, tracks }] }] },
  };
}

const withTerrain =
  (exaggeration: number) =>
  (etappe: Etappe): Etappe => ({
    ...etappe,
    view: { ...etappe.view, terrain: { enabled: true, exaggeration } },
  });

const flight: TripOptions = {
  durationSec: 10,
  tracks: [
    {
      vehicle: 'plane',
      points: [
        ['INN', innsbruck],
        ['VIE', vienna],
      ],
    },
  ],
  view: { mode: '3d-tilted', pitchDeg: 50 },
};

describe('map options', () => {
  it('collect what a stage adds to its map style', () => {
    const { project, etappeId } = stage(flight, (e) => e);
    const etappe = project.groups[0]!.etappen[0]!;
    expect(mapOptionsOf(etappe)).toEqual({
      buildings3d: false,
      satelliteMix: false,
      terrain: undefined,
    });
    expect(mapOptionsOf(withTerrain(1.5)(etappe)).terrain).toEqual({ exaggeration: 1.5 });
    const arriving = {
      ...etappe,
      outro: { type: 'arrival-3d' as const, durationSec: 3, pitchDeg: 60, orbitDeg: 90 },
    };
    expect(mapOptionsOf(arriving).buildings3d).toBe(true);
    const terrain = stage(flight, withTerrain(1.5));
    expect(compileTimeline(project, etappeId).mapStyleKey).not.toBe(
      compileTimeline(terrain.project, terrain.etappeId).mapStyleKey,
    );
  });

  it('make a chained stage with other options dip while the map is rebuilt', () => {
    const { project, etappeId } = stage(flight, (e) => e);
    const group = project.groups[0]!;
    const first = group.etappen[0]!;
    // Same style, but the first stage ends with a 3D arrival that forces buildings.
    const arriving: Etappe = {
      ...first,
      outro: { type: 'arrival-3d', durationSec: 2, pitchDeg: 60, orbitDeg: 45 },
    };
    const second: Etappe = { ...first, id: 'e_second' };
    const chained: Project = {
      ...project,
      defaults: { ...project.defaults, transition: { type: 'camera-fly', durationSec: 1 } },
      groups: [{ ...group, etappen: [arriving, second] }],
    };
    expect(compileSequence(chained, [etappeId, 'e_second']).gaps[0]!.styleChanges).toBe(true);
    const plain: Project = { ...chained, groups: [{ ...group, etappen: [first, second] }] };
    expect(compileSequence(plain, [etappeId, 'e_second']).gaps[0]!.styleChanges).toBe(false);
  });
});

describe('flights over 3D terrain', () => {
  const heights = { 0: { source: 'dem' as const, stepM: 20, elevationsM: [580, 180] } };

  it('take off and land at the ground, exaggerated like the terrain', () => {
    const { project, etappeId } = stage(flight, withTerrain(2), heights);
    const timeline = compileTimeline(project, etappeId);
    const start = computeFrameState(timeline, 0).tracks[0]!;
    const end = computeFrameState(timeline, timeline.durationInFrames - 1).tracks[0]!;
    expect(start.head.altitudeM).toBeCloseTo(1160, 6);
    expect(end.head.altitudeM).toBeCloseTo(360, 6);
    // The arc starts at the runway too.
    expect(start.flight!.revealedAltitudesM[0]).toBeCloseTo(1160, 6);
  });

  it('stay at the plain heights on a flat map and in views from above', () => {
    const level = stage(flight, (e) => e, heights);
    const flat = compileTimeline(level.project, level.etappeId);
    expect(computeFrameState(flat, 0).tracks[0]!.head.altitudeM).toBe(0);

    const above = stage({ ...flight, view: { mode: '2d', pitchDeg: 0 } }, withTerrain(2), heights);
    const timeline = compileTimeline(above.project, above.etappeId);
    // The fake 3D lifts the plane on screen by its height above the ground only.
    expect(computeFrameState(timeline, 0).tracks[0]!.head.altitudeM).toBe(0);
  });

  it('take the ground as sea level while the route has no heights', () => {
    const { project, etappeId } = stage(flight, withTerrain(2));
    const timeline = compileTimeline(project, etappeId);
    expect(computeFrameState(timeline, 0).tracks[0]!.head.altitudeM).toBe(0);
  });
});

describe('the height profile in the frames', () => {
  const hike: TripOptions = {
    durationSec: 10,
    tracks: [
      {
        vehicle: 'hike',
        points: [
          ['Hall', innsbruck],
          ['Hütte', hut],
        ],
      },
    ],
  };
  const showProfile = (etappe: Etappe): Etappe => ({
    ...etappe,
    overlays: { ...etappe.overlays, elevationProfile: true },
  });

  it('reads height and metres climbed where the hiker is', () => {
    const plain = stage(hike, showProfile);
    const count = 200;
    // Straight up 1000 m over the whole way.
    const elevationsM = Array.from({ length: count }, (_, i) => 600 + (1000 * i) / (count - 1));
    const lengthM = compileTimeline(plain.project, plain.etappeId).tracks[0]!.line.lengthM;
    const stepM = lengthM / (count - 1);
    const { project, etappeId, trackIds } = stage(hike, showProfile, {
      0: { source: 'dem', stepM, elevationsM },
    });

    const timeline = compileTimeline(project, etappeId);
    expect(timeline.elevation?.trackId).toBe(trackIds[0]);
    const first = computeFrameState(timeline, 0).elevation!;
    const last = computeFrameState(timeline, timeline.durationInFrames - 1).elevation!;
    expect(first.atM).toBe(0);
    expect(first.gainM).toBe(0);
    expect(last.atM).toBeCloseTo(lengthM, 6);
    expect(last.gainM).toBeGreaterThan(990);
    expect(last.gainM).toBeLessThan(1001);
    expect(last.lossM).toBe(0);
  });

  it('shows nothing without the overlays or without heights', () => {
    const plain = stage(hike, (e) => e, { 0: { source: 'dem', stepM: 20, elevationsM: [0, 1] } });
    expect(compileTimeline(plain.project, plain.etappeId).elevation).toBeUndefined();
    const missing = stage(hike, showProfile);
    const timeline = compileTimeline(missing.project, missing.etappeId);
    expect(timeline.elevation).toBeUndefined();
    expect(computeFrameState(timeline, 0).elevation).toBeUndefined();
  });
});
