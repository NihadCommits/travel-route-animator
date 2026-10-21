import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import type { Project } from './project';
import { formatPath } from './project';
import { describeIssues, validateProject, type ValidationIssue } from './validation';

// Shortcuts into the sample: the train stage, the flight stage and the options stage.
const trainEtappe = (p: Project) => p.groups[0]!.etappen[0]!;
const flightEtappe = (p: Project) => p.groups[0]!.etappen[1]!;
const optionsEtappe = (p: Project) => p.groups[1]!.etappen[0]!;
const trainTrack = (p: Project) => trainEtappe(p).tracks[0]!;

const TRAIN_TRACK_PATH = 'groups[0].etappen[0].tracks[0]';

function issuesOf(project: unknown): ValidationIssue[] {
  const result = validateProject(project);
  if (result.success) throw new Error('Expected validation to fail, but it passed');
  return result.issues;
}

function expectIssue(project: unknown, path: string, message: RegExp) {
  const issues = issuesOf(project);
  const match = issues.find((issue) => issue.path === path && message.test(issue.message));
  expect(
    match,
    `No issue at ${path} matching ${message}. Got:\n${describeIssues(issues)}`,
  ).toBeDefined();
}

describe('validateProject', () => {
  it('accepts a complete, consistent project', () => {
    const result = validateProject(sampleProject());
    expect(result.success).toBe(true);
  });

  describe('coordinates', () => {
    it('rejects a swapped [lat, lng] pair and says where it is', () => {
      const project = sampleProject();
      trainTrack(project).waypoints[0]!.lngLat = [47.8131, 103.0458];
      expectIssue(
        project,
        `${TRAIN_TRACK_PATH}.waypoints[0].lngLat[1]`,
        /Latitude 103\.0458 is out of range.*Looks like \[lat, lng\]/,
      );
    });
  });

  describe('tracks', () => {
    it('rejects a track with a single waypoint', () => {
      const project = sampleProject();
      trainTrack(project).waypoints.splice(1);
      expectIssue(project, `${TRAIN_TRACK_PATH}.waypoints`, /at least 2 waypoints, got 1/);
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
      expect(validateProject(project).success).toBe(true);
    });

    it('rejects routing that does not fit the vehicle', () => {
      const project = sampleProject();
      flightEtappe(project).tracks[0]!.routing = { mode: 'road' };
      expectIssue(
        project,
        'groups[0].etappen[1].tracks[0].routing.mode',
        /A plane cannot use "road" routing; allowed: great-circle/,
      );
    });

    it('requires the first and last waypoint to be stops', () => {
      const project = sampleProject();
      const waypoints = trainTrack(project).waypoints;
      waypoints[2]!.kind = 'shape';
      waypoints[2]!.showLabel = false;
      expectIssue(project, `${TRAIN_TRACK_PATH}.waypoints[2].kind`, /last waypoint must be a stop/);
    });

    it('rejects a hold on an invisible shape point', () => {
      const project = sampleProject();
      trainTrack(project).waypoints[1]!.holdSec = 2;
      expectIssue(project, `${TRAIN_TRACK_PATH}.waypoints[1].holdSec`, /cannot have a hold/);
    });

    it('allows "avoid" only for road routing', () => {
      const project = sampleProject();
      trainTrack(project).routing = { mode: 'smooth', avoid: ['tolls'] };
      expectIssue(project, `${TRAIN_TRACK_PATH}.routing.avoid`, /only applies to road routing/);
    });

    it('allows flight options only on planes', () => {
      const project = sampleProject();
      trainTrack(project).flight = {
        arcHeightFactor: 0.1,
        showGroundShadow: false,
        takeoffLandingCamera: false,
      };
      expectIssue(project, `${TRAIN_TRACK_PATH}.flight`, /only apply to planes/);
    });

    it('rejects an invalid airport code', () => {
      const project = sampleProject();
      flightEtappe(project).tracks[0]!.waypoints[0]!.airportCode = 'vienna';
      expectIssue(
        project,
        'groups[0].etappen[1].tracks[0].waypoints[0].airportCode',
        /three-letter IATA code/,
      );
    });
  });

  describe('timing', () => {
    it('rejects a track that runs past the end of its stage', () => {
      const project = sampleProject();
      optionsEtappe(project).tracks[1]!.timing.durationSec = 7.5;
      expectIssue(
        project,
        'groups[1].etappen[0].tracks[1].timing',
        /runs until 8\.5 s, but the stage is only 8 s long/,
      );
    });

    it('rejects a track without duration that starts after the stage has ended', () => {
      const project = sampleProject();
      trainTrack(project).timing.startOffsetSec = 8;
      expectIssue(
        project,
        `${TRAIN_TRACK_PATH}.timing`,
        /starts at 8 s, but the stage is only 8 s/,
      );
    });

    it('tolerates floating point noise at the very end of a stage', () => {
      const project = sampleProject();
      const timing = optionsEtappe(project).tracks[1]!.timing;
      timing.startOffsetSec = 0.1 + 0.2; // 0.30000000000000004
      timing.durationSec = 7.7;
      expect(validateProject(project).success).toBe(true);
    });

    it('rejects a stage with zero duration', () => {
      const project = sampleProject();
      trainEtappe(project).durationSec = 0;
      expectIssue(project, 'groups[0].etappen[0].durationSec', /expected number to be >0/i);
    });
  });

  describe('stages', () => {
    it('needs at least one vehicle', () => {
      const project = sampleProject();
      trainEtappe(project).tracks = [];
      expectIssue(project, 'groups[0].etappen[0].tracks', /at least one vehicle/);
    });

    it('needs followTrackId for the follow camera', () => {
      const project = sampleProject();
      trainEtappe(project).view.camera.mode = 'follow';
      expectIssue(project, 'groups[0].etappen[0].view.camera.followTrackId', /needs followTrackId/);
    });

    it('rejects a camera that follows a track of another stage', () => {
      const project = sampleProject();
      Object.assign(trainEtappe(project).view.camera, { mode: 'follow', followTrackId: 't_plane' });
      expectIssue(
        project,
        'groups[0].etappen[0].view.camera.followTrackId',
        /follows track "t_plane", which is not part of this stage/,
      );
    });

    it('needs staticCamera for the static camera', () => {
      const project = sampleProject();
      trainEtappe(project).view.camera.mode = 'static';
      expectIssue(project, 'groups[0].etappen[0].view.camera.staticCamera', /needs staticCamera/);
    });

    it('keeps 2d views flat', () => {
      const project = sampleProject();
      trainEtappe(project).view.pitchDeg = 45;
      expectIssue(project, 'groups[0].etappen[0].view.pitchDeg', /pitchDeg must be 0/);
    });

    it('validates intro and outro by their type', () => {
      const project = sampleProject();
      trainEtappe(project).outro = {
        type: 'dive-in',
        durationSec: 2,
        targetZoom: 30,
        switchToSatellite: true,
        effect: 'flash',
        exportEndFrame: true,
      };
      expectIssue(project, 'groups[0].etappen[0].outro.targetZoom', /<=24/);
    });
  });

  describe('styles and output', () => {
    it('allows a theme only on vector and terrain maps', () => {
      const project = sampleProject();
      flightEtappe(project).mapStyle = { base: 'satellite', themeId: 'night' };
      expectIssue(project, 'groups[0].etappen[1].mapStyle.themeId', /only applies to vector/);
    });

    it('needs ProRes 4444 for a transparent overlay', () => {
      const project = sampleProject();
      project.defaults.output.transparentOverlay = true;
      expectIssue(project, 'defaults.output.transparentOverlay', /needs the prores-4444 codec/);
    });

    it('accepts only the supported frame rates', () => {
      const project = sampleProject();
      (project.defaults.output as { fps: number }).fps = 29.97;
      expect(issuesOf(project).map((i) => i.path)).toContain('defaults.output.fps');
    });
  });

  describe('project level', () => {
    it('rejects an ID that is used twice anywhere in the project', () => {
      const project = sampleProject();
      optionsEtappe(project).tracks[1]!.waypoints[0]!.id = 't_train';
      expectIssue(
        project,
        'groups[1].etappen[0].tracks[1].waypoints[0].id',
        /ID "t_train" is already used at groups\[0\]\.etappen\[0\]\.tracks\[0\]\.id/,
      );
    });

    it('rejects unknown fields instead of silently dropping them', () => {
      const project = { ...sampleProject(), colour: 'red' };
      expect(issuesOf(project)[0]?.message).toMatch(/Unrecognized key: "colour"/);
    });

    it('rejects a schema version this app does not know', () => {
      const project = { ...sampleProject(), schemaVersion: 2 };
      expect(issuesOf(project).map((i) => i.path)).toContain('schemaVersion');
    });

    it('rejects an empty name', () => {
      const project = sampleProject();
      project.name = '   ';
      expectIssue(project, 'name', /needs a name/);
    });
  });
});

describe('formatPath', () => {
  it('writes paths the way they look in code', () => {
    expect(formatPath(['groups', 0, 'etappen', 1, 'name'])).toBe('groups[0].etappen[1].name');
    expect(formatPath([])).toBe('');
  });
});

describe('describeIssues', () => {
  it('prints one line per issue', () => {
    expect(
      describeIssues([
        { path: 'name', message: 'A project needs a name' },
        { path: '', message: 'Invalid input' },
      ]),
    ).toBe('name: A project needs a name\nInvalid input');
  });
});
