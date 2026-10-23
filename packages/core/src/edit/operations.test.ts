import { describe, expect, it } from 'vitest';
import type { FactoryContext } from '../model/factories';
import { checkRenderReadiness } from '../model/readiness';
import { describeIssues, validateProject } from '../model/validation';
import { sampleProject } from '../testing/sampleProject';
import { locateItem } from './locate';
import { defaultFlightOptions } from '../model/defaults';
import {
  addEtappe,
  addGroup,
  addTrack,
  changeVehicleType,
  duplicateItem,
  editEtappe,
  editGroup,
  editTrack,
  moveEtappe,
  moveGroup,
  moveTrack,
  removeItem,
  removeTrack,
  renameItem,
  setCameraMode,
  setViewMode,
} from './operations';

function predictableContext(): FactoryContext {
  let counter = 0;
  return {
    createId: (prefix) => `${prefix}_new${++counter}`,
    now: () => '2026-10-21T12:00:00.000Z',
  };
}

function expectStorable(project: unknown) {
  const result = validateProject(project);
  expect(result.success, result.success ? '' : describeIssues(result.issues)).toBe(true);
}

const etappenOf = (project: ReturnType<typeof sampleProject>, g: number) =>
  project.groups[g]!.etappen.map((etappe) => etappe.id);

describe('locateItem', () => {
  it('finds every kind of item by ID', () => {
    const project = sampleProject();
    expect(locateItem(project, 'p_sample')).toEqual({ kind: 'project' });
    expect(locateItem(project, 'g_day4')).toEqual({ kind: 'group', groupIndex: 1 });
    expect(locateItem(project, 'e_flight')).toEqual({
      kind: 'etappe',
      groupIndex: 0,
      etappeIndex: 1,
    });
    expect(locateItem(project, 't_b')).toEqual({
      kind: 'track',
      groupIndex: 1,
      etappeIndex: 0,
      trackIndex: 1,
    });
    expect(locateItem(project, 'nope')).toBeUndefined();
  });
});

describe('editing operations', () => {
  it('never change the project they get', () => {
    const project = sampleProject();
    const before = JSON.stringify(project);
    const ctx = predictableContext();

    addGroup(project, 'New', ctx);
    addEtappe(project, 'g_outbound', 'New', ctx);
    addTrack(project, 'e_train', 'car', { ctx });
    renameItem(project, 'e_train', 'Renamed');
    removeItem(project, 't_a');
    duplicateItem(project, 'g_outbound', { ctx });
    moveEtappe(project, 'e_train', 'g_day4', 0);

    expect(JSON.stringify(project)).toBe(before);
  });

  it('keep untouched parts identical, so the UI only re-renders what changed', () => {
    const project = sampleProject();
    const renamed = renameItem(project, 'e_options', 'Tomorrow');
    expect(renamed.groups[0]).toBe(project.groups[0]);
    expect(renamed.groups[1]).not.toBe(project.groups[1]);
    expect(renamed.groups[1]!.etappen[0]!.tracks).toBe(project.groups[1]!.etappen[0]!.tracks);
  });

  it('fail loudly for unknown IDs', () => {
    expect(() => removeItem(sampleProject(), 'nope')).toThrow(
      'No item with ID "nope" in project "Sample trip"',
    );
    expect(() => addEtappe(sampleProject(), 'e_train', 'x')).toThrow('No group with ID "e_train"');
  });
});

describe('add', () => {
  it('adds a group at the end and returns its ID', () => {
    const { project, id } = addGroup(sampleProject(), 'Return trip', predictableContext());
    expect(id).toBe('g_new1');
    expect(project.groups.at(-1)).toEqual({ id: 'g_new1', name: 'Return trip', etappen: [] });
    expectStorable(project);
  });

  it('adds an empty stage that is storable but not yet renderable', () => {
    const { project, id } = addEtappe(sampleProject(), 'g_outbound', 'Taxi', predictableContext());
    expect(etappenOf(project, 0)).toEqual(['e_train', 'e_flight', id]);
    expectStorable(project);
    expect(checkRenderReadiness(project, [id]).map((issue) => issue.code)).toEqual([
      'etappe.noTracks',
    ]);
  });

  it('lets the first vehicle choose the view and become the camera target', () => {
    const ctx = predictableContext();
    const withEtappe = addEtappe(sampleProject(), 'g_outbound', 'Flight home', ctx);
    const { project, id } = addTrack(withEtappe.project, withEtappe.id, 'plane', {
      label: 'Flugzeug',
      ctx,
    });

    const etappe = project.groups[0]!.etappen[2]!;
    expect(etappe.view.mode).toBe('globe');
    expect(etappe.view.camera).toMatchObject({ mode: 'follow', followTrackId: id });
    expect(etappe.tracks[0]).toMatchObject({
      id,
      label: 'Flugzeug',
      routing: { mode: 'great-circle' },
    });
    expect(etappe.tracks[0]!.flight).toBeDefined();
    expectStorable(project);
  });

  it('keeps the view when more vehicles join and gives them the next colour', () => {
    const before = sampleProject();
    const { project, id } = addTrack(before, 'e_options', 'bus', {
      ctx: predictableContext(),
    });
    const etappe = project.groups[1]!.etappen[0]!;
    expect(etappe.view).toEqual(before.groups[1]!.etappen[0]!.view);
    expect(etappe.tracks.map((track) => track.id)).toEqual(['t_a', 't_b', id]);
    expect(etappe.tracks[2]!.style.lineColor).not.toBe(etappe.tracks[1]!.style.lineColor);
  });
});

describe('renameItem', () => {
  it('renames project, group and stage, and sets the label of a track', () => {
    let project = sampleProject();
    project = renameItem(project, 'p_sample', 'Portugal');
    project = renameItem(project, 'g_day4', 'Tag 4');
    project = renameItem(project, 'e_flight', 'Wien – Porto');
    project = renameItem(project, 't_a', 'Variante A');

    expect(project.name).toBe('Portugal');
    expect(project.groups[1]!.name).toBe('Tag 4');
    expect(project.groups[0]!.etappen[1]!.name).toBe('Wien – Porto');
    expect(project.groups[1]!.etappen[0]!.tracks[0]!.label).toBe('Variante A');
  });

  it('removes the label of a track renamed to nothing, so the vehicle type shows instead', () => {
    const project = renameItem(sampleProject(), 't_a', '');
    expect(project.groups[1]!.etappen[0]!.tracks[0]).not.toHaveProperty('label');
  });
});

describe('edit', () => {
  it('replaces one group, stage or track by ID and leaves the rest alone', () => {
    const original = sampleProject();
    let project = editGroup(original, 'g_day4', (group) => ({ ...group, color: '#2680EB' }));
    project = editEtappe(project, 'e_flight', (etappe) => ({ ...etappe, durationSec: 12 }));
    project = editTrack(project, 't_b', (track) => ({
      ...track,
      style: { ...track.style, lineDash: 'dashed' },
    }));

    expect(project.groups[1]!.color).toBe('#2680EB');
    expect(project.groups[0]!.etappen[1]!.durationSec).toBe(12);
    expect(project.groups[1]!.etappen[0]!.tracks[1]!.style.lineDash).toBe('dashed');
    expect(project.groups[0]!.etappen[0]).toBe(original.groups[0]!.etappen[0]);
    expect(project.groups[1]!.etappen[0]!.tracks[0]).toBe(
      original.groups[1]!.etappen[0]!.tracks[0],
    );
    expectStorable(project);
  });

  it('fails loudly when the ID belongs to something else', () => {
    expect(() => editEtappe(sampleProject(), 't_a', (etappe) => etappe)).toThrow(/No etappe/);
  });
});

describe('changeVehicleType', () => {
  const trackOf = (project: ReturnType<typeof sampleProject>) =>
    project.groups[1]!.etappen[0]!.tracks[0]!;

  it('keeps the routing when the new vehicle allows it', () => {
    const track = trackOf(changeVehicleType(sampleProject(), 't_a', 'bus'));
    expect(track.vehicle).toEqual({ type: 'bus', variant: 'bus-default' });
    expect(track.routing).toEqual({ mode: 'road', avoid: ['tolls'] });
  });

  it('falls back to the default routing of the new vehicle otherwise', () => {
    const project = changeVehicleType(sampleProject(), 't_a', 'train');
    expect(trackOf(project).routing).toEqual({ mode: 'smooth' });
    expectStorable(project);
  });

  it('adds flight options for a plane and drops them for anything else', () => {
    const plane = changeVehicleType(sampleProject(), 't_a', 'plane');
    expect(trackOf(plane).flight).toEqual(defaultFlightOptions());
    expect(trackOf(plane).routing).toEqual({ mode: 'great-circle' });
    expectStorable(plane);

    const car = changeVehicleType(sampleProject(), 't_plane', 'car');
    expect(car.groups[0]!.etappen[1]!.tracks[0]).not.toHaveProperty('flight');
    expectStorable(car);
  });

  it('changes nothing when the type stays the same', () => {
    const project = sampleProject();
    expect(changeVehicleType(project, 't_a', 'car').groups[1]!.etappen[0]!.tracks[0]).toBe(
      trackOf(project),
    );
  });
});

describe('setViewMode', () => {
  it('sets the typical tilt of the new view, so a 2d view stays flat', () => {
    let project = setViewMode(sampleProject(), 'e_train', '3d-tilted');
    expect(project.groups[0]!.etappen[0]!.view).toMatchObject({ mode: '3d-tilted', pitchDeg: 55 });
    project = setViewMode(project, 'e_train', '2d');
    expect(project.groups[0]!.etappen[0]!.view).toMatchObject({ mode: '2d', pitchDeg: 0 });
    expectStorable(project);
  });
});

describe('setCameraMode', () => {
  const cameraOf = (project: ReturnType<typeof sampleProject>) =>
    project.groups[1]!.etappen[0]!.view.camera;

  it('follows the first vehicle when none is chosen yet', () => {
    const project = setCameraMode(sampleProject(), 'e_options', 'follow');
    expect(cameraOf(project)).toMatchObject({ mode: 'follow', followTrackId: 't_a' });
    expect(checkRenderReadiness(project, ['e_options'])).toEqual([]);
  });

  it('remembers the chosen vehicle when switching away and back', () => {
    let project = editEtappe(sampleProject(), 'e_options', (etappe) => ({
      ...etappe,
      view: { ...etappe.view, camera: { ...etappe.view.camera, followTrackId: 't_b' } },
    }));
    project = setCameraMode(project, 'e_options', 'overview');
    project = setCameraMode(project, 'e_options', 'follow');
    expect(cameraOf(project)).toMatchObject({ mode: 'follow', followTrackId: 't_b' });
  });

  it('leaves following without a target for a stage without vehicles', () => {
    const { project, id } = addEtappe(sampleProject(), 'g_day4', 'Empty');
    const camera = setCameraMode(project, id, 'follow').groups[1]!.etappen[1]!.view.camera;
    expect(camera.mode).toBe('follow');
    expect(camera).not.toHaveProperty('followTrackId');
  });
});

describe('remove', () => {
  it('removes groups, stages and tracks by ID', () => {
    let project = sampleProject();
    project = removeItem(project, 't_b');
    project = removeItem(project, 'e_flight');
    project = removeItem(project, 'g_day4');
    expect(project.groups.map((group) => group.id)).toEqual(['g_outbound']);
    expect(etappenOf(project, 0)).toEqual(['e_train']);
    expectStorable(project);
  });

  it('switches a camera that followed the removed vehicle to keep all in frame', () => {
    const project = sampleProject();
    Object.assign(project.groups[1]!.etappen[0]!.view.camera, {
      mode: 'follow',
      followTrackId: 't_a',
    });
    const after = removeTrack(project, 't_a');
    const camera = after.groups[1]!.etappen[0]!.view.camera;
    expect(camera.mode).toBe('follow-all');
    expect(camera).not.toHaveProperty('followTrackId');
    expect(checkRenderReadiness(after)).toEqual([]);
  });

  it('does not let the project remove itself', () => {
    expect(() => removeItem(sampleProject(), 'p_sample')).toThrow('cannot be removed');
  });
});

describe('duplicateItem', () => {
  it('copies a stage right after the original with fresh IDs everywhere', () => {
    const original = sampleProject();
    const { project, id } = duplicateItem(original, 'e_options', {
      nameSuffix: ' (Kopie)',
      ctx: predictableContext(),
    });

    expect(etappenOf(project, 1)).toEqual(['e_options', id]);
    const copy = project.groups[1]!.etappen[1]!;
    expect(copy.name).toBe('Where to tomorrow? (Kopie)');
    expect(copy.tracks.map((track) => track.id)).toEqual(['t_new1', 't_new4']);
    expect(copy.tracks[0]!.waypoints.map((w) => w.id)).toEqual(['w_new2', 'w_new3']);
    expectStorable(project);
  });

  it('points the camera of a copied stage at the copied vehicle', () => {
    const original = sampleProject();
    Object.assign(original.groups[0]!.etappen[0]!.view.camera, {
      mode: 'follow',
      followTrackId: 't_train',
    });
    const { project, id } = duplicateItem(original, 'e_train', { ctx: predictableContext() });
    const copy = project.groups[0]!.etappen.find((etappe) => etappe.id === id)!;
    expect(copy.view.camera.followTrackId).toBe(copy.tracks[0]!.id);
    expect(checkRenderReadiness(project)).toEqual([]);
  });

  it('copies whole groups and single tracks', () => {
    const ctx = predictableContext();
    const group = duplicateItem(sampleProject(), 'g_outbound', { ctx });
    expect(group.project.groups.map((g) => g.name)).toEqual([
      'Outbound',
      'Outbound (copy)',
      'Day 4',
    ]);
    expectStorable(group.project);

    const track = duplicateItem(sampleProject(), 't_a', { ctx });
    const tracks = track.project.groups[1]!.etappen[0]!.tracks;
    expect(tracks.map((t) => t.label)).toEqual(['Option A', 'Option A (copy)', 'Option B']);
    expectStorable(track.project);
  });
});

describe('move', () => {
  it('reorders groups', () => {
    const project = moveGroup(sampleProject(), 'g_day4', 0);
    expect(project.groups.map((group) => group.id)).toEqual(['g_day4', 'g_outbound']);
  });

  it('moves a stage within its group', () => {
    const project = moveEtappe(sampleProject(), 'e_flight', 'g_outbound', 0);
    expect(etappenOf(project, 0)).toEqual(['e_flight', 'e_train']);
  });

  it('moves a stage into another group at the given position', () => {
    const project = moveEtappe(sampleProject(), 'e_flight', 'g_day4', 0);
    expect(etappenOf(project, 0)).toEqual(['e_train']);
    expect(etappenOf(project, 1)).toEqual(['e_flight', 'e_options']);
    expectStorable(project);
  });

  it('clamps positions beyond the end', () => {
    const project = moveEtappe(sampleProject(), 'e_train', 'g_day4', 99);
    expect(etappenOf(project, 1)).toEqual(['e_options', 'e_train']);
  });

  it('reorders the vehicles of a stage', () => {
    const project = moveTrack(sampleProject(), 't_b', 0);
    expect(project.groups[1]!.etappen[0]!.tracks.map((track) => track.id)).toEqual(['t_b', 't_a']);
  });
});
