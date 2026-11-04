import { describe, expect, it } from 'vitest';
import { distanceM } from '../geo/distance';
import type { LngLat } from '../geo/lngLat';
import { trip, type TripOptions, type TripTrack } from '../testing/trip';
import { compileTimeline } from '../timeline/compileTimeline';
import { cameraAt, globeZoomShift } from './camera';
import { computeFrameState } from './computeFrameState';
import {
  altitudeAt,
  arcUntil,
  climbDegAt,
  FAKE_LIFT,
  flightStyleFor,
  liftedPoint,
  type FlightPlan,
} from './flight';

const VIE: LngLat = [16.57, 48.11];
const FRA: LngLat = [8.57, 50.03];
const OPO: LngLat = [-8.68, 41.25];
/** Following the plane without overview zooms or smoothing over time. */
const FOLLOW = {
  mode: 'follow',
  lagSec: 0,
  startWithOverview: false,
  endWithOverview: false,
} as const;

function flightTrip(points: TripTrack['points'], options: Partial<TripOptions> = {}) {
  const { project, etappeId } = trip({
    output: { fps: 25 },
    durationSec: 10,
    ...options,
    tracks: [
      {
        vehicle: 'plane',
        points,
        timing: { easing: 'linear' },
        ...options.tracks?.[0],
      },
    ],
  });
  return compileTimeline(project, etappeId);
}

const flightOf = (timeline: ReturnType<typeof flightTrip>): FlightPlan => {
  const flight = timeline.tracks[0]!.flight;
  if (!flight) throw new Error('no flight plan');
  return flight;
};

describe('flight profile', () => {
  it('rises from the airport, peaks halfway at the share of the distance and lands again', () => {
    const timeline = flightTrip([
      ['Wien', VIE],
      ['Porto', OPO],
    ]);
    const flight = flightOf(timeline);
    const { lengthM } = timeline.tracks[0]!.line;
    expect(altitudeAt(flight, 0)).toBe(0);
    expect(altitudeAt(flight, lengthM)).toBeCloseTo(0, 6);
    expect(altitudeAt(flight, lengthM / 2)).toBeCloseTo(0.15 * lengthM, 6);
    expect(altitudeAt(flight, lengthM / 4)).toBeCloseTo(0.15 * lengthM * Math.SQRT1_2, 6);
  });

  it('lands at every stop, but not at a shape point', () => {
    const timeline = flightTrip([
      ['Wien', VIE],
      ['Frankfurt', FRA],
      ['~', [0, 46]],
      ['Porto', OPO],
    ]);
    const flight = flightOf(timeline);
    expect(flight.legs).toHaveLength(2);
    const [first, second] = flight.legs;
    expect(altitudeAt(flight, first!.toM)).toBeCloseTo(0, 6);
    // Each hop climbs to its own height: the long second one higher than the short first.
    expect(first!.peakM).toBeCloseTo(0.15 * (first!.toM - first!.fromM), 6);
    expect(second!.peakM).toBeGreaterThan(first!.peakM);
  });

  it('points the nose up while climbing, down while descending and level at the gate', () => {
    const timeline = flightTrip([
      ['Wien', VIE],
      ['Porto', OPO],
    ]);
    const flight = flightOf(timeline);
    const { lengthM } = timeline.tracks[0]!.line;
    expect(climbDegAt(flight, 0)).toBe(0);
    expect(climbDegAt(flight, lengthM * 0.2)).toBeGreaterThan(5);
    expect(climbDegAt(flight, lengthM * 0.5)).toBeCloseTo(0, 6);
    expect(climbDegAt(flight, lengthM * 0.8)).toBeLessThan(-5);
    expect(climbDegAt(flight, lengthM)).toBeCloseTo(0, 6);
  });

  it('samples the arc densely and ends it at the plane', () => {
    const timeline = flightTrip([
      ['Wien', VIE],
      ['Porto', OPO],
    ]);
    const flight = flightOf(timeline);
    expect(flight.arc.points.length).toBeGreaterThanOrEqual(240);
    const head: LngLat = [3, 46];
    const s = timeline.tracks[0]!.line.lengthM * 0.4;
    const arc = arcUntil(flight, s, head);
    expect(arc.points.at(-1)).toEqual(head);
    expect(arc.altitudesM).toHaveLength(arc.points.length);
    expect(arc.altitudesM.at(-1)).toBeCloseTo(altitudeAt(flight, s), 6);
    expect(arcUntil(flight, 0, VIE).points).toEqual([VIE, VIE]);
  });

  it('gives cars no flight plan', () => {
    const { project, etappeId } = trip({
      tracks: [
        {
          points: [
            ['A', VIE],
            ['B', FRA],
          ],
        },
      ],
    });
    expect(compileTimeline(project, etappeId).tracks[0]!.flight).toBeUndefined();
  });
});

describe('frame state of a flight', () => {
  it('carries the height of the plane and of every point of its line', () => {
    const timeline = flightTrip([
      ['Wien', VIE],
      ['Porto', OPO],
    ]);
    const state = computeFrameState(timeline, 125);
    const track = state.tracks[0]!;
    expect(track.head.altitudeM).toBeGreaterThan(100_000);
    expect(track.flight?.revealedAltitudesM).toHaveLength(track.revealed.length);
    expect(track.flight?.revealedAltitudesM.at(-1)).toBe(track.head.altitudeM);
    expect(track.flight?.showShadow).toBe(true);
  });

  it('draws tilted views with the 3D arc and flat ones with fake 3D', () => {
    expect(flightStyleFor(40)).toBe('arc-3d');
    expect(flightStyleFor(0)).toBe('fake-3d');
    const flat = flightTrip(
      [
        ['Wien', VIE],
        ['Porto', OPO],
      ],
      { view: { mode: '2d', pitchDeg: 0 } },
    );
    expect(computeFrameState(flat, 0).flightStyle).toBe('fake-3d');
  });
});

describe('flight camera', () => {
  const route: TripTrack['points'] = [
    ['Wien', VIE],
    ['Porto', OPO],
  ];

  it('looks at the plane in the air on a tilted globe', () => {
    const timeline = flightTrip(route, { camera: FOLLOW });
    const state = computeFrameState(timeline, 125);
    const { head } = state.tracks[0]!;
    expect(state.camera.centerAltitudeM).toBeCloseTo(head.altitudeM, 6);
    // The centre lies beyond the plane by h · tan(40°): there its ray meets the ground.
    const target = liftedPoint(head.lngLat, head.altitudeM * Math.tan((40 * Math.PI) / 180), 0);
    expect(distanceM(state.camera.center, target)).toBeLessThan(1000);
  });

  it('starts and ends close to the airports and zooms out to the whole flight at the top', () => {
    const timeline = flightTrip(route, { camera: FOLLOW });
    const start = cameraAt(timeline, 0).zoom;
    const top = cameraAt(timeline, 5).zoom;
    const end = cameraAt(timeline, 10).zoom;
    expect(start - top).toBeGreaterThan(2.5);
    expect(end - top).toBeGreaterThan(2.5);
  });

  it('keeps the zoom when the take-off and landing camera is off', () => {
    const timeline = flightTrip(route, {
      camera: FOLLOW,
      view: { mode: '3d-tilted', pitchDeg: 45 },
      tracks: [{ points: route, flight: { takeoffLandingCamera: false } }],
    });
    expect(cameraAt(timeline, 0).zoom).toBeCloseTo(cameraAt(timeline, 5).zoom, 9);
  });

  it('keeps the globe the same size as the plane flies south', () => {
    // Further south the globe would shrink at the same zoom; the camera zooms in to match.
    expect(globeZoomShift(41, 48)).toBeGreaterThan(0);
    expect(globeZoomShift(48, 48)).toBe(0);
    const southward = Math.log2(Math.cos((41 * Math.PI) / 180) / Math.cos((48 * Math.PI) / 180));
    expect(globeZoomShift(41, 48)).toBeCloseTo(southward, 12);
  });

  it('looks at the lifted point on a flat map, not into the air', () => {
    const timeline = flightTrip(route, {
      camera: FOLLOW,
      view: { mode: '2d', pitchDeg: 0 },
    });
    const state = computeFrameState(timeline, 125);
    const { head } = state.tracks[0]!;
    const lifted = liftedPoint(head.lngLat, head.altitudeM * FAKE_LIFT, 0);
    // North of the plane's ground position, by the fake lift.
    expect(distanceM(state.camera.center, lifted)).toBeLessThan(1000);
  });
});

describe('liftedPoint', () => {
  it('moves along the compass direction', () => {
    const [lng, lat] = liftedPoint([10, 45], 111_320, 0);
    expect(lng).toBeCloseTo(10, 9);
    expect(lat).toBeCloseTo(46, 9);
    const [east] = liftedPoint([10, 0], 111_320, 90);
    expect(east).toBeCloseTo(11, 9);
  });
});
