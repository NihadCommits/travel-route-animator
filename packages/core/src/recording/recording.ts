import type { Recording } from '../model/track';

// What a watch or app recorded, as samples at even steps of real time (M16, ADR 0017). The
// line of a track is simplified to a few hundred points; time cannot be, a pause on a straight
// road would vanish. So time, heart rate and cadence live in their own series, each sample
// saying how far along the line the trip was by then.

/** More samples than this only make the file bigger; the step grows instead. */
export const MAX_RECORDING_SAMPLES = 3000;
/** Below this (m/s) the trip counts as standing still: a GPS never quite stops. */
export const STANDING_SPEED_MS = 0.3;
/** Speed is measured over this many seconds around a moment, so GPS jitter does not show. */
export const SPEED_WINDOW_SEC = 15;

export interface TimedSample {
  /** Milliseconds. */
  time: number;
  /** Metres along the line. */
  atM: number;
  hr?: number | undefined;
  cad?: number | undefined;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** The index of the last sample at or before `time` (samples sorted by time). */
function lastAtOrBefore(samples: readonly TimedSample[], time: number): number {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (samples[mid]!.time <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * A sensor value at `time`: between two readings in a row it is interpolated, next to a gap it
 * is the closer reading if that is at most 10 s away, else null.
 */
function sensorAt(samples: readonly TimedSample[], key: 'hr' | 'cad', time: number): number | null {
  const i = lastAtOrBefore(samples, time);
  const a = samples[i]!;
  const b = samples[Math.min(i + 1, samples.length - 1)]!;
  const va = a[key];
  const vb = b[key];
  if (va !== undefined && vb !== undefined && b.time > a.time) {
    return Math.round(va + ((vb - va) * (time - a.time)) / (b.time - a.time));
  }
  const near = [a, b]
    .filter((s) => s[key] !== undefined && Math.abs(s.time - time) <= 10_000)
    .sort((x, y) => Math.abs(x.time - time) - Math.abs(y.time - time))[0];
  return near ? Math.round(near[key]!) : null;
}

/**
 * Samples at even steps from points with times. `absolute`: the times are real clock times
 * (GPX, TCX, FIT), not seconds into a video (DJI). Undefined without at least two timed points.
 */
export function buildRecording(
  points: readonly TimedSample[],
  absolute: boolean,
): Recording | undefined {
  // Times must not go back; a point that does is a GPS hiccup and is left out.
  const timed: TimedSample[] = [];
  for (const point of points) {
    if (timed.length === 0 || point.time >= timed.at(-1)!.time) timed.push(point);
  }
  if (timed.length < 2) return undefined;
  const first = timed[0]!.time;
  const totalSec = (timed.at(-1)!.time - first) / 1000;
  if (totalSec <= 0) return undefined;
  const stepSec = Math.max(1, Math.ceil(totalSec / (MAX_RECORDING_SAMPLES - 1)));
  const count = Math.ceil(totalSec / stepSec) + 1;

  const atM: number[] = [];
  const hr: (number | null)[] = [];
  const cad: (number | null)[] = [];
  let furthest = 0;
  for (let k = 0; k < count; k++) {
    // Even steps; the last may reach a little past the end, where the trip stands still.
    const time = first + k * stepSec * 1000;
    const i = lastAtOrBefore(timed, time);
    const a = timed[i]!;
    const b = timed[Math.min(i + 1, timed.length - 1)]!;
    const at =
      b.time > a.time ? a.atM + ((b.atM - a.atM) * (time - a.time)) / (b.time - a.time) : a.atM;
    // Never backwards along the line: a GPS jitters, the trip does not.
    furthest = Math.max(furthest, at);
    atM.push(round1(furthest));
    hr.push(sensorAt(timed, 'hr', time));
    cad.push(sensorAt(timed, 'cad', time));
  }
  const hasHr = hr.some((value) => value !== null);
  const hasCad = cad.some((value) => value !== null);
  return {
    ...(absolute && { startedAt: new Date(first).toISOString() }),
    stepSec,
    atM,
    ...(hasHr && { heartRateBpm: hr }),
    ...(hasCad && { cadenceRpm: cad }),
  };
}

/** Seconds into the recording when it was `s` metres along: the first time it got there. */
export function timeAtDistance(recording: Recording, s: number): number {
  const { atM, stepSec } = recording;
  if (s <= atM[0]!) return 0;
  if (s >= atM.at(-1)!) {
    // Arrived: the first sample at the end, not the time spent standing there afterwards.
    return atM.indexOf(atM.at(-1)!) * stepSec;
  }
  let low = 0;
  let high = atM.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (atM[mid]! < s) low = mid + 1;
    else high = mid;
  }
  const a = atM[low - 1]!;
  const b = atM[low]!;
  return (low - 1 + (b > a ? (s - a) / (b - a) : 1)) * stepSec;
}

/** Metres along the line `t` seconds into the recording. */
export function distanceAtTime(recording: Recording, t: number): number {
  const { atM, stepSec } = recording;
  const position = Math.max(0, Math.min(atM.length - 1, t / stepSec));
  const i = Math.floor(position);
  const a = atM[i]!;
  const b = atM[Math.min(i + 1, atM.length - 1)]!;
  return a + (b - a) * (position - i);
}

/** Length of the recording in seconds. */
export function recordingSec(recording: Recording): number {
  return (recording.atM.length - 1) * recording.stepSec;
}

/** A sensor's value `t` seconds in; undefined where it measured nothing. */
export function channelAt(
  recording: Recording,
  channel: 'heartRateBpm' | 'cadenceRpm',
  t: number,
): number | undefined {
  const values = recording[channel];
  if (!values) return undefined;
  const position = Math.max(0, Math.min(values.length - 1, t / recording.stepSec));
  const a = values[Math.floor(position)];
  const b = values[Math.min(Math.floor(position) + 1, values.length - 1)];
  if (a === null || a === undefined) return b ?? undefined;
  if (b === null || b === undefined) return a;
  return Math.round(a + (b - a) * (position - Math.floor(position)));
}

/** Speed in m/s `t` seconds in, over SPEED_WINDOW_SEC around it. */
export function speedAt(recording: Recording, t: number): number {
  const total = recordingSec(recording);
  const from = Math.max(0, t - SPEED_WINDOW_SEC / 2);
  const to = Math.min(total, t + SPEED_WINDOW_SEC / 2);
  if (to <= from) return 0;
  return (distanceAtTime(recording, to) - distanceAtTime(recording, from)) / (to - from);
}

/**
 * The part of a recording between two places on its line, `fromM` to `toM`, measured from
 * `fromM` and stretched to `lengthM` (the route built between them may be a little shorter or
 * longer than the line). It starts when the trip left `fromM`, so waiting at the start before
 * setting off is not part of it, and ends when it reached `toM`.
 */
export function cutRecording(
  recording: Recording,
  fromM: number,
  toM: number,
  lengthM: number,
): Recording | undefined {
  const { atM, stepSec } = recording;
  if (toM <= fromM || lengthM <= 0) return undefined;
  // The last sample still at or before the start, then the first at or past the end.
  let first = 0;
  while (first + 1 < atM.length && atM[first + 1]! <= fromM) first++;
  const startSec = first * stepSec;
  const endSec = timeAtDistance(recording, toM);
  if (endSec <= startSec) return undefined;
  const count = Math.ceil((endSec - startSec) / stepSec) + 1;
  const scale = lengthM / (toM - fromM);
  const times = Array.from({ length: count }, (_, k) => startSec + k * stepSec);
  const along = times.map((t) =>
    round1(Math.max(0, Math.min(lengthM, (distanceAtTime(recording, t) - fromM) * scale))),
  );
  const sensor = (channel: 'heartRateBpm' | 'cadenceRpm') =>
    recording[channel] && times.map((t) => channelAt(recording, channel, t) ?? null);
  const heartRateBpm = sensor('heartRateBpm');
  const cadenceRpm = sensor('cadenceRpm');
  return {
    ...(recording.startedAt && {
      startedAt: new Date(Date.parse(recording.startedAt) + startSec * 1000).toISOString(),
    }),
    stepSec,
    atM: along,
    ...(heartRateBpm && { heartRateBpm }),
    ...(cadenceRpm && { cadenceRpm }),
  };
}
