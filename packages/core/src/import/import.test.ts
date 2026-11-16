import { describe, expect, it } from 'vitest';
import { measureLine } from '../geo/along';
import { addEtappe, addGroup, editTrack } from '../edit/operations';
import { createProject } from '../model/factories';
import { validateProject } from '../model/validation';
import { computeRouteInputHash, isRouteStale } from '../routing/inputHash';
import { computeLocalRoute } from '../routing/localRoute';
import { refreshLocalRoutes } from '../routing/refresh';
import { compileTimeline } from '../timeline/compileTimeline';
import { importTrack, suggestStops, toImportedLine, vehicleForActivity } from './importTrack';
import { ImportError, parseDjiSrt, parseGpx, parseTrackFile } from './parse';

const NAMES = { start: 'Start', end: 'Ziel', pause: 'Pause' };

/**
 * A bike tour along the Salzach as a GPX file: 2.2 km east, climbing 1 m every 20 m, with a
 * named waypoint near the middle and a 10-minute break at a café after a kilometre.
 */
function bikeTour(): string {
  const points: string[] = [];
  let time = Date.UTC(2026, 6, 4, 8, 0, 0);
  const at = (i: number) => `${(13.0 + i * 0.00027).toFixed(6)}`;
  for (let i = 0; i <= 110; i++) {
    points.push(
      `<trkpt lat="47.800000" lon="${at(i)}"><ele>${420 + i}</ele><time>${new Date(time).toISOString()}</time></trkpt>`,
    );
    time += 5000;
    // The break: the GPS stays at the café for ten minutes.
    if (i === 50) {
      for (let k = 0; k < 20; k++) {
        time += 30_000;
        points.push(
          `<trkpt lon="${at(i)}" lat="47.800003"><ele>${420 + i}</ele><time>${new Date(time).toISOString()}</time></trkpt>`,
        );
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="47.8002" lon="13.0162"><name>Br&#252;cke &amp; Steg</name></wpt>
  <wpt lat="48.2" lon="16.37"><name>Wien</name></wpt>
  <trk>
    <name>Salzach-Runde</name>
    <type>cycling</type>
    <trkseg>${points.slice(0, 60).join('\n')}</trkseg>
    <trkseg>${points.slice(60).join('\n')}</trkseg>
  </trk>
</gpx>`;
}

describe('parseGpx', () => {
  it('reads every segment of the track with heights and times, and the waypoints', () => {
    const tour = parseGpx(bikeTour(), 'tour.gpx');
    expect(tour.name).toBe('Salzach-Runde');
    expect(tour.activity).toBe('cycling');
    expect(tour.points).toHaveLength(131);
    expect(tour.points[0]).toMatchObject({ lngLat: [13, 47.8], ele: 420 });
    expect(tour.points[0]!.time).toBe(Date.UTC(2026, 6, 4, 8, 0, 0));
    expect(tour.waypoints.map((w) => w.name)).toEqual(['Br&#252;cke & Steg', 'Wien']);
  });

  it('falls back to the route and to the file name, and refuses what is no GPX', () => {
    const route = parseGpx(
      '<gpx><rte><rtept lat="47" lon="13"/><rtept lat="47.1" lon="13.1"/></rte></gpx>',
      'Abend.GPX',
    );
    expect(route.points.map((p) => p.lngLat)).toEqual([
      [13, 47],
      [13.1, 47.1],
    ]);
    expect(route.name).toBe('Abend');
    expect(route.points[0]!.ele).toBeUndefined();
    expect(() => parseGpx('<kml></kml>', 'x.gpx')).toThrow(ImportError);
    expect(() => parseGpx('<gpx><trk><trkseg/></trk></gpx>', 'x.gpx')).toThrow(/two points/);
  });
});

describe('parseDjiSrt', () => {
  it('reads the GPS of newer DJI drones and leaves out frames without a fix', () => {
    const srt = [
      '1\n00:00:00,000 --> 00:00:00,033\n<font size="28">FrameCnt: 1, DiffTime: 33ms\n[iso: 100] [latitude: 0.000000] [longitude: 0.000000] [rel_alt: 0.000 abs_alt: 0.000]</font>',
      '2\n00:00:00,033 --> 00:00:00,066\n[latitude: 47.812345] [longitude: 13.045678] [rel_alt: 30.500 abs_alt: 455.250]',
      '3\n00:00:01,000 --> 00:00:01,033\n[latitude : 47.812400] [longtitude : 13.045900] [rel_alt: 31.000 abs_alt: 455.750]',
    ].join('\r\n\r\n');
    const flight = parseDjiSrt(srt, 'DJI_0042.SRT');
    expect(flight.name).toBe('DJI_0042');
    expect(flight.points).toEqual([
      { lngLat: [13.045678, 47.812345], ele: 455.25, time: 33 },
      { lngLat: [13.0459, 47.8124], ele: 455.75, time: 1000 },
    ]);
  });

  it('reads the older GPS(lng, lat, alt) form', () => {
    const srt =
      '1\n00:00:00,000 --> 00:00:01,000\nHOME(13.0400,47.8100) 2026.07.04 10:00:00\nGPS(13.0412,47.8123,19) BAROMETER:30.1\n\n' +
      '2\n00:00:01,000 --> 00:00:02,000\nGPS(13.0420,47.8130,19) BAROMETER:31.0\n';
    const flight = parseTrackFile(srt, 'DJI_0001.srt');
    expect(flight.source).toBe('dji-srt');
    expect(flight.points.map((p) => p.lngLat)).toEqual([
      [13.0412, 47.8123],
      [13.042, 47.813],
    ]);
    expect(() => parseDjiSrt('1\n00:00:00,000 --> 00:00:01,000\nno gps here\n', 'x.srt')).toThrow(
      /no GPS positions/,
    );
  });
});

describe('the imported line', () => {
  it('is simplified, keeps its heights per point and has a fingerprint', () => {
    const tour = parseGpx(bikeTour(), 'tour.gpx');
    const imported = toImportedLine(tour);
    // A straight line east: start and end are all it needs.
    expect(imported.line).toEqual([
      [13, 47.8],
      [13.0297, 47.8],
    ]);
    expect(imported.elevationsM).toEqual([420, 530]);
    expect(imported.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(toImportedLine(tour).fingerprint).toBe(imported.fingerprint);
  });

  it('suggests start, the named waypoint near it, the long break and the end', () => {
    const tour = parseGpx(bikeTour(), 'tour.gpx');
    const stops = suggestStops(tour, NAMES);
    expect(stops.map((s) => s.name)).toEqual(['Start', 'Pause', 'Br&#252;cke & Steg', 'Ziel']);
    expect(stops.every((s, i) => i === 0 || s.at > stops[i - 1]!.at)).toBe(true);
  });

  it('knows the vehicle of the activity', () => {
    expect(vehicleForActivity({ source: 'gpx', activity: 'cycling' })).toBe('bike');
    expect(vehicleForActivity({ source: 'gpx', activity: 'Hiking' })).toBe('hike');
    expect(vehicleForActivity({ source: 'gpx', activity: 'running' })).toBe('walk');
    expect(vehicleForActivity({ source: 'gpx' })).toBe('bike');
    expect(vehicleForActivity({ source: 'dji-srt' })).toBe('hike');
  });
});

describe('an imported track', () => {
  function imported(withStops = true) {
    const group = addGroup(createProject('Trip'), 'Tag 1');
    const stage = addEtappe(group.project, group.id, 'Radtour');
    const tour = parseGpx(bikeTour(), 'tour.gpx');
    const added = importTrack(stage.project, stage.id, tour, {
      vehicleType: 'bike',
      names: NAMES,
      withStops,
    });
    return {
      project: refreshLocalRoutes(added.project, '2026-11-14T10:00:00.000Z'),
      etappeId: stage.id,
      id: added.id,
    };
  }
  const trackOf = (project: ReturnType<typeof imported>['project']) =>
    project.groups[0]!.etappen[0]!.tracks[0]!;

  it('is a valid track whose route follows the file, with its heights', () => {
    const { project } = imported();
    expect(validateProject(project).success).toBe(true);
    const track = trackOf(project);
    expect(track.routing.mode).toBe('gpx');
    expect(track.label).toBe('Salzach-Runde');
    expect(track.waypoints).toHaveLength(4);
    const route = track.computed!;
    expect(route.provider).toBe('gpx');
    expect(route.legs).toHaveLength(3);
    expect(measureLine(route.geometry).lengthM).toBeCloseTo(2218, 0);
    expect(route.elevation!.source).toBe('gpx');
    expect(route.elevation!.elevationsM[0]).toBe(420);
    expect(route.elevation!.elevationsM.at(-1)).toBe(530);
  });

  it('keeps what the device recorded, with the break, cut to the route (M16)', () => {
    const { project } = imported();
    const track = trackOf(project);
    const recording = track.imported!.recording!;
    expect(recording.startedAt).toBe('2026-07-04T08:00:00.000Z');
    // 110 points 5 s apart and a 10 minute break: 1150 s.
    expect((recording.atM.length - 1) * recording.stepSec).toBe(1150);
    const route = track.computed!.recording!;
    expect(route.atM[0]).toBe(0);
    expect(route.atM.at(-1)).toBeCloseTo(measureLine(track.computed!.geometry).lengthM, 0);
    // During the break the trip hardly moves: the GPS jitters by centimetres, not metres.
    const atBreak = route.atM.findIndex((at, i) => i > 0 && at - route.atM[i - 1]! < 0.1);
    expect(route.atM[atBreak + 300]! - route.atM[atBreak]!).toBeLessThan(1);
  });

  it('keeps the line when a stop is moved: the stop is laid onto it again', () => {
    const { project, id } = imported(false);
    const moved = editTrack(project, id, (track) => ({
      ...track,
      waypoints: track.waypoints.map((w, i) =>
        i === 1 ? { ...w, lngLat: [13.02, 47.81] as [number, number] } : w,
      ),
    }));
    const track = trackOf(moved);
    expect(isRouteStale(track)).toBe(true);
    const route = computeLocalRoute(track, 'later')!;
    // Still along the river, only shorter: the end stop sits on the line, off by 1.1 km north.
    expect(route.geometry.every(([, lat]) => lat === 47.8)).toBe(true);
    expect(measureLine(route.geometry).lengthM).toBeCloseTo(1500, -2);
    const timeline = compileTimeline(
      refreshLocalRoutes(moved, 'later'),
      moved.groups[0]!.etappen[0]!.id,
    );
    expect(timeline.tracks[0]!.routed).toBe(true);
  });

  it('changes its route hash with a new import, but not other modes', () => {
    const track = trackOf(imported().project);
    const reimported = {
      ...track,
      imported: { ...track.imported!, fingerprint: 'other' },
    };
    expect(computeRouteInputHash(reimported)).not.toBe(computeRouteInputHash(track));
    const road = { waypoints: track.waypoints, routing: { mode: 'road' as const } };
    expect(computeRouteInputHash({ ...road, imported: { fingerprint: 'x' } })).toBe(
      computeRouteInputHash(road),
    );
    // Without its line a gpx track has no route.
    const { imported: _line, ...bare } = track;
    expect(computeLocalRoute(bare, 'now')).toBeUndefined();
  });
});
