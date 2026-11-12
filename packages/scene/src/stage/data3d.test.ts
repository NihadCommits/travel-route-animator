import {
  compileTimeline,
  computeFrameState,
  createEtappe,
  createProject,
  createTrack,
  createWaypoint,
  type Project,
  type RouteAhead,
  type Track,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { carSizeFactor } from '../vehicles/carShapes';
import { planeSizeFactor } from '../vehicles/planeShapes';
import { drawings3d } from './data3d';

function drawingsOf(tracks: Track[], pitchDeg: number) {
  const etappe = createEtappe({ name: 'Stage', tracks, durationSec: 10 });
  const project: Project = {
    ...createProject('Trip'),
    groups: [{ id: 'g', name: 'G', etappen: [{ ...etappe, view: { ...etappe.view, pitchDeg } }] }],
  };
  const timeline = compileTimeline(project, etappe.id);
  const state = computeFrameState(timeline, 125);
  return { drawings: drawings3d(timeline, state), state };
}

function flightAt(
  pitchDeg: number,
  ahead: RouteAhead = { opacity: 0, dash: 'solid' },
  variant = 'plane-default',
) {
  const base = createTrack({
    vehicleType: 'plane',
    waypoints: [
      createWaypoint({ name: 'Wien', lngLat: [16.57, 48.11] }),
      createWaypoint({ name: 'Porto', lngLat: [-8.68, 41.25] }),
    ],
  });
  const track = { ...base, vehicle: { ...base.vehicle, variant }, style: { ...base.style, ahead } };
  return drawingsOf([track], pitchDeg);
}

function car(variant: string, vehicleType: Track['vehicle']['type'] = 'car'): Track {
  const base = createTrack({
    vehicleType,
    waypoints: [
      createWaypoint({ name: 'Porto', lngLat: [-8.61, 41.15] }),
      createWaypoint({ name: 'Lisboa', lngLat: [-9.14, 38.72] }),
    ],
  });
  return { ...base, routing: { mode: 'straight' }, vehicle: { type: vehicleType, variant } };
}

describe('drawings3d', () => {
  it('hands a tilted flight with its heights and the plane to the 3D layer', () => {
    const { drawings, state } = flightAt(40, { opacity: 0.5, dash: 'dotted' });
    const track = state.tracks[0]!;
    const [arc] = drawings.arcs;
    const [model] = drawings.models;
    expect(drawings.arcs).toHaveLength(1);
    expect(arc!.arc.points).toBe(track.revealed);
    expect(arc!.arc.altitudesM).toHaveLength(track.revealed.length);
    expect(arc!.ahead).toMatchObject({ points: track.ahead, opacity: 0.5, dash: 'dotted' });
    expect(arc!.ahead!.altitudesM).toHaveLength(track.ahead!.length);
    expect(model!.head.altitudeM).toBe(track.head.altitudeM);
    expect(model!.model).toEqual({ kind: 'plane', type: 'plane-default' });
    // About as long on screen as the 64 px icon, a little more.
    expect(model!.lengthM / arc!.metersPerPx).toBeCloseTo(80 * planeSizeFactor('plane-default'), 6);
  });

  it('draws large aircraft larger, but far less than their real size would say', () => {
    const length = (variant: string) =>
      flightAt(40, undefined, variant).drawings.models[0]!.lengthM;
    const ratio = length('plane-a380') / length('plane-atr72');
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(72.7 / 27.2);
    // An unknown variant (an older file, a typo) is the default plane.
    expect(flightAt(40, undefined, 'plane-unknown').drawings.models[0]!.model).toEqual({
      kind: 'plane',
      type: 'plane-default',
    });
  });

  it('stands a car of its body type on the road, and leaves vehicles without a model flat', () => {
    const { drawings, state } = drawingsOf([car('car-camper'), car('walk-default', 'walk')], 45);
    expect(drawings.arcs).toEqual([]);
    expect(drawings.models).toHaveLength(1);
    const [model] = drawings.models;
    expect(model!.model).toEqual({ kind: 'car', type: 'car-camper' });
    expect(model!.head).toEqual({ ...state.tracks[0]!.head, climbDeg: 0 });
  });

  it('draws a camper larger than a small car, but less than their lengths would say', () => {
    const length = (variant: string) => drawingsOf([car(variant)], 45).drawings.models[0]!.lengthM;
    const ratio = length('car-camper') / length('car-compact');
    expect(ratio).toBeCloseTo(carSizeFactor('car-camper') / carSizeFactor('car-compact'), 6);
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(6.99 / 4.05);
  });

  it('draws nothing in 3D when the view looks straight down', () => {
    expect(flightAt(0).drawings).toEqual({ arcs: [], models: [] });
    expect(drawingsOf([car('car-suv')], 0).drawings).toEqual({ arcs: [], models: [] });
  });
});
