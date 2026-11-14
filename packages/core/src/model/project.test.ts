import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing/sampleProject';
import type { ValidationIssue } from './issues';
import type { Project } from './project';
import { CURRENT_SCHEMA_VERSION, formatPath } from './project';
import { describeIssues, validateProject } from './validation';

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

function expectIssue(project: unknown, path: string, message: RegExp): ValidationIssue {
  const issues = issuesOf(project);
  const match = issues.find((issue) => issue.path === path && message.test(issue.message));
  expect(
    match,
    `No issue at ${path} matching ${message}. Got:\n${describeIssues(issues)}`,
  ).toBeDefined();
  return match!;
}

describe('validateProject (always checked, "storable")', () => {
  it('accepts a complete, consistent project', () => {
    const result = validateProject(sampleProject());
    expect(result.success).toBe(true);
  });

  describe('coordinates', () => {
    it('rejects a swapped [lat, lng] pair, says where it is and carries a code', () => {
      const project = sampleProject();
      trainTrack(project).waypoints[0]!.lngLat = [47.8131, 103.0458];
      const issue = expectIssue(
        project,
        `${TRAIN_TRACK_PATH}.waypoints[0].lngLat[1]`,
        /Latitude 103\.0458 is out of range.*Looks like \[lat, lng\]/,
      );
      expect(issue).toMatchObject({ code: 'lngLat.swapped', values: { lat: 103.0458 } });
    });

    it('uses a plain range code when the pair does not look swapped', () => {
      const project = sampleProject();
      trainTrack(project).waypoints[0]!.lngLat = [120, 95];
      const issue = expectIssue(
        project,
        `${TRAIN_TRACK_PATH}.waypoints[0].lngLat[1]`,
        /Latitude 95 is out of range/,
      );
      expect(issue.code).toBe('lngLat.latitudeRange');
    });
  });

  describe('tracks', () => {
    it('rejects routing that does not fit the vehicle', () => {
      const project = sampleProject();
      flightEtappe(project).tracks[0]!.routing = { mode: 'road' };
      const issue = expectIssue(
        project,
        'groups[0].etappen[1].tracks[0].routing.mode',
        /A plane cannot use "road" routing; allowed: great-circle/,
      );
      expect(issue).toMatchObject({
        code: 'track.routingNotAllowed',
        values: { vehicle: 'plane', mode: 'road', allowed: 'great-circle' },
      });
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

    it('rejects a stage with zero duration', () => {
      const project = sampleProject();
      trainEtappe(project).durationSec = 0;
      const issue = expectIssue(
        project,
        'groups[0].etappen[0].durationSec',
        /expected number to be >0/i,
      );
      // Zod's own checks carry no code but say which check failed, so the editor can explain it.
      expect(issue.code).toBeUndefined();
      expect(issue.check).toEqual({
        kind: 'too_small',
        origin: 'number',
        limit: 0,
        inclusive: false,
      });
    });

    it('describes the built-in checks behind other mistakes', () => {
      const project = sampleProject();
      trainEtappe(project).view.pitchDeg = 90;
      (trainEtappe(project) as { name: unknown }).name = 7;
      const result = validateProject(project);
      expect(result.success).toBe(false);
      const checks = result.success ? [] : result.issues.map((issue) => issue.check);
      expect(checks).toEqual(
        expect.arrayContaining([
          { kind: 'too_big', origin: 'number', limit: 85, inclusive: true },
          { kind: 'invalid_type', expected: 'string' },
        ]),
      );
    });
  });

  describe('unfinished states from the editor can be saved (ADR 0002)', () => {
    it.each([
      [
        'a stage without vehicles',
        (p: Project) => {
          trainEtappe(p).tracks = [];
        },
      ],
      [
        'a track with a single waypoint',
        (p: Project) => {
          trainTrack(p).waypoints.splice(1);
        },
      ],
      [
        'a track without waypoints',
        (p: Project) => {
          trainTrack(p).waypoints = [];
        },
      ],
      [
        'a shape point at the end of a track',
        (p: Project) => {
          Object.assign(trainTrack(p).waypoints[2]!, { kind: 'shape', showLabel: false });
        },
      ],
      [
        'a track that runs past the end of its stage',
        (p: Project) => {
          optionsEtappe(p).tracks[1]!.timing.durationSec = 30;
        },
      ],
      [
        'a follow camera without a target',
        (p: Project) => {
          trainEtappe(p).view.camera.mode = 'follow';
        },
      ],
      [
        'a camera that follows a deleted track',
        (p: Project) => {
          Object.assign(trainEtappe(p).view.camera, { mode: 'follow', followTrackId: 't_gone' });
        },
      ],
      [
        'a static camera without position',
        (p: Project) => {
          trainEtappe(p).view.camera.mode = 'static';
        },
      ],
    ])('%s', (_name, makeUnfinished) => {
      const project = sampleProject();
      makeUnfinished(project);
      expect(validateProject(project).success).toBe(true);
    });
  });

  describe('views', () => {
    it('keeps 2d views flat', () => {
      const project = sampleProject();
      trainEtappe(project).view.pitchDeg = 45;
      const issue = expectIssue(
        project,
        'groups[0].etappen[0].view.pitchDeg',
        /pitchDeg must be 0/,
      );
      expect(issue.code).toBe('view.flat2d');
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

    it('needs an alpha channel (ProRes 4444 or PNG) for a transparent overlay', () => {
      const project = sampleProject();
      project.defaults.output.transparentOverlay = true;
      const issue = expectIssue(
        project,
        'defaults.output.transparentOverlay',
        /needs an alpha channel \(prores-4444 or png-sequence\)/,
      );
      expect(issue).toMatchObject({
        code: 'output.transparentNeedsProres',
        values: { codec: 'h264' },
      });
      project.defaults.output.codec = 'png-sequence';
      expect(validateProject(project).success).toBe(true);
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
      const issue = expectIssue(
        project,
        'groups[1].etappen[0].tracks[1].waypoints[0].id',
        /ID "t_train" is already used at groups\[0\]\.etappen\[0\]\.tracks\[0\]\.id/,
      );
      expect(issue).toMatchObject({
        code: 'project.duplicateId',
        values: { id: 't_train', firstPath: 'groups[0].etappen[0].tracks[0].id' },
      });
    });

    it('needs the image of a vehicle icon among the assets, under a file-safe ID', () => {
      const project = sampleProject();
      trainTrack(project).style.icon = { kind: 'image', assetId: 'a_runner', rotates: false };
      const issue = expectIssue(project, `${TRAIN_TRACK_PATH}.style.icon.assetId`, /a_runner/);
      expect(issue).toMatchObject({
        code: 'track.iconAssetMissing',
        values: { assetId: 'a_runner' },
      });

      const runner = {
        id: 'a_runner',
        kind: 'image',
        name: 'Läufer.gif',
        mimeType: 'image/gif',
        widthPx: 128,
        heightPx: 160,
        frameCount: 12,
      } as const;
      expect(validateProject({ ...project, assets: [runner] }).success).toBe(true);
      // The ID names the file on disk; nothing may lead out of the assets folder.
      expectIssue({ ...project, assets: [{ ...runner, id: '../x' }] }, 'assets[0].id', /letters/);
      // Asset IDs share the project's ID space.
      expectIssue({ ...project, assets: [{ ...runner, id: 't_train' }] }, 'assets[0].id', /used/);
    });

    it('rejects unknown fields instead of silently dropping them', () => {
      const project = { ...sampleProject(), colour: 'red' };
      expect(issuesOf(project)[0]?.message).toMatch(/Unrecognized key: "colour"/);
    });

    it('rejects a schema version this app does not know', () => {
      const project = { ...sampleProject(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
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
