import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  editWaypoint,
  refreshLocalRoutes,
  setWaypointKind,
  type Place,
  type Project,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { buildMapScene, fitFor, worldCopyShift } from './mapData';
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
      { trackId: carId, color: expect.any(String) as string, active: true, routed: false },
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

/** A stage with one flight between the given airports, its route computed as in the editor. */
function flight(from: [number, number], to: [number, number]) {
  const group = addGroup(createProject('Trip'), 'Hinreise');
  const stage = addEtappe(group.project, group.id, 'Flug');
  const plane = addTrack(stage.project, stage.id, 'plane');
  let project = addWaypoint(plane.project, plane.id, { name: 'A', lngLat: from }).project;
  project = addWaypoint(project, plane.id, { name: 'B', lngLat: to }).project;
  return { project: refreshLocalRoutes(project, '2026-10-26T12:00:00.000Z'), planeId: plane.id };
}

describe('routes on the map', () => {
  it('draws a computed route solid and fits the map to its arc', () => {
    // Lisbon → New York: the great circle rises far north of both airports.
    const { project, planeId } = flight([-9.1359, 38.7756], [-73.7781, 40.6413]);
    const scene = buildMapScene(project, planeId);
    const [line] = scene.lines.features;
    expect(line!.properties.routed).toBe(true);
    expect(line!.geometry.coordinates.length).toBeGreaterThan(2);
    expect(scene.activeLine!.legs.map((leg) => leg.startIndex)).toEqual([0]);
    expect(scene.fit).toMatchObject({ kind: 'bounds', southWest: [-73.7781, 38.7756] });
    if (scene.fit?.kind === 'bounds') expect(scene.fit.northEast[1]).toBeGreaterThan(44);
  });

  it('draws a flight over the Pacific in one piece and fits the map around the Pacific', () => {
    const { project, planeId } = flight([139.7798, 35.5494], [-118.4085, 33.9416]);
    const scene = buildMapScene(project, planeId);
    const coordinates = scene.activeLine!.coordinates;
    const steps = coordinates.slice(1).map(([lng], i) => Math.abs(lng - coordinates[i]![0]));
    expect(Math.max(...steps)).toBeLessThan(5);
    expect(coordinates.at(-1)![0]).toBeCloseTo(241.5915, 4);
    expect(scene.fit).toMatchObject({ southWest: [139.7798, 33.9416] });
    if (scene.fit?.kind === 'bounds') expect(scene.fit.northEast[0]).toBeCloseTo(241.5915, 4);
  });

  it('falls back to dashed straight lines while the route does not fit the points', () => {
    const { project, planeId } = flight([16.5697, 48.1103], [-8.6814, 41.2481]);
    const plane = project.groups[0]!.etappen[0]!.tracks[0]!;
    const moved = editWaypoint(project, planeId, plane.waypoints[1]!.id, (w) => ({
      ...w,
      lngLat: [-9.1359, 38.7756],
    }));
    const scene = buildMapScene(moved, planeId);
    expect(scene.activeLine).toEqual({
      coordinates: [
        [16.5697, 48.1103],
        [-9.1359, 38.7756],
      ],
      routed: false,
      legs: [{ startIndex: 0 }],
    });
  });
});

describe('worldCopyShift', () => {
  const pacific: [number, number][] = [
    [139.8, 35.5],
    [241.6, 33.9],
  ];

  it('moves a line into the copy of the world where the click was', () => {
    expect(worldCopyShift(pacific, -118)).toBe(-360);
    expect(worldCopyShift(pacific, 200)).toBe(0);
    expect(worldCopyShift(pacific, 560)).toBe(360);
    expect(worldCopyShift([], 10)).toBe(0);
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
