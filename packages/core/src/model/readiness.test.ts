import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import type { Project } from './project';
import { checkEtappeReadiness, checkRenderReadiness, type ReadinessIssue } from './readiness';

const trainEtappe = (p: Project) => p.groups[0]!.etappen[0]!;
const optionsEtappe = (p: Project) => p.groups[1]!.etappen[0]!;
const trainTrack = (p: Project) => trainEtappe(p).tracks[0]!;

const TRAIN_TRACK_PATH = 'groups[0].etappen[0].tracks[0]';

function onlyIssue(project: Project): ReadinessIssue {
  const issues = checkRenderReadiness(project);
  expect(issues).toHaveLength(1);
  return issues[0]!;
}

describe('checkRenderReadiness (before preview and export, ADR 0002)', () => {
  it('finds nothing in a finished project', () => {
    expect(checkRenderReadiness(sampleProject())).toEqual([]);
  });

  it('needs at least one vehicle per stage', () => {
    const project = sampleProject();
    trainEtappe(project).tracks = [];
    expect(onlyIssue(project)).toEqual({
      path: 'groups[0].etappen[0].tracks',
      message: 'A stage needs at least one vehicle (track)',
      code: 'etappe.noTracks',
      values: {},
      etappeId: 'e_train',
    });
  });

  it('needs at least two waypoints per track', () => {
    const project = sampleProject();
    trainTrack(project).waypoints.splice(1);
    expect(onlyIssue(project)).toMatchObject({
      path: `${TRAIN_TRACK_PATH}.waypoints`,
      message: 'A track needs at least 2 waypoints, got 1',
      code: 'track.tooFewWaypoints',
      values: { count: 1 },
    });
  });

  it('lets a GPX track with imported geometry get by with fewer waypoints', () => {
    const project = sampleProject();
    const track = trainTrack(project);
    track.routing = { mode: 'gpx' };
    track.waypoints.splice(1);
    track.computed = {
      inputHash: 'gpx-import',
      geometry: [
        [13.0458, 47.8131],
        [16.3755, 48.1851],
      ],
      legs: [],
      distanceM: 252_000,
      provider: 'gpx',
      computedAt: '2026-10-21T08:00:00.000Z',
    };
    expect(checkRenderReadiness(project)).toEqual([]);
  });

  it('requires the first and last waypoint to be stops', () => {
    const project = sampleProject();
    Object.assign(trainTrack(project).waypoints[2]!, { kind: 'shape', showLabel: false });
    expect(onlyIssue(project)).toMatchObject({
      path: `${TRAIN_TRACK_PATH}.waypoints[2].kind`,
      message: 'The last waypoint must be a stop, not a shape point',
      code: 'track.endpointNotStop',
      values: { end: 'last' },
    });
  });

  it('reports a track that runs past the end of its stage', () => {
    const project = sampleProject();
    optionsEtappe(project).tracks[1]!.timing.durationSec = 7.5;
    expect(onlyIssue(project)).toMatchObject({
      path: 'groups[1].etappen[0].tracks[1].timing',
      message: 'Track runs until 8.5 s, but the stage is only 8 s long',
      code: 'track.timingOutsideEtappe',
      etappeId: 'e_options',
    });
  });

  it('reports a track without duration that starts after the stage has ended', () => {
    const project = sampleProject();
    trainTrack(project).timing.startOffsetSec = 8;
    expect(onlyIssue(project).message).toBe('Track starts at 8 s, but the stage is only 8 s long');
  });

  it('tolerates floating point noise at the very end of a stage', () => {
    const project = sampleProject();
    const timing = optionsEtappe(project).tracks[1]!.timing;
    timing.startOffsetSec = 0.1 + 0.2; // 0.30000000000000004
    timing.durationSec = 7.7;
    expect(checkRenderReadiness(project)).toEqual([]);
  });

  it('needs a target for the follow camera', () => {
    const project = sampleProject();
    trainEtappe(project).view.camera.mode = 'follow';
    expect(onlyIssue(project)).toMatchObject({
      path: 'groups[0].etappen[0].view.camera.followTrackId',
      code: 'camera.followTrackMissing',
    });
  });

  it('reports a camera that follows a track of another stage', () => {
    const project = sampleProject();
    Object.assign(trainEtappe(project).view.camera, { mode: 'follow', followTrackId: 't_plane' });
    expect(onlyIssue(project)).toMatchObject({
      path: 'groups[0].etappen[0].view.camera.followTrackId',
      message: 'The camera follows track "t_plane", which is not part of this stage',
      code: 'camera.followTrackForeign',
    });
  });

  it('needs a position for the static camera', () => {
    const project = sampleProject();
    trainEtappe(project).view.camera.mode = 'static';
    expect(onlyIssue(project).code).toBe('camera.staticMissing');
  });

  it('checks only the requested stages', () => {
    const project = sampleProject();
    trainEtappe(project).tracks = [];
    optionsEtappe(project).tracks[0]!.waypoints = [];
    expect(checkRenderReadiness(project, ['e_options']).map((i) => i.etappeId)).toEqual([
      'e_options',
    ]);
    expect(checkRenderReadiness(project, ['e_flight'])).toEqual([]);
  });

  it('collects several problems of one stage at once', () => {
    const project = sampleProject();
    const etappe = trainEtappe(project);
    etappe.tracks[0]!.waypoints = [];
    etappe.view.camera.mode = 'static';
    expect(checkEtappeReadiness(etappe).map((i) => i.code)).toEqual([
      'track.tooFewWaypoints',
      'camera.staticMissing',
    ]);
  });
});
