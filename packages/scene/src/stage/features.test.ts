import {
  compileTimeline,
  computeFrameState,
  createEtappe,
  createProject,
  createTrack,
  createWaypoint,
  VEHICLE_TYPES,
  type Project,
  type Track,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { iconId, iconSvg, ROTATES } from '../vehicles/icons';
import { sceneFeatures } from './features';

function stage(tracks: Track[]): { project: Project; etappeId: string } {
  const etappe = createEtappe({ name: 'Test', tracks, durationSec: 10 });
  const project = createProject('Trip');
  return {
    project: { ...project, groups: [{ id: 'g', name: 'G', etappen: [etappe] }] },
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

function featuresAt(tracks: Track[], frame: number) {
  const { project, etappeId } = stage(tracks);
  const timeline = compileTimeline(project, etappeId);
  return sceneFeatures(timeline, computeFrameState(timeline, frame));
}

describe('sceneFeatures', () => {
  it('draws the driven line and a turned vehicle icon in the track colour', () => {
    const features = featuresAt(
      [track('car', { lineColor: '#E4572E', futureRoute: 'hidden' })],
      100,
    );
    const [route] = features.routes.features;
    expect(route!.properties).toEqual({ color: '#E4572E', width: 6, dash: 'solid', glow: false });
    const [vehicle] = features.vehicles.features;
    expect(vehicle!.properties.icon).toBe('vehicle:car:#e4572e');
    // Lisboa lies south-south-west of Porto.
    expect(vehicle!.properties.bearing).toBeGreaterThan(180);
    expect(vehicle!.properties.bearing).toBeLessThan(200);
    expect(vehicle!.geometry.coordinates).toEqual(route!.geometry.coordinates.at(-1));
    expect(features.ghosts.features).toEqual([]);
  });

  it('keeps the disc of a walker upright and shows the route ahead for a ghost track', () => {
    const features = featuresAt([track('walk', { futureRoute: 'ghost', lineDash: 'dotted' })], 50);
    expect(features.vehicles.features[0]!.properties.bearing).toBe(0);
    expect(features.ghosts.features[0]!.properties.dash).toBe('dotted');
    expect(
      features.stops.features.map((stop) => [stop.properties.text, stop.properties.opacity]),
    ).toEqual([
      ['Porto', 1],
      ['Lisboa', 1],
    ]);
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
