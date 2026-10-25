import { describe, expect, it } from 'vitest';
import type { FactoryContext } from '../model/factories';
import { checkRenderReadiness } from '../model/readiness';
import { describeIssues, validateProject } from '../model/validation';
import { sampleProject } from '../testing/sampleProject';
import {
  addWaypoint,
  editWaypoint,
  insertShapePoint,
  moveWaypoint,
  removeWaypoint,
  setWaypointKind,
} from './waypoints';

const ctx: FactoryContext = { createId: (prefix) => `${prefix}_new`, now: () => '' };

// The train Salzburg → Linz (shape point) → Wien Hbf.
const train = (project: ReturnType<typeof sampleProject>) =>
  project.groups[0]!.etappen[0]!.tracks[0]!;
const idsOf = (project: ReturnType<typeof sampleProject>) =>
  train(project).waypoints.map((waypoint) => waypoint.id);

function expectStorable(project: unknown) {
  const result = validateProject(project);
  expect(result.success, result.success ? '' : describeIssues(result.issues)).toBe(true);
}

describe('addWaypoint', () => {
  it('appends by default and returns the new ID', () => {
    const { project, id } = addWaypoint(
      sampleProject(),
      't_train',
      { lngLat: [16.5697, 48.1103], name: 'VIE', source: 'airport', airportCode: 'VIE' },
      { ctx },
    );
    expect(id).toBe('w_new');
    expect(idsOf(project)).toEqual(['w_sbg', 'w_linz', 'w_vie_hbf', 'w_new']);
    expect(train(project).waypoints[3]).toMatchObject({
      kind: 'stop',
      source: 'airport',
      airportCode: 'VIE',
      showLabel: true,
    });
    expectStorable(project);
  });

  it('inserts at a position', () => {
    const { project } = addWaypoint(
      sampleProject(),
      't_train',
      { lngLat: [15, 48], name: 'Melk' },
      { index: 1, ctx },
    );
    expect(idsOf(project)).toEqual(['w_sbg', 'w_new', 'w_linz', 'w_vie_hbf']);
  });
});

describe('editWaypoint, moveWaypoint, removeWaypoint', () => {
  it('changes one waypoint and leaves the others as they are', () => {
    const original = sampleProject();
    const project = editWaypoint(original, 't_train', 'w_sbg', (w) => ({ ...w, holdSec: 2 }));
    expect(train(project).waypoints[0]!.holdSec).toBe(2);
    expect(train(project).waypoints[1]).toBe(train(original).waypoints[1]);
  });

  it('moves a waypoint to another position', () => {
    const project = moveWaypoint(sampleProject(), 't_train', 'w_vie_hbf', 0);
    expect(idsOf(project)).toEqual(['w_vie_hbf', 'w_sbg', 'w_linz']);
  });

  it('removes a waypoint; a track left with one point is storable but not renderable', () => {
    let project = removeWaypoint(sampleProject(), 't_train', 'w_linz');
    project = removeWaypoint(project, 't_train', 'w_vie_hbf');
    expect(idsOf(project)).toEqual(['w_sbg']);
    expectStorable(project);
    expect(checkRenderReadiness(project, ['e_train']).map((issue) => issue.code)).toEqual([
      'track.tooFewWaypoints',
    ]);
  });

  it('fails loudly for an unknown waypoint', () => {
    expect(() => removeWaypoint(sampleProject(), 't_train', 'w_nope')).toThrow(/No waypoint/);
  });
});

describe('setWaypointKind', () => {
  it('drops hold and label for a shape point and brings the label back for a stop', () => {
    let project = editWaypoint(sampleProject(), 't_train', 'w_sbg', (w) => ({ ...w, holdSec: 3 }));
    project = setWaypointKind(project, 't_train', 'w_sbg', 'shape');
    expect(train(project).waypoints[0]).toMatchObject({
      kind: 'shape',
      holdSec: 0,
      showLabel: false,
    });
    expectStorable(project);

    project = setWaypointKind(project, 't_train', 'w_linz', 'stop');
    expect(train(project).waypoints[1]).toMatchObject({ kind: 'stop', showLabel: true });
  });

  it('changes nothing when the kind stays the same', () => {
    const project = sampleProject();
    const same = setWaypointKind(project, 't_train', 'w_sbg', 'stop');
    expect(train(same).waypoints[0]).toBe(train(project).waypoints[0]);
  });
});

describe('insertShapePoint', () => {
  it('puts a shape point between the two waypoints of a segment', () => {
    const { project, id } = insertShapePoint(sampleProject(), 't_train', 1, [15.6, 48.2], { ctx });
    expect(idsOf(project)).toEqual(['w_sbg', 'w_linz', id, 'w_vie_hbf']);
    expect(train(project).waypoints[2]).toMatchObject({
      kind: 'shape',
      source: 'map-click',
      lngLat: [15.6, 48.2],
      showLabel: false,
    });
    expectStorable(project);
  });
});
