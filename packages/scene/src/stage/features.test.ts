import {
  compileTimeline,
  computeFrameState,
  createEtappe,
  createProject,
  createTrack,
  createWaypoint,
  VEHICLE_TYPES,
  type Etappe,
  type Project,
  type Track,
  type VehicleIcon,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { iconId, iconSvg, ROTATES } from '../vehicles/icons';
import { sceneFeatures } from './features';

type View = Pick<Etappe['view'], 'mode' | 'pitchDeg'>;

/** A stage of these tracks; without a view, it is seen from straight above. */
function stage(
  tracks: Track[],
  view: View = { mode: '2d', pitchDeg: 0 },
): { project: Project; etappeId: string } {
  const etappe = createEtappe({ name: 'Test', tracks, durationSec: 10 });
  const project = createProject('Trip');
  const seen = { ...etappe, view: { ...etappe.view, ...view } };
  return {
    project: { ...project, groups: [{ id: 'g', name: 'G', etappen: [seen] }] },
    etappeId: etappe.id,
  };
}

function track(vehicleType: Track['vehicle']['type'], style: Partial<Track['style']> = {}): Track {
  const base = createTrack({
    vehicleType,
    waypoints: [
      createWaypoint({ name: 'Porto', lngLat: [-8.61, 41.15] }),
      createWaypoint({ name: 'Lisboa', lngLat: [-9.14, 38.72] }),
    ],
  });
  return { ...base, routing: { mode: 'straight' }, style: { ...base.style, ...style } };
}

function featuresAt(tracks: Track[], frame: number, view?: View) {
  const { project, etappeId } = stage(tracks, view);
  const timeline = compileTimeline(project, etappeId);
  return sceneFeatures(timeline, computeFrameState(timeline, frame));
}

describe('sceneFeatures', () => {
  it('draws the driven line and a turned vehicle icon in the track colour', () => {
    const features = featuresAt(
      [track('car', { lineColor: '#E4572E', ahead: { opacity: 0, dash: 'solid' } })],
      100,
    );
    const [route] = features.routes.features;
    expect(route!.properties).toEqual({
      color: '#E4572E',
      width: 6,
      dash: 'solid',
      opacity: 1,
      glow: false,
    });
    const [vehicle] = features.vehicles.features;
    expect(vehicle!.properties.icon).toBe('vehicle:car:#e4572e');
    // Lisboa lies south-south-west of Porto.
    expect(vehicle!.properties.bearing).toBeGreaterThan(180);
    expect(vehicle!.properties.bearing).toBeLessThan(200);
    expect(vehicle!.geometry.coordinates).toEqual(route!.geometry.coordinates.at(-1));
    expect(features.ahead.features).toEqual([]);
  });

  it('keeps the disc of a walker upright and draws the route ahead in its own look', () => {
    const features = featuresAt(
      [track('walk', { glow: true, ahead: { opacity: 0.6, dash: 'dotted' } })],
      50,
    );
    expect(features.vehicles.features[0]!.properties.bearing).toBe(0);
    const [ahead] = features.ahead.features;
    expect(ahead!.properties).toMatchObject({ dash: 'dotted', opacity: 0.6, glow: false });
    expect(features.routes.features[0]!.properties).toMatchObject({ dash: 'solid', glow: true });
    // From Lisboa back to the walker, where the driven line ends.
    expect(ahead!.geometry.coordinates[0]).toEqual([-9.14, 38.72]);
    expect(ahead!.geometry.coordinates.at(-1)).toEqual(
      features.routes.features[0]!.geometry.coordinates.at(-1),
    );
    expect(
      features.stops.features.map((stop) => [stop.properties.text, stop.properties.opacity]),
    ).toEqual([
      ['Porto', 1],
      ['Lisboa', 1],
    ]);
  });

  it('stands an own image upright and runs its pictures only while the vehicle moves', () => {
    const icon = { kind: 'image', assetId: 'a_run', rotates: false } as const;
    // Walks for 5.3 s of the 10 s stage, then stands at the destination.
    const walker = track('walk', { icon });
    const tracks = [{ ...walker, timing: { ...walker.timing, durationSec: 5.3 } }];
    // Ten pictures of 100 ms: one second for the whole walk cycle.
    const timings = new Map([['a_run', Array.from({ length: 10 }, () => 100)]]);
    const { project, etappeId } = stage(tracks);
    const timeline = compileTimeline(project, etappeId);
    const iconAt = (sec: number) => {
      const state = computeFrameState(timeline, Math.round(sec * timeline.fps));
      return sceneFeatures(timeline, state, timings).vehicles.features[0]!.properties;
    };

    expect(iconAt(1.25)).toMatchObject({
      icon: 'asset:a_run:2',
      bearing: 0,
      size: 1,
      upright: true,
    });
    expect(iconAt(2.45).icon).toBe('asset:a_run:4');
    // Arrived after 5.3 s: the time on the move stops, so does the picture.
    expect(iconAt(7).icon).toBe('asset:a_run:3');
    expect(iconAt(9).icon).toBe('asset:a_run:3');
  });

  it('turns an own image with the heading when asked, and draws no vehicle for "none"', () => {
    const turning = { kind: 'image', assetId: 'a_car', rotates: true } as const;
    const features = featuresAt(
      [track('car', { icon: turning }), track('bus', { icon: { kind: 'none' } })],
      100,
    );
    expect(features.routes.features).toHaveLength(2);
    expect(features.vehicles.features).toHaveLength(1);
    const [vehicle] = features.vehicles.features;
    // An image not loaded yet shows its first picture.
    expect(vehicle!.properties).toMatchObject({ icon: 'asset:a_car:0', upright: false });
    expect(vehicle!.properties.bearing).toBeGreaterThan(180);
  });

  it('leaves a car in a tilted view to the 3D layer, but keeps its line and other icons', () => {
    const tilted = { mode: '3d-tilted', pitchDeg: 45 } as const;
    const features = featuresAt([track('car'), track('walk')], 100, tilted);
    expect(features.routes.features).toHaveLength(2);
    expect(features.vehicles.features.map((vehicle) => vehicle.properties.icon)).toEqual([
      expect.stringMatching(/^vehicle:walk:/),
    ]);
  });
});

describe('flights', () => {
  function flight(view: View, showGroundShadow = true, icon: VehicleIcon = { kind: 'catalog' }) {
    const base = createTrack({
      vehicleType: 'plane',
      waypoints: [
        createWaypoint({ name: 'Wien', lngLat: [16.57, 48.11] }),
        createWaypoint({ name: 'Porto', lngLat: [-8.68, 41.25] }),
      ],
    });
    const plane: Track = {
      ...base,
      routing: { mode: 'great-circle' },
      flight: { ...base.flight!, showGroundShadow },
      style: { ...base.style, icon },
    };
    const { project, etappeId } = stage([plane], view);
    const timeline = compileTimeline(project, etappeId);
    const state = computeFrameState(timeline, Math.round(timeline.durationInFrames / 2));
    return { features: sceneFeatures(timeline, state), state };
  }

  it('leaves a tilted flight to the 3D layer and keeps only its shadow flat', () => {
    const { features, state } = flight({ mode: 'globe', pitchDeg: 40 });
    expect(state.flightStyle).toBe('arc-3d');
    expect(features.routes.features).toEqual([]);
    expect(features.vehicles.features).toEqual([]);
    expect(features.shadows.features).toHaveLength(1);
    expect(features.shadowIcons.features[0]!.geometry.coordinates).toEqual(
      state.tracks[0]!.head.lngLat,
    );
  });

  it('lifts a flat flight towards the top of the picture and grows its icon', () => {
    const { features, state } = flight({ mode: '2d', pitchDeg: 0 });
    const { head } = state.tracks[0]!;
    const [route] = features.routes.features;
    const [vehicle] = features.vehicles.features;
    // North is up: the lifted plane lies north of where it flies over the ground.
    expect(vehicle!.geometry.coordinates[1]).toBeGreaterThan(head.lngLat[1] + 1);
    expect(vehicle!.geometry.coordinates).toEqual(route!.geometry.coordinates.at(-1));
    expect(vehicle!.properties.size).toBeGreaterThan(1.4);
    // The first point is the airport, on the ground.
    expect(route!.geometry.coordinates[0]).toEqual([16.57, 48.11]);
  });

  it('casts the shadow of an own image, and none without a vehicle', () => {
    const image = flight({ mode: '2d', pitchDeg: 0 }, true, {
      kind: 'image',
      assetId: 'a_balloon',
      rotates: false,
    });
    expect(image.features.shadowIcons.features[0]!.properties).toMatchObject({
      icon: 'asset-shadow:a_balloon',
      bearing: 0,
    });
    const none = flight({ mode: '2d', pitchDeg: 0 }, true, { kind: 'none' });
    expect(none.features.shadowIcons.features).toEqual([]);
    expect(none.features.shadows.features).toHaveLength(1);
  });

  it('draws no shadow when the track turns it off', () => {
    const { features } = flight({ mode: '2d', pitchDeg: 0 }, false);
    expect(features.shadows.features).toEqual([]);
    expect(features.shadowIcons.features).toEqual([]);
  });
});

describe('vehicle icons', () => {
  it('has an icon for every vehicle, coloured per track', () => {
    for (const vehicle of VEHICLE_TYPES) {
      const svg = iconSvg(vehicle, '#2E86AB', 128);
      expect(svg).toContain('width="128"');
      expect(svg).toContain('#2E86AB');
      expect(typeof ROTATES[vehicle]).toBe('boolean');
    }
    expect(iconId('bus', '#2E86AB')).toBe('vehicle:bus:#2e86ab');
    expect([ROTATES.walk, ROTATES.hike, ROTATES.car]).toEqual([false, false, true]);
  });
});
