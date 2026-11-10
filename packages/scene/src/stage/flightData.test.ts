import {
  compileTimeline,
  computeFrameState,
  createEtappe,
  createProject,
  createTrack,
  createWaypoint,
  type Project,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { planeSizeFactor } from '../vehicles/planeShapes';
import { flightDrawings } from './flightData';

function flightAt(
  pitchDeg: number,
  futureRoute: 'hidden' | 'ghost' = 'hidden',
  variant = 'plane-default',
) {
  const base = createTrack({
    vehicleType: 'plane',
    waypoints: [
      createWaypoint({ name: 'Wien', lngLat: [16.57, 48.11] }),
      createWaypoint({ name: 'Porto', lngLat: [-8.68, 41.25] }),
    ],
  });
  const track = {
    ...base,
    vehicle: { ...base.vehicle, variant },
    style: { ...base.style, futureRoute },
  };
  const etappe = createEtappe({ name: 'Flight', tracks: [track], durationSec: 10 });
  const project: Project = {
    ...createProject('Trip'),
    groups: [{ id: 'g', name: 'G', etappen: [{ ...etappe, view: { ...etappe.view, pitchDeg } }] }],
  };
  const timeline = compileTimeline(project, etappe.id);
  const state = computeFrameState(timeline, 125);
  return { drawings: flightDrawings(timeline, state), state };
}

describe('flightDrawings', () => {
  it('hands a tilted flight with its heights and the plane to the 3D layer', () => {
    const { drawings, state } = flightAt(40, 'ghost');
    const [drawing] = drawings;
    const track = state.tracks[0]!;
    expect(drawings).toHaveLength(1);
    expect(drawing!.arc.points).toBe(track.revealed);
    expect(drawing!.arc.altitudesM).toHaveLength(track.revealed.length);
    expect(drawing!.head.altitudeM).toBe(track.head.altitudeM);
    expect(drawing!.ghost?.points.length).toBeGreaterThan(track.revealed.length);
    // About as long on screen as the 64 px icon, a little more.
    expect(drawing!.modelLengthM / drawing!.metersPerPx).toBeCloseTo(
      80 * planeSizeFactor('plane-default'),
      6,
    );
    expect(drawing!.planeType).toBe('plane-default');
  });

  it('draws large aircraft larger, but far less than their real size would say', () => {
    const length = (variant: string) => flightAt(40, 'hidden', variant).drawings[0]!.modelLengthM;
    const ratio = length('plane-a380') / length('plane-atr72');
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(72.7 / 27.2);
    // An unknown variant (an older file, a typo) is the default plane.
    expect(flightAt(40, 'hidden', 'plane-unknown').drawings[0]!.planeType).toBe('plane-default');
  });

  it('draws nothing in 3D when the view looks straight down', () => {
    expect(flightAt(0).drawings).toEqual([]);
  });
});
