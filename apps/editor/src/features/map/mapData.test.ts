import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  setWaypointKind,
  type Place,
  type Project,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { buildMapScene, fitFor } from './mapData';
import { suggestWaypointName } from './suggestName';

/** A stage with a car (Lisboa → Silves → Faro) and a bus with one stop in Porto. */
function trip() {
  const group = addGroup(createProject('Trip'), 'Tag 4');
  const stage = addEtappe(group.project, group.id, 'Algarve');
  const car = addTrack(stage.project, stage.id, 'car');
  const bus = addTrack(car.project, stage.id, 'bus');
  let project: Project = bus.project;
  const ids: string[] = [];
  for (const [name, lngLat] of [
    ['Lisboa', [-9.14, 38.72]],
    ['Silves', [-8.44, 37.19]],
    ['Faro', [-7.93, 37.02]],
  ] as const) {
    const added = addWaypoint(project, car.id, { name, lngLat: [...lngLat] });
    project = added.project;
    ids.push(added.id);
  }
  project = addWaypoint(project, bus.id, { name: 'Porto', lngLat: [-8.61, 41.15] }).project;
  return { project, groupId: group.id, stageId: stage.id, carId: car.id, busId: bus.id, ids };
}

describe('buildMapScene', () => {
  it('edits the selected track and keeps the others of the stage faint', () => {
    const { project, stageId, carId, busId, ids } = trip();
    const scene = buildMapScene(setWaypointKind(project, carId, ids[1]!, 'shape'), carId);

    expect(scene.etappeId).toBe(stageId);
    expect(scene.activeTrack?.id).toBe(carId);
    expect(scene.editablePoints.map((point) => [point.kind, point.number])).toEqual([
      ['stop', 1],
      ['shape', 1],
      ['stop', 2],
    ]);
    // Only tracks with two points have a line; the active one is drawn last, on top.
    expect(scene.lines.features.map((line) => line.properties)).toEqual([
      { trackId: carId, color: expect.any(String) as string, active: true },
    ]);
    expect(scene.otherPoints.features.map((point) => point.properties.trackId)).toEqual([busId]);
    expect(scene.fit).toEqual({
      kind: 'bounds',
      southWest: [-9.14, 37.02],
      northEast: [-7.93, 38.72],
    });
  });

  it('shows all tracks of a selected stage without making any point draggable', () => {
    const { project, stageId } = trip();
    const scene = buildMapScene(project, stageId);
    expect(scene.activeTrack).toBeUndefined();
    expect(scene.editablePoints).toEqual([]);
    expect(scene.otherPoints.features).toHaveLength(4);
    expect(scene.fit).toEqual({
      kind: 'bounds',
      southWest: [-9.14, 37.02],
      northEast: [-7.93, 41.15],
    });
  });

  it('shows nothing for a group or the project', () => {
    const { project, groupId } = trip();
    for (const id of [groupId, project.id, null]) {
      const scene = buildMapScene(project, id);
      expect(scene.etappeId).toBeUndefined();
      expect(scene.lines.features).toEqual([]);
      expect(scene.fit).toBeUndefined();
    }
  });
});

describe('fitFor', () => {
  it('centres on a single place instead of zooming in endlessly', () => {
    expect(fitFor([[-8.61, 41.15]])).toEqual({ kind: 'point', lngLat: [-8.61, 41.15] });
    expect(fitFor([])).toBeUndefined();
  });
});

describe('suggestWaypointName', () => {
  const base: Place = {
    id: 'photon:1',
    name: 'Largo do Município',
    lngLat: [-8.44, 37.19],
    kind: 'poi',
    source: 'search',
  };

  it('names a click by its town and region rather than the nearest square', () => {
    expect(suggestWaypointName({ ...base, city: 'Silves', county: 'Faro' })).toBe('Silves, Faro');
    expect(suggestWaypointName({ ...base, district: 'Alfama', state: 'Lisboa' })).toBe(
      'Alfama, Lisboa',
    );
  });

  it('keeps a clicked town as it is and does not repeat the region', () => {
    expect(suggestWaypointName({ ...base, kind: 'locality', name: 'Faro', county: 'Faro' })).toBe(
      'Faro',
    );
    expect(suggestWaypointName({ ...base, kind: 'locality', name: 'Silves', county: 'Faro' })).toBe(
      'Silves, Faro',
    );
  });

  it('prefers the municipality over a hamlet or farmstead it belongs to', () => {
    // A real answer of Photon for a click in the countryside of Andalusia.
    const farmstead: Place = {
      ...base,
      name: 'Casas Rurales Los Milanos',
      kind: 'locality',
      city: 'Calañas',
      county: 'El Andévalo',
      state: 'Andalusien',
    };
    expect(suggestWaypointName(farmstead)).toBe('Calañas, El Andévalo');
  });

  it('falls back to the feature name or the region', () => {
    expect(suggestWaypointName(base)).toBe('Largo do Município');
    expect(suggestWaypointName({ ...base, name: '', state: 'Algarve' })).toBe('Algarve');
  });
});
