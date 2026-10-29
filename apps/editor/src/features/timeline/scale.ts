import type { TrackTiming } from '@travel-route-animator/core';

// The timeline's arithmetic, free of React and the DOM. Bars are placed in percent of the
// whole video, so their position depends only on time; pixels come in only while dragging.

/** The shortest a track can be dragged to. */
export const MIN_TRACK_SEC = 0.1;

/** Where a bar sits, in seconds of the stage's main part (after the intro). */
export interface BarSpan {
  startSec: number;
  endSec: number;
}

/** The middle of the bar moves it, the ends change start or end. */
export type DragHandle = 'move' | 'start' | 'end';

export interface DragLimits {
  /** The stage's own duration: a track may not start before 0 or run past it. */
  mainSec: number;
  fps: number;
  /** Shift while dragging: whole frames instead of tenths of a second. */
  toFrames: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Removes float noise such as 5.199999999999999 from sums of snapped values. */
const tidy = (sec: number) => Math.round(sec * 1e6) / 1e6;

export function snapSec(sec: number, fps: number, toFrames: boolean): number {
  const perSecond = toFrames ? fps : 10;
  return tidy(Math.round(sec * perSecond) / perSecond);
}

/**
 * The track's timing after dragging by `deltaSec`, always computed from where the drag began
 * so that rounding does not add up over many mouse moves.
 *
 * - **move:** the start changes. A track with its own duration moves as a whole; one that
 *   drives until the stage ends keeps that end.
 * - **start:** the start changes and the end stays where it is.
 * - **end:** the track gets its own duration, also one that drove until the stage ended.
 */
export function dragTiming(
  timing: TrackTiming,
  span: BarSpan,
  handle: DragHandle,
  deltaSec: number,
  { mainSec, fps, toFrames }: DragLimits,
): TrackTiming {
  const snap = (sec: number) => snapSec(sec, fps, toFrames);
  const ownDuration = timing.durationSec !== undefined;

  if (handle === 'end') {
    const endSec = clamp(snap(span.endSec + deltaSec), span.startSec + MIN_TRACK_SEC, mainSec);
    return { ...timing, durationSec: tidy(endSec - span.startSec) };
  }

  const moveWhole = handle === 'move' && ownDuration;
  const lengthSec = span.endSec - span.startSec;
  const latestStart = moveWhole ? mainSec - lengthSec : span.endSec - MIN_TRACK_SEC;
  const startOffsetSec = clamp(snap(span.startSec + deltaSec), 0, Math.max(0, latestStart));
  if (moveWhole || !ownDuration) return { ...timing, startOffsetSec };
  return { ...timing, startOffsetSec, durationSec: tidy(span.endSec - startOffsetSec) };
}

export function sameTiming(a: TrackTiming, b: TrackTiming): boolean {
  return (
    a.startOffsetSec === b.startOffsetSec &&
    a.durationSec === b.durationSec &&
    a.easing === b.easing
  );
}

const TICK_STEPS_SEC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

/** Labelled ruler ticks, as far apart as needed to keep the labels readable. */
export function rulerTicks(totalSec: number, widthPx: number, minGapPx = 48): number[] {
  if (totalSec <= 0 || widthPx <= 0) return [0];
  const step =
    TICK_STEPS_SEC.find((candidate) => (candidate / totalSec) * widthPx >= minGapPx) ??
    TICK_STEPS_SEC.at(-1)!;
  const ticks: number[] = [];
  for (let index = 0; index * step <= totalSec + 1e-9; index += 1) ticks.push(tidy(index * step));
  return ticks;
}

/** Position on the timeline in percent of the whole video. */
export const percentOf = (sec: number, totalSec: number) =>
  totalSec > 0 ? (sec / totalSec) * 100 : 0;

/** The video time under the pointer, from the lane's position on screen. */
export function secAtPointer(
  clientX: number,
  lane: { left: number; width: number },
  totalSec: number,
): number {
  if (lane.width <= 0) return 0;
  return clamp(((clientX - lane.left) / lane.width) * totalSec, 0, totalSec);
}

/** "2,4 s", German style. */
export function formatSec(sec: number, decimals = 1): string {
  const text = sec.toLocaleString('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${text} s`;
}
