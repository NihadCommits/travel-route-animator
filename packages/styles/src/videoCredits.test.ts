import {
  addEtappe,
  addGroup,
  createProject,
  editEtappe,
  type Project,
} from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import {
  MAPTILER_ATTRIBUTION,
  OPENFREEMAP_ATTRIBUTION,
  TERRAIN_ATTRIBUTION,
  videoCredits,
} from './credits';

/** A project with one stage, changed by `edit`. */
function stage(edit: (project: Project, id: string) => Project = (p) => p) {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const added = addEtappe(group.project, group.id, 'Salzburg – Wien');
  return { project: edit(added.project, added.id), id: added.id };
}

describe('videoCredits', () => {
  it('credits the map of a stage', () => {
    const { project, id } = stage();
    expect(videoCredits(project, [id], { satelliteAvailable: false })).toEqual([
      OPENFREEMAP_ATTRIBUTION,
    ]);
  });

  it('adds the terrain tiles for 3D terrain and drops the map in an overlay', () => {
    const { project, id } = stage((p, etappeId) =>
      editEtappe(p, etappeId, (e) => ({
        ...e,
        view: { ...e.view, terrain: { enabled: true, exaggeration: 1.5 } },
      })),
    );
    expect(videoCredits(project, [id], { satelliteAvailable: false })).toEqual([
      OPENFREEMAP_ATTRIBUTION,
      TERRAIN_ATTRIBUTION,
    ]);
    expect(
      videoCredits(project, [id], {
        satelliteAvailable: false,
        output: { codec: 'prores-4444', transparentOverlay: true },
      }),
    ).toEqual([TERRAIN_ATTRIBUTION]);
  });

  it('credits MapTiler only when a dive-in fades to satellite with a key on the server', () => {
    const { project, id } = stage((p, etappeId) =>
      editEtappe(p, etappeId, (e) => ({
        ...e,
        outro: {
          type: 'dive-in',
          durationSec: 2,
          targetZoom: 17,
          switchToSatellite: true,
          effect: 'none',
          exportEndFrame: false,
        },
      })),
    );
    expect(videoCredits(project, [id], { satelliteAvailable: false })).not.toContain(
      MAPTILER_ATTRIBUTION,
    );
    expect(videoCredits(project, [id], { satelliteAvailable: true })).toContain(
      MAPTILER_ATTRIBUTION,
    );
  });
});
