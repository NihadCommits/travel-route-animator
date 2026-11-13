import { describe, expect, it } from 'vitest';
import { measureLine } from '../geo/along';
import { distanceM } from '../geo/distance';
import type { LngLat } from '../geo/lngLat';
import { defaultOverlays } from '../model/defaults';
import { trip, type TripOptions } from '../testing/trip';
import { compileTimeline } from '../timeline/compileTimeline';
import { cameraAt } from './camera';
import { computeFrameState, LABEL_FADE_SEC } from './computeFrameState';
import { headingAt } from './heading';

const A: LngLat = [-9.0, 38.0];
const B: LngLat = [-8.9, 38.0];
const C: LngLat = [-8.7, 38.0];

const FPS = 25;

function timelineOf(options: TripOptions) {
  const { project, etappeId, trackIds } = trip({ output: { fps: FPS }, ...options });
  return { timeline: compileTimeline(project, etappeId), trackIds };
}

const frameAt = (sec: number) => Math.round(sec * FPS);

describe('computeFrameState', () => {
  const { timeline } = timelineOf({
    durationSec: 10,
    tracks: [
      {
        points: [
          ['A', A],
          ['B', B, 2],
          ['C', C],
        ],
        timing: { easing: 'linear' },
      },
    ],
  });
  const head = (sec: number) => computeFrameState(timeline, frameAt(sec)).tracks[0]!;

  it('starts at the first point with nothing driven yet', () => {
    const track = head(0);
    expect(track.head.lngLat).toEqual(A);
    expect(track.revealed).toEqual([A, A]);
    expect(track.progress).toBe(0);
  });

  it('is on its way in the middle, with the driven line ending at the vehicle', () => {
    const track = head(1.5);
    expect(track.progress).toBeGreaterThan(0);
    expect(track.progress).toBeLessThan(1 / 3);
    expect(track.revealed.at(-1)).toEqual(track.head.lngLat);
  });

  it('stands still at a stop for its hold', () => {
    const arrival = timeline.tracks[0]!.stops[1]!.arrivalSec;
    const during = [arrival + 0.2, arrival + 1, arrival + 1.8].map((sec) => head(sec).head.lngLat);
    for (const position of during) {
      expect(position[0]).toBeCloseTo(B[0], 9);
      expect(position[1]).toBeCloseTo(B[1], 9);
    }
    expect(head(arrival + 2.3).progress).toBeGreaterThan(head(arrival + 1).progress);
  });

  it('arrives exactly on the last frame and the whole line is drawn', () => {
    const last = computeFrameState(timeline, timeline.durationInFrames - 1).tracks[0]!;
    expect(last.head.lngLat).toEqual(C);
    expect(last.progress).toBe(1);
    expect(last.revealed).toHaveLength(3);
  });

  it('gives the same state for a frame, in whatever order frames are asked for', () => {
    const frames = Array.from({ length: timeline.durationInFrames }, (_, i) => i);
    const inOrder = frames.map((frame) => computeFrameState(timeline, frame));
    const shuffled = [...frames].sort((a, b) => ((a * 7919) % 251) - ((b * 7919) % 251));
    for (const frame of shuffled) {
      expect(computeFrameState(timeline, frame)).toEqual(inOrder[frame]);
    }
    expect(computeFrameState(timeline, 42)).toEqual(computeFrameState(timeline, 42));
  });
});

describe('several tracks in parallel', () => {
  const { timeline, trackIds } = timelineOf({
    durationSec: 10,
    tracks: [
      {
        points: [
          ['Porto', [-8.61, 41.15]],
          ['Lisboa', [-9.14, 38.72]],
        ],
      },
      {
        points: [
          ['Porto', [-8.61, 41.15]],
          ['Faro', [-7.93, 37.02]],
        ],
        timing: { startOffsetSec: 2, durationSec: 6 },
      },
    ],
  });

  it('moves each track on its own clock', () => {
    const at = (sec: number) => computeFrameState(timeline, frameAt(sec)).tracks;
    expect(at(1).map((t) => t.trackId)).toEqual(trackIds);
    expect(at(1)[0]!.progress).toBeGreaterThan(0);
    // The second one waits for its start offset, then arrives at 8 s, before the stage ends.
    expect(at(1.9)[1]!.progress).toBe(0);
    expect(at(5)[1]!.progress).toBeGreaterThan(0);
    expect(at(8)[1]!.progress).toBe(1);
    expect(at(9)[0]!.progress).toBeLessThan(1);
  });
});

describe('heading', () => {
  it('points east along an eastward line, and the start already points the way', () => {
    const line = measureLine([A, C]);
    expect(headingAt(line, 0, 500)).toBeCloseTo(90, 6);
    expect(headingAt(line, line.lengthM / 2, 500)).toBeCloseTo(90, 6);
    expect(headingAt(measureLine([C, A]), 100, 500)).toBeCloseTo(270, 6);
    expect(headingAt(measureLine([A, [-9.0, 38.1]]), 50, 500)).toBeCloseTo(0, 6);
    expect(headingAt(measureLine([A]), 0, 500)).toBe(0);
  });

  it('does not shake on a road with small kinks', () => {
    // Heading north on a road that wiggles 4 m left and right every 30 m.
    const road: LngLat[] = Array.from({ length: 300 }, (_, i) => [
      -9.0 + (i % 2 === 0 ? 0.00005 : -0.00005),
      38.0 + i * 0.00027,
    ]);
    const { timeline } = timelineOf({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', road[0]!],
            ...road.slice(1, -1).map((p): [string, LngLat] => ['~', p]),
            ['B', road.at(-1)!],
          ],
        },
      ],
      camera: { mode: 'follow', zoom: 15, startWithOverview: false },
    });
    const headings = Array.from(
      { length: 9 * FPS },
      (_, i) => computeFrameState(timeline, i + FPS / 2).tracks[0]!.head.bearingDeg,
    );
    // Angles wrap at north: 359° to 1° is a turn of 2°.
    const turns = headings.slice(1).map((h, i) => {
      const d = Math.abs(h - headings[i]!) % 360;
      return Math.min(d, 360 - d);
    });
    // Raw segment directions swing by about ±16°; the icon turns by a degree at most.
    expect(Math.max(...turns)).toBeLessThan(1);
    for (const heading of headings) expect(Math.min(heading, 360 - heading)).toBeLessThan(3);
  });
});

describe('labels and counter', () => {
  const options: TripOptions = {
    durationSec: 10,
    tracks: [
      {
        points: [
          ['Lisboa', A],
          ['Silves', B],
          ['Faro', C],
        ],
        timing: { easing: 'linear' },
        // A visible route ahead shows every stop from the start; here they appear on arrival.
        style: { ahead: { opacity: 0, dash: 'solid' } },
      },
    ],
    etappe: {
      overlays: { ...defaultOverlays(), distanceCounter: true },
    },
  };

  it('shows the start at once and fades a stop in when the vehicle arrives', () => {
    const { timeline } = timelineOf(options);
    const arrival = timeline.tracks[0]!.stops[1]!.arrivalSec;
    const opacity = (sec: number, name: string) =>
      computeFrameState(timeline, frameAt(sec)).labels.find((l) => l.text === name)!.opacity;
    expect(opacity(0, 'Lisboa')).toBe(1);
    expect(opacity(arrival - 0.2, 'Silves')).toBe(0);
    expect(opacity(arrival + LABEL_FADE_SEC / 2, 'Silves')).toBeGreaterThan(0.3);
    expect(opacity(arrival + LABEL_FADE_SEC + 0.1, 'Silves')).toBe(1);
    expect(opacity(9, 'Faro')).toBe(0);
    expect(opacity(10, 'Faro')).toBe(0);
  });

  it('shows all stops ahead with a visible route ahead, and none when labels are off', () => {
    const ahead = timelineOf({
      ...options,
      tracks: [{ ...options.tracks[0]!, style: { ahead: { opacity: 0.2, dash: 'dotted' } } }],
    });
    const first = computeFrameState(ahead.timeline, 0);
    expect(first.labels.map((l) => l.opacity)).toEqual([1, 1, 1]);
    expect(first.tracks[0]!.ahead).toHaveLength(3);

    const off = timelineOf({
      ...options,
      etappe: { overlays: { ...options.etappe!.overlays!, labels: false } },
    });
    expect(computeFrameState(off.timeline, 0).labels).toEqual([]);
  });

  it('draws the route ahead from its end back to the vehicle, and none when it is hidden', () => {
    const visible = timelineOf({
      ...options,
      tracks: [{ ...options.tracks[0]!, style: { ahead: { opacity: 1, dash: 'dashed' } } }],
    });
    const track = computeFrameState(visible.timeline, frameAt(5)).tracks[0]!;
    // Starting at the fixed end keeps a dash pattern still while the vehicle moves (ADR 0008).
    expect(track.ahead![0]).toEqual(C);
    expect(track.ahead!.at(-1)).toEqual(track.head.lngLat);
    expect(track.revealed.at(-1)).toEqual(track.head.lngLat);

    const { timeline } = timelineOf(options);
    expect(computeFrameState(timeline, frameAt(5)).tracks[0]!.ahead).toBeUndefined();
  });

  it('counts kilometres up to the route distance', () => {
    const { timeline } = timelineOf(options);
    const km = (frame: number) => computeFrameState(timeline, frame).counters.distanceKm!;
    expect(km(0)).toBe(0);
    // Via Silves the route is a few millimetres longer than straight from Lisboa to Faro.
    expect(km(timeline.durationInFrames - 1)).toBeCloseTo(distanceM(A, C) / 1000, 3);
    expect(km(frameAt(5))).toBeCloseTo(distanceM(A, C) / 2000, 1);
  });
});

describe('sections', () => {
  it('waits at the start during the intro and at the end during the outro', () => {
    const { timeline } = timelineOf({
      durationSec: 4,
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
    });
    const intro = computeFrameState(timeline, frameAt(0.5));
    expect(intro.section).toBe('intro');
    expect(intro.sec).toBeCloseTo(-0.5, 1);
    expect(intro.tracks[0]!.progress).toBe(0);
    const outro = computeFrameState(timeline, timeline.durationInFrames - 1);
    expect(outro.section).toBe('outro');
    expect(outro.tracks[0]!.progress).toBe(1);
    // The outro ends on the overview.
    expect(outro.camera).toEqual(cameraAt(timeline, 99));
  });
});
