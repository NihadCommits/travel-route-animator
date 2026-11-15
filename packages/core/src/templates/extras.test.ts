import { describe, expect, it } from 'vitest';
import { duplicateItem, reverseEtappe } from '../edit/operations';
import { formatTravelTime, parseDurationText } from '../frame/duration';
import { computeFrameState } from '../frame/computeFrameState';
import { importTrack } from '../import/importTrack';
import { parseGpx } from '../import/parse';
import { validateProject } from '../model/validation';
import { addPin } from '../pins/edit';
import { refreshLocalRoutes } from '../routing/refresh';
import { trip } from '../testing/trip';
import { compileTimeline } from '../timeline/compileTimeline';
import { insertTemplate, TemplateSchema, templateOf } from './template';

const NAMES = { start: 'Start', end: 'Ziel', pause: 'Pause' };

function stage() {
  const made = trip({
    durationSec: 10,
    tracks: [
      {
        vehicle: 'train',
        points: [
          ['Salzburg', [13.04, 47.8]],
          ['Linz', [14.29, 48.29]],
        ],
      },
    ],
  });
  const withPin = addPin(made.project, made.etappeId, {
    kind: 'place',
    lngLat: [13.6, 48.0],
    title: 'Mondsee',
  });
  return { ...made, project: refreshLocalRoutes(withPin.project, '2026-11-14T10:00:00.000Z') };
}

describe('a return trip', () => {
  it('runs every vehicle the other way, right after the stage', () => {
    const { project, etappeId } = stage();
    const back = reverseEtappe(project, etappeId, { nameSuffix: ' (Rückfahrt)' });
    expect(validateProject(back.project).success).toBe(true);
    const [there, home] = back.project.groups[0]!.etappen;
    expect(home!.id).toBe(back.id);
    expect(home!.name).toBe(`${there!.name} (Rückfahrt)`);
    expect(home!.tracks[0]!.waypoints.map((w) => w.name)).toEqual(['Linz', 'Salzburg']);
    expect(home!.tracks[0]!.computed).toBeUndefined();
    // New IDs, also for the pins.
    expect(home!.pins[0]!.id).not.toBe(there!.pins[0]!.id);
    const routed = refreshLocalRoutes(back.project, '2026-11-14T10:00:00.000Z');
    expect(routed.groups[0]!.etappen[1]!.tracks[0]!.computed!.geometry[0]).toEqual([14.29, 48.29]);
  });

  it('turns an imported line round as well', () => {
    const { project, etappeId } = stage();
    const gpx =
      '<gpx><trk><trkseg><trkpt lat="47.8" lon="13"><ele>400</ele></trkpt><trkpt lat="47.81" lon="13.05"><ele>450</ele></trkpt><trkpt lat="47.8" lon="13.1"><ele>420</ele></trkpt></trkseg></trk></gpx>';
    const added = importTrack(project, etappeId, parseGpx(gpx, 'r.gpx'), {
      vehicleType: 'bike',
      names: NAMES,
      withStops: false,
    });
    const back = reverseEtappe(added.project, etappeId);
    const imported = back.project.groups[0]!.etappen[1]!.tracks[1]!.imported!;
    expect(imported.line[0]).toEqual([13.1, 47.8]);
    expect(imported.elevationsM).toEqual([420, 450, 400]);
    const original = back.project.groups[0]!.etappen[0]!.tracks[1]!.imported!;
    expect(imported.fingerprint).not.toBe(original.fingerprint);
  });

  it('gives a duplicate its own pin IDs too', () => {
    const { project, etappeId } = stage();
    const copy = duplicateItem(project, etappeId);
    expect(validateProject(copy.project).success).toBe(true);
  });
});

describe('templates', () => {
  it('keep a stage without its own images and come back with fresh IDs', () => {
    const { project, etappeId } = stage();
    const template = templateOf(project, etappeId, { now: () => new Date('2026-11-14T10:00:00Z') });
    expect(TemplateSchema.parse(JSON.parse(JSON.stringify(template)))).toEqual(template);
    expect(template.kind).toBe('etappe');
    const groupId = project.groups[0]!.id;
    const added = insertTemplate(project, template, { groupId });
    expect(validateProject(added.project).success).toBe(true);
    const etappen = added.project.groups[0]!.etappen;
    expect(etappen).toHaveLength(2);
    expect(etappen[1]!.id).toBe(added.id);
    expect(etappen[1]!.tracks[0]!.id).not.toBe(etappen[0]!.tracks[0]!.id);
    expect(() => insertTemplate(project, template)).toThrow(/needs a group/);
  });

  it('keep a whole group and add it at the end', () => {
    const { project } = stage();
    const groupId = project.groups[0]!.id;
    const template = templateOf(project, groupId);
    expect(template.kind).toBe('group');
    const added = insertTemplate(project, template);
    expect(added.project.groups).toHaveLength(2);
    expect(validateProject(added.project).success).toBe(true);
    expect(() => templateOf(project, 'nope')).toThrow(/stages and groups/);
  });
});

describe('the time counter', () => {
  it('reads typed durations', () => {
    expect(parseDurationText('2 h 35 min')).toBe(9300);
    expect(parseDurationText('2h35')).toBe(9300);
    expect(parseDurationText('1:20 h')).toBe(4800);
    expect(parseDurationText('45 min')).toBe(2700);
    expect(parseDurationText('1,5 Std.')).toBe(5400);
    expect(parseDurationText('eine Weile')).toBeUndefined();
    expect(formatTravelTime(2700)).toBe('45 min');
    expect(formatTravelTime(9300)).toBe('2:35 h');
  });

  it('counts up to the typed duration as the vehicle drives', () => {
    const { project, etappeId } = stage();
    const timed = {
      ...project,
      groups: project.groups.map((group) => ({
        ...group,
        etappen: group.etappen.map((etappe) => ({
          ...etappe,
          overlays: { ...etappe.overlays, timeCounter: true, manualDurationText: '2 h 30 min' },
        })),
      })),
    };
    const timeline = compileTimeline(timed, etappeId);
    expect(computeFrameState(timeline, 0).counters.travelSec).toBe(0);
    const last = computeFrameState(timeline, timeline.durationInFrames - 1).counters;
    expect(last.travelSec).toBeCloseTo(9000, 6);
    expect(last.distanceKm).toBeUndefined();
  });
});
