import type { Phase } from '../timeline/compileTimeline';

// Animated vehicle icons (ADR 0009): which picture of a GIF shows is a function of the frame,
// never of a clock, so Remotion may render the frames in any order.

/**
 * Seconds the vehicle has been on the move at `sec`. Holds at stops, the wait before its start
 * and the time after its arrival do not count, so an animated walker stands still there.
 */
export function movingSecAt(phases: readonly Phase[], sec: number): number {
  let moving = 0;
  for (const phase of phases) {
    if (phase.kind !== 'move' || sec <= phase.startSec) continue;
    moving += Math.min(sec, phase.endSec) - phase.startSec;
  }
  return moving;
}

/**
 * Browsers play a picture of 10 ms or less for 100 ms; many GIFs rely on it and say 0. The
 * video does the same, so it moves as fast as the GIF in a browser.
 */
const SHORTEST_MS = 10;
const STAND_IN_MS = 100;

/** Which picture of an animation shows after `sec` seconds, looping; durations in ms. */
export function animationFrameAt(durationsMs: readonly number[], sec: number): number {
  const durations = durationsMs.map((ms) => (ms > SHORTEST_MS ? ms : STAND_IN_MS));
  const total = durations.reduce((sum, ms) => sum + ms, 0);
  if (durations.length <= 1 || sec <= 0) return 0;
  let left = (sec * 1000) % total;
  for (let i = 0; i < durations.length; i++) {
    if (left < durations[i]!) return i;
    left -= durations[i]!;
  }
  // Only rounding can get here; the last picture is the right one then.
  return durations.length - 1;
}
