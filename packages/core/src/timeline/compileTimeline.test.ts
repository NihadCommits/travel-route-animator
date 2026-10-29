import { describe, expect, it } from 'vitest';
import { assembleComputedRoute } from '../routing/assemble';
import { trip } from '../testing/trip';
import { compileTimeline } from './compileTimeline';

// A line along the 38th parallel: 0.1° of longitude is about 8.77 km here.
const A: [number, number] = [-9.0, 38.0];
const B: [number, number] = [-8.9, 38.0];
const C: [number, number] = [-8.7, 38.0];

describe('compileTimeline', () => {
  it('knows the video format and has one frame more than its length, for the arrival', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', A],
            ['C', C],
          ],
        },
      ],
      etappe: {
        intro: { type: 'overview-to-start', durationSec: 1 },
        outro: { type: 'overview', durationSec: 2 },
      },
      output: { fps: 25, resolution: '2160p' },
    });
    const timeline = compileTimeline(project, etappeId);
    expect(timeline).toMatchObject({
      fps: 25,
      width: 3840,
      height: 2160,
      viewport: { width: 1920, height: 1080 },
      scale: 2,
      introSec: 1,
      mainSec: 10,
      outroSec: 2,
      durationInFrames: 13 * 25 + 1,
    });
  });

  it('draws a lighter preview with fewer pixels but the same framing', () => {
    const { project, etappeId } = trip({
      tracks: [
        {
          points: [
            ['A', A],
            ['C', C],
          ],
        },
      ],
    });
    const full = compileTimeline(project, etappeId);
    const half = compileTimeline(project, etappeId, { previewScale: 0.5 });
    expect([half.width, half.height, half.scale]).toEqual([960, 540, 0.5]);
    expect(half.viewport).toEqual(full.viewport);
    expect(half.durationInFrames).toBe(full.durationInFrames);
    const vertical = compileTimeline(project, etappeId, {
      output: { aspect: '9:16' },
      previewScale: 0.5,
    });
    expect([vertical.width, vertical.height]).toEqual([540, 960]);
    expect(vertical.viewport).toEqual({ width: 1080, height: 1920 });
  });

  it('drives the whole way in one eased stretch when there are no holds', () => {
    const { project, etappeId } = trip({
      durationSec: 8,
      tracks: [
        {
          points: [
            ['A', A],
            ['~', B],
            ['C', C],
          ],
        },
      ],
    });
    const [plan] = compileTimeline(project, etappeId).tracks;
    expect(plan!.phases).toEqual([
      { kind: 'move', startSec: 0, endSec: 8, fromM: 0, toM: plan!.line.lengthM },
    ]);
    expect(plan!.routed).toBe(true);
    expect(plan!.provider).toBe('local-straight');
  });

  it('shares the driving time by distance around holds, which take their own seconds', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', A, 1],
            ['B', B, 2],
            ['C', C],
          ],
        },
      ],
    });
    const [plan] = compileTimeline(project, etappeId).tracks;
    const atB = plan!.stops[1]!.atM;
    // 7 s of driving: a third of the way to B, two thirds from B to C.
    expect(plan!.phases.map((p) => [p.kind, round(p.startSec), round(p.endSec)])).toEqual([
      ['hold', 0, 1],
      ['move', 1, round(1 + (7 * atB) / plan!.line.lengthM)],
      [
        'hold',
        round(1 + (7 * atB) / plan!.line.lengthM),
        round(3 + (7 * atB) / plan!.line.lengthM),
      ],
      ['move', round(3 + (7 * atB) / plan!.line.lengthM), 10],
    ]);
    expect(atB / plan!.line.lengthM).toBeCloseTo(1 / 3, 2);
  });

  it('starts late and stops early as the track timing says', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', A],
            ['C', C],
          ],
          timing: { startOffsetSec: 2, durationSec: 5 },
        },
      ],
    });
    const [plan] = compileTimeline(project, etappeId).tracks;
    expect([plan!.startSec, plan!.endSec]).toEqual([2, 7]);
    expect(plan!.phases[0]).toMatchObject({ startSec: 2, endSec: 7 });
  });

  it('arrives before a closing overview, unless the track has its own duration', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', A],
            ['C', C],
          ],
        },
        {
          points: [
            ['A', A],
            ['C', C],
          ],
          timing: { durationSec: 10 },
        },
      ],
      camera: { endWithOverview: true },
    });
    const [untilEnd, ownDuration] = compileTimeline(project, etappeId).tracks;
    // The closing overview takes 15 % of 10 s; the vehicle stands at its goal meanwhile.
    expect(untilEnd!.endSec).toBeCloseTo(8.5, 9);
    expect(ownDuration!.endSec).toBe(10);
  });

  it('shortens holds that leave no time to drive, so the stage still plays', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', A, 6],
            ['C', C, 6],
          ],
        },
      ],
    });
    const [plan] = compileTimeline(project, etappeId).tracks;
    const holds = plan!.phases.filter((p) => p.kind === 'hold');
    expect(holds.reduce((sum, p) => sum + p.endSec - p.startSec, 0)).toBeCloseTo(9, 9);
    expect(plan!.phases.at(-1)!.endSec).toBeCloseTo(10, 9);
  });

  it('knows when the vehicle reaches each stop', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', A],
            ['B', B],
            ['C', C],
          ],
          timing: { easing: 'linear' },
        },
      ],
    });
    const [plan] = compileTimeline(project, etappeId).tracks;
    expect(plan!.stops.map((stop) => [stop.name, stop.isStart])).toEqual([
      ['A', true],
      ['B', false],
      ['C', false],
    ]);
    expect(plan!.stops[1]!.arrivalSec).toBeCloseTo(10 / 3, 2);
    expect(plan!.stops[2]!.arrivalSec).toBeCloseTo(10, 6);
  });

  it('places stops at the start of their leg on a stored route', () => {
    const { project, etappeId } = trip({
      tracks: [
        {
          points: [
            ['A', A],
            ['B', B],
            ['C', C],
          ],
          routing: { mode: 'road' },
        },
      ],
    });
    const track = project.groups[0]!.etappen[0]!.tracks[0]!;
    track.computed = assembleComputedRoute(
      track,
      {
        provider: 'ors',
        legs: [
          { line: [A, [-8.95, 38.01], B], distanceM: 9_500, durationS: 600 },
          { line: [B, C], distanceM: 18_000, durationS: 900 },
        ],
      },
      '2026-10-27T10:00:00.000Z',
    );
    const [plan] = compileTimeline(project, etappeId).tracks;
    expect(plan).toMatchObject({ routed: true, provider: 'ors', distanceM: 27_500 });
    expect(plan!.stops[1]!.lngLat).toEqual(B);
    expect(plan!.stops[1]!.atM).toBe(plan!.line.cumulative[2]);
  });

  it('stands in straight lines for a road route that is missing or no longer fits', () => {
    const { project, etappeId } = trip({
      tracks: [
        {
          points: [
            ['A', A],
            ['C', C],
          ],
          routing: { mode: 'road' },
        },
      ],
    });
    const [plan] = compileTimeline(project, etappeId).tracks;
    expect(plan).toMatchObject({ routed: false, provider: undefined });
    expect(plan!.line.points).toEqual([A, C]);
  });

  it('computes missing flight routes itself and frames all routes in the overview', () => {
    const { project, etappeId } = trip({
      tracks: [
        {
          vehicle: 'plane',
          routing: { mode: 'great-circle' },
          points: [
            ['VIE', [16.57, 48.11]],
            ['OPO', [-8.68, 41.25]],
          ],
        },
        {
          points: [
            ['A', A],
            ['C', C],
          ],
        },
      ],
    });
    const timeline = compileTimeline(project, etappeId);
    expect(timeline.tracks[0]!.provider).toBe('local-great-circle');
    expect(timeline.overview).toMatchObject({ west: -9, east: 16.57, south: 38 });
  });

  it('leaves out tracks without points and lets a single point stand', () => {
    const { project, etappeId } = trip({ tracks: [{ points: [] }, { points: [['A', A]] }] });
    const { tracks } = compileTimeline(project, etappeId);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.line.lengthM).toBe(0);
  });

  it('refuses a stage that does not exist', () => {
    const { project } = trip({ tracks: [] });
    expect(() => compileTimeline(project, 'e_nope')).toThrow(/does not exist/);
  });
});

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
