import { describe, expect, it } from 'vitest';
import { addEtappe, addGroup, editEtappe, editTrack } from '../edit/operations';
import { computeFrameState } from '../frame/computeFrameState';
import { distanceAt } from '../frame/position';
import { parseFit } from '../import/fit';
import { importTrack } from '../import/importTrack';
import { createProject } from '../model/factories';
import type { Etappe } from '../model/etappe';
import type { Project } from '../model/project';
import type { Track } from '../model/track';
import { validateProject } from '../model/validation';
import { refreshLocalRoutes } from '../routing/refresh';
import { writeFit, type FitTestPoint } from '../testing/fitWriter';
import { compileTimeline } from './compileTimeline';

// "Echtes Tempo" and what a recording shows in the video (M16): a hike recorded by a watch,
// 30 minutes up at 1 m/s, a 10 minute rest at the hut, 10 minutes down at 3 m/s.

const START_S = Date.UTC(2026, 6, 14, 6, 30) / 1000;
/** About 0.9 m per 0.00001° of longitude at 47.5° N. */
const DEG_PER_M = 1 / 75_000;

function hikeFit(): Uint8Array {
  const points: FitTestPoint[] = [];
  let atM = 0;
  const add = (seconds: number, speed: number, hr: number) => {
    for (let k = 0; k < seconds; k += 10) {
      points.push({
        timeS: START_S + points.length * 10,
        lat: 47.5,
        lng: 13 + atM * DEG_PER_M,
        hr,
        ele: 800 + atM / 10,
      });
      atM += speed * 10;
    }
  };
  add(30 * 60, 1, 140);
  add(10 * 60, 0, 90);
  add(10 * 60, 3, 120);
  points.push({
    timeS: START_S + points.length * 10,
    lat: 47.5,
    lng: 13 + atM * DEG_PER_M,
    hr: 118,
  });
  return writeFit(points, { sport: 17 });
}

function project(
  edit: (track: Track) => Track = (t) => t,
  etappe?: Partial<Etappe>,
): {
  project: Project;
  etappeId: string;
} {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const stage = addEtappe(group.project, group.id, 'Wanderung');
  const added = importTrack(stage.project, stage.id, parseFit(hikeFit(), 'hike.fit'), {
    vehicleType: 'hike',
    names: { start: 'Start', end: 'Ziel', pause: 'Rast' },
    withStops: false,
  });
  let next = editTrack(added.project, added.id, edit);
  next = editEtappe(next, stage.id, (e) => ({ ...e, durationSec: 20, ...etappe }));
  return { project: refreshLocalRoutes(next, '2026-11-16T10:00:00.000Z'), etappeId: stage.id };
}

const recorded =
  (skipPauses = false) =>
  (track: Track): Track => ({
    ...track,
    timing: { ...track.timing, easing: 'ease-in-out', pace: 'recorded', skipPauses },
  });

describe('the recorded pace', () => {
  it('is a valid track that moves like the hike: slow up, standing at the hut, fast down', () => {
    const { project: trip, etappeId } = project(recorded());
    expect(validateProject(trip).success).toBe(true);
    const timeline = compileTimeline(trip, etappeId);
    const plan = timeline.tracks[0]!;
    const length = plan.line.lengthM;
    // 50 minutes squeezed into 20 seconds: the climb (1800 m of 3600 m) takes 12 s.
    expect(distanceAt(plan, 6) / length).toBeCloseTo(0.25, 1);
    expect(distanceAt(plan, 12) / length).toBeCloseTo(0.5, 1);
    // The rest at the hut: 4 seconds without moving.
    expect(distanceAt(plan, 15)).toBeCloseTo(distanceAt(plan, 12.2), 0);
    // Down in the last 4 seconds, three times as fast as up.
    expect(distanceAt(plan, 20) / length).toBeCloseTo(1, 3);
    expect(plan.easing).toBe('linear');
    // The rest is one hold, while the recording's time runs through it: 30 to 40 minutes.
    const rest = plan.phases.find((p) => p.kind === 'hold')!;
    expect(rest.recordedSec).toEqual({ from: 1800, to: 2400 });
    expect(rest.endSec - rest.startSec).toBeCloseTo(4, 6);
  });

  it('leaves the long rest out with skipPauses, and eases evenly without a recorded pace', () => {
    const skipping = compileTimeline(
      ...(Object.values(project(recorded(true))) as [Project, string]),
    );
    const plan = skipping.tracks[0]!;
    // Without the rest: up in 15 s, down in 5 s.
    expect(distanceAt(plan, 15) / plan.line.lengthM).toBeCloseTo(0.5, 1);
    const eased = compileTimeline(
      ...(Object.values(
        // An import with timestamps starts at the recorded pace; switched back to an even one.
        project((track) => ({ ...track, timing: { ...track.timing, pace: 'eased' } })),
      ) as [Project, string]),
    );
    expect(eased.tracks[0]!.easing).toBe('ease-in-out');
    expect(distanceAt(eased.tracks[0]!, 10) / eased.tracks[0]!.line.lengthM).toBeCloseTo(0.5, 2);
  });

  it('still stops where the stop holds say', () => {
    const { project: trip, etappeId } = project((track) => ({
      ...recorded()(track),
      waypoints: track.waypoints.map((w, i) => (i === 1 ? { ...w, holdSec: 2 } : w)),
    }));
    const plan = compileTimeline(trip, etappeId).tracks[0]!;
    // The hold at the end comes after arriving, so the trip arrives 2 s earlier.
    expect(distanceAt(plan, 18) / plan.line.lengthM).toBeCloseTo(1, 3);
  });
});

describe('what a recording shows', () => {
  const counters = (trip: { project: Project; etappeId: string }, sec: number) => {
    const timeline = compileTimeline(trip.project, trip.etappeId);
    return computeFrameState(timeline, Math.round((sec + timeline.introSec) * timeline.fps))
      .counters;
  };
  const on = {
    overlays: {
      labels: true,
      distanceCounter: true,
      timeCounter: true,
      attribution: true,
      attributionCorner: 'bottom-right',
      elevationProfile: false,
      elevationCounter: false,
      speedCounter: true,
      heartRateCounter: true,
      clockCounter: true,
    },
  } as const;

  it('gives the real speed, heart rate and elapsed time where the hiker is', () => {
    const trip = project(recorded(), on);
    const climbing = counters(trip, 6);
    expect(climbing.speedKmh).toBeCloseTo(3.6, 0);
    expect(climbing.heartRateBpm).toBe(140);
    expect(climbing.travelSec! / 60).toBeCloseTo(15, 0);
    const resting = counters(trip, 14);
    expect(resting.speedKmh).toBe(0);
    expect(resting.heartRateBpm).toBe(90);
    const down = counters(trip, 18);
    expect(down.speedKmh).toBeCloseTo(10.8, 0);
  });

  it("runs a recorded clock from when the watch started, in the stage's time zone", () => {
    const trip = project(recorded(), {
      ...on,
      clock: { source: 'recorded', timeZone: 'Europe/Vienna' },
    });
    expect(counters(trip, 0).clockMs).toBe(START_S * 1000);
    // 15 minutes of climbing: 06:45 UTC.
    expect(counters(trip, 6).clockMs! - START_S * 1000).toBeCloseTo(15 * 60_000, -4);
  });

  it('runs a typed clock with the travel time, or stands at the departure without one', () => {
    const typed = project(recorded(), {
      ...on,
      clock: { source: 'manual', departure: '2026-07-14T09:00', timeZone: 'Europe/Vienna' },
    });
    const nine = Date.UTC(2026, 6, 14, 7, 0);
    expect(counters(typed, 0).clockMs).toBe(nine);
    // The whole hike took 50 minutes.
    expect(counters(typed, 20).clockMs! - nine).toBeCloseTo(50 * 60_000, -4);
    const without = project((t) => ({ ...t, imported: { ...t.imported!, recording: undefined } }), {
      ...on,
      clock: { source: 'manual', departure: '2026-07-14T09:00', timeZone: 'Europe/Vienna' },
    });
    expect(counters(without, 10)).toMatchObject({ clockMs: nine });
    expect(counters(without, 10)).not.toHaveProperty('speedKmh');
  });
});
