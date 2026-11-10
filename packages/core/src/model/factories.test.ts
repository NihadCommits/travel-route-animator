import { describe, expect, it } from 'vitest';
import { defaultOutput, trackColor, TRACK_COLORS } from './defaults';
import {
  createEtappe,
  createGroup,
  createProject,
  createTrack,
  createWaypoint,
  defaultFactoryContext,
  type FactoryContext,
} from './factories';
import { describeIssues, validateProject } from './validation';

function predictableContext(): FactoryContext {
  let counter = 0;
  return {
    createId: (prefix) => `${prefix}_${++counter}`,
    now: () => '2026-10-21T09:00:00.000Z',
  };
}

describe('factories', () => {
  it('build a project that passes validation', () => {
    const ctx = predictableContext();
    const project = createProject('Portugal 2026', ctx);
    const group = createGroup('Outbound', ctx);
    const train = createTrack(
      {
        vehicleType: 'train',
        waypoints: [
          createWaypoint({ name: 'Salzburg Hbf', lngLat: [13.0458, 47.8131] }, ctx),
          createWaypoint({ name: 'Wien Hbf', lngLat: [16.3755, 48.1851] }, ctx),
        ],
      },
      ctx,
    );
    group.etappen.push(createEtappe({ name: 'Salzburg – Vienna', tracks: [train] }, ctx));
    project.groups.push(group);

    const result = validateProject(project);
    expect(result.success, result.success ? '' : describeIssues(result.issues)).toBe(true);
  });

  it('use the injected IDs and clock', () => {
    const ctx = predictableContext();
    const project = createProject('Trip', ctx);
    expect(project).toMatchObject({
      id: 'p_1',
      schemaVersion: 2,
      createdAt: '2026-10-21T09:00:00.000Z',
      updatedAt: '2026-10-21T09:00:00.000Z',
    });
    expect(createGroup('Day 1', ctx).id).toBe('g_2');
  });

  it('create unique, prefixed IDs and ISO timestamps by default', () => {
    const a = createProject('A');
    const b = createProject('B');
    expect(a.id).toMatch(/^p_[\w-]{12}$/);
    expect(a.id).not.toBe(b.id);
    expect(new Date(a.createdAt).toISOString()).toBe(a.createdAt);
    expect(defaultFactoryContext.createId('w')).toMatch(/^w_/);
  });

  it('give every project its own default objects', () => {
    const a = createProject('A');
    const b = createProject('B');
    a.defaults.output.fps = 60;
    expect(b.defaults.output.fps).toBe(defaultOutput().fps);
  });
});

describe('createWaypoint', () => {
  it('creates a labelled stop by default', () => {
    const waypoint = createWaypoint({ name: 'Faro', lngLat: [-7.93, 37.02] });
    expect(waypoint).toMatchObject({ kind: 'stop', showLabel: true, holdSec: 0, source: 'manual' });
    expect(waypoint).not.toHaveProperty('airportCode');
  });

  it('hides the label of shape points and keeps airport codes', () => {
    expect(createWaypoint({ name: '', lngLat: [0, 0], kind: 'shape' }).showLabel).toBe(false);
    const airport = createWaypoint({
      name: 'Vienna',
      lngLat: [16.57, 48.11],
      source: 'airport',
      airportCode: 'VIE',
    });
    expect(airport).toMatchObject({ source: 'airport', airportCode: 'VIE' });
  });

  it('copies the coordinates instead of sharing the array', () => {
    const lngLat: [number, number] = [1, 2];
    const waypoint = createWaypoint({ name: 'x', lngLat });
    lngLat[0] = 99;
    expect(waypoint.lngLat).toEqual([1, 2]);
  });
});

describe('createTrack', () => {
  it('picks the routing mode the vehicle catalog suggests', () => {
    expect(createTrack({ vehicleType: 'car' }).routing.mode).toBe('road');
    expect(createTrack({ vehicleType: 'train' }).routing.mode).toBe('smooth');
  });

  it('gives planes great-circle routing and flight options, and nobody else', () => {
    const plane = createTrack({ vehicleType: 'plane' });
    expect(plane.routing.mode).toBe('great-circle');
    expect(plane.flight).toBeDefined();
    expect(createTrack({ vehicleType: 'bike' })).not.toHaveProperty('flight');
  });

  it('colours tracks from the palette by position', () => {
    expect(createTrack({ vehicleType: 'car', colorIndex: 1 }).style.lineColor).toBe(
      TRACK_COLORS[1],
    );
    expect(trackColor(TRACK_COLORS.length)).toBe(TRACK_COLORS[0]);
    expect(trackColor(-1)).toBe(TRACK_COLORS.at(-1));
  });
});

describe('createEtappe', () => {
  it('follows a single vehicle with the camera', () => {
    const car = createTrack({ vehicleType: 'car' });
    const etappe = createEtappe({ name: 'Drive', tracks: [car] });
    expect(etappe.view.camera).toMatchObject({ mode: 'follow', followTrackId: car.id });
    expect(etappe.view).toMatchObject({ mode: '3d-tilted', pitchDeg: 55 });
  });

  it('keeps several vehicles in frame and has no follow target', () => {
    const tracks = [createTrack({ vehicleType: 'car' }), createTrack({ vehicleType: 'car' })];
    const etappe = createEtappe({ name: 'Options', tracks });
    expect(etappe.view.camera.mode).toBe('follow-all');
    expect(etappe.view.camera).not.toHaveProperty('followTrackId');
  });

  it('switches to the globe as soon as a plane is involved', () => {
    const tracks = [createTrack({ vehicleType: 'car' }), createTrack({ vehicleType: 'plane' })];
    expect(createEtappe({ name: 'Flight', tracks }).view).toMatchObject({
      mode: 'globe',
      pitchDeg: 40,
    });
  });

  it('uses the given duration or the default', () => {
    const tracks = [createTrack({ vehicleType: 'walk' })];
    expect(createEtappe({ name: 'Walk', tracks }).durationSec).toBe(8);
    expect(createEtappe({ name: 'Walk', tracks, durationSec: 12 }).durationSec).toBe(12);
  });
});
