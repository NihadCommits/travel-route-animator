import { describe, expect, it } from 'vitest';
import type { Recording } from '../model/track';
import {
  buildRecording,
  channelAt,
  cutRecording,
  distanceAtTime,
  MAX_RECORDING_SAMPLES,
  recordingSec,
  speedAt,
  timeAtDistance,
  type TimedSample,
} from './recording';

const T0 = Date.UTC(2026, 6, 14, 6, 30);

/** 10 minutes walking at 1.5 m/s, a 5 minute stop, 5 more minutes; a sample every 5 s. */
function walkWithStop(): TimedSample[] {
  const samples: TimedSample[] = [];
  let atM = 0;
  for (let s = 0; s <= 20 * 60; s += 5) {
    const standing = s > 10 * 60 && s <= 15 * 60;
    if (s > 0 && !standing) atM += 7.5;
    samples.push({ time: T0 + s * 1000, atM, hr: standing ? 95 : 120 });
  }
  return samples;
}

describe('buildRecording', () => {
  it('samples at even steps and keeps the stop, the start time and the heart rate', () => {
    const recording = buildRecording(walkWithStop(), true)!;
    expect(recording.startedAt).toBe('2026-07-14T06:30:00.000Z');
    expect(recording.stepSec).toBe(1);
    expect(recordingSec(recording)).toBe(20 * 60);
    // Standing still from minute 10 to 15: the distance does not move.
    expect(distanceAtTime(recording, 11 * 60)).toBe(distanceAtTime(recording, 14 * 60));
    expect(distanceAtTime(recording, 20 * 60)).toBe(1350);
    expect(channelAt(recording, 'heartRateBpm', 12 * 60)).toBe(95);
    expect(channelAt(recording, 'heartRateBpm', 5 * 60)).toBe(120);
    expect(recording.cadenceRpm).toBeUndefined();
  });

  it('grows the step on long trips, never goes back, and drops times that do', () => {
    const day: TimedSample[] = Array.from({ length: 2000 }, (_, i) => ({
      time: T0 + i * 30_000,
      // GPS jitter: every tenth point a little behind the one before.
      atM: i * 50 - (i % 10 === 0 ? 30 : 0),
    }));
    day.splice(500, 0, { time: T0, atM: 0 });
    const recording = buildRecording(day, true)!;
    expect(recording.atM.length).toBeLessThanOrEqual(MAX_RECORDING_SAMPLES + 1);
    expect(recording.stepSec).toBeGreaterThan(1);
    expect(recording.atM.every((at, i) => i === 0 || at >= recording.atM[i - 1]!)).toBe(true);
  });

  it('has no start time for DJI subtitles and nothing without two timed points', () => {
    expect(buildRecording(walkWithStop(), false)!.startedAt).toBeUndefined();
    expect(buildRecording([{ time: T0, atM: 0 }], true)).toBeUndefined();
    expect(
      buildRecording(
        [
          { time: T0, atM: 0 },
          { time: T0, atM: 5 },
        ],
        true,
      ),
    ).toBeUndefined();
  });

  it('fills short sensor gaps from a neighbour and leaves long ones empty', () => {
    const samples: TimedSample[] = [
      { time: T0, atM: 0, hr: 100 },
      { time: T0 + 4000, atM: 4 },
      { time: T0 + 60_000, atM: 60 },
      { time: T0 + 64_000, atM: 64, hr: 140 },
    ];
    const recording = buildRecording(samples, true)!;
    expect(recording.heartRateBpm![2]).toBe(100);
    expect(recording.heartRateBpm![30]).toBeNull();
    expect(channelAt(recording, 'heartRateBpm', 30)).toBeUndefined();
    expect(recording.heartRateBpm![63]).toBe(140);
  });
});

describe('reading a recording', () => {
  const recording: Recording = { stepSec: 10, atM: [0, 10, 30, 30, 30, 60], startedAt: undefined };

  it('finds when a place was reached, the first time', () => {
    expect(timeAtDistance(recording, 0)).toBe(0);
    expect(timeAtDistance(recording, 20)).toBe(15);
    expect(timeAtDistance(recording, 30)).toBe(20);
    expect(timeAtDistance(recording, 45)).toBe(45);
    expect(timeAtDistance(recording, 99)).toBe(50);
  });

  it('measures speed over a window, zero while standing', () => {
    const steady: Recording = { stepSec: 1, atM: Array.from({ length: 61 }, (_, i) => i * 2) };
    expect(speedAt(steady, 30)).toBeCloseTo(2, 6);
    const stop: Recording = { stepSec: 1, atM: Array.from({ length: 61 }, () => 5) };
    expect(speedAt(stop, 30)).toBe(0);
  });
});

describe('cutRecording', () => {
  it('starts when the trip left the first stop and ends when it reached the last', () => {
    // Waits 30 s at the start, walks 1 m/s for 100 s, stands 20 s, walks on for 50 s.
    const atM = [
      ...Array.from({ length: 30 }, () => 0),
      ...Array.from({ length: 100 }, (_, i) => i + 1),
      ...Array.from({ length: 20 }, () => 100),
      ...Array.from({ length: 50 }, (_, i) => 101 + i),
    ];
    const full: Recording = {
      startedAt: '2026-07-14T06:30:00.000Z',
      stepSec: 1,
      atM,
      heartRateBpm: atM.map((at) => 100 + Math.round(at / 10)),
    };
    const cut = cutRecording(full, 0, 120, 240)!;
    expect(cut.startedAt).toBe('2026-07-14T06:30:29.000Z');
    expect(cut.atM[0]).toBe(0);
    expect(cut.atM.at(-1)).toBe(240);
    expect(cut.heartRateBpm).toHaveLength(cut.atM.length);
    // The stand at 100 m is inside, stretched to the route's length: 200 m.
    expect(timeAtDistance(cut, 200)).toBe(timeAtDistance(full, 100) - 29);
    expect(cutRecording(full, 50, 50, 10)).toBeUndefined();
  });
});
