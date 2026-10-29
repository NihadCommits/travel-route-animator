import type { TrackTiming } from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { dragTiming, formatSec, rulerTicks, secAtPointer, snapSec } from './scale';

const limits = { mainSec: 10, fps: 25, toFrames: false };
const fixed: TrackTiming = { startOffsetSec: 2, durationSec: 4, easing: 'ease-in-out' };
const untilEnd: TrackTiming = { startOffsetSec: 2, easing: 'ease-in-out' };

describe('snapSec', () => {
  it('snaps to tenths, or to whole frames with Shift', () => {
    expect(snapSec(1.234, 25, false)).toBe(1.2);
    expect(snapSec(1.25, 25, true)).toBe(1.24);
    expect(snapSec(0.1 * 3, 25, false)).toBe(0.3);
  });
});

describe('dragTiming', () => {
  it('moves a track with its own duration as a whole, inside the stage', () => {
    const span = { startSec: 2, endSec: 6 };
    expect(dragTiming(fixed, span, 'move', 1.23, limits)).toEqual({
      ...fixed,
      startOffsetSec: 3.2,
    });
    expect(dragTiming(fixed, span, 'move', 9, limits)).toEqual({ ...fixed, startOffsetSec: 6 });
    expect(dragTiming(fixed, span, 'move', -9, limits)).toEqual({ ...fixed, startOffsetSec: 0 });
  });

  it('keeps the stage end of a track that drives until then', () => {
    const span = { startSec: 2, endSec: 10 };
    const moved = dragTiming(untilEnd, span, 'move', 3, limits);
    expect(moved).toEqual({ ...untilEnd, startOffsetSec: 5 });
    expect(moved.durationSec).toBeUndefined();
    // Never so late that nothing of the bar is left.
    expect(dragTiming(untilEnd, span, 'move', 20, limits).startOffsetSec).toBe(9.9);
  });

  it('moves the start and keeps the end when the left edge is dragged', () => {
    const span = { startSec: 2, endSec: 6 };
    expect(dragTiming(fixed, span, 'start', -1.5, limits)).toEqual({
      ...fixed,
      startOffsetSec: 0.5,
      durationSec: 5.5,
    });
    expect(dragTiming(fixed, span, 'start', 7, limits)).toEqual({
      ...fixed,
      startOffsetSec: 5.9,
      durationSec: 0.1,
    });
  });

  it('gives a track its own duration when the right edge is dragged', () => {
    const span = { startSec: 2, endSec: 8.5 };
    expect(dragTiming(untilEnd, span, 'end', -1.04, limits)).toEqual({
      ...untilEnd,
      durationSec: 5.5,
    });
    expect(dragTiming(fixed, { startSec: 2, endSec: 6 }, 'end', 30, limits).durationSec).toBe(8);
    expect(dragTiming(fixed, { startSec: 2, endSec: 6 }, 'end', -30, limits).durationSec).toBe(0.1);
  });

  it('lands on whole frames with Shift', () => {
    const timing = dragTiming(fixed, { startSec: 2, endSec: 6 }, 'end', 0.03, {
      ...limits,
      toFrames: true,
    });
    expect(timing.durationSec).toBe(4.04);
  });
});

describe('rulerTicks', () => {
  it('spaces the labels so they stay readable', () => {
    expect(rulerTicks(10, 500)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rulerTicks(10, 200)).toEqual([0, 5, 10]);
    expect(rulerTicks(2, 1000)).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8,
      1.9, 2,
    ]);
  });
});

describe('secAtPointer', () => {
  it('turns a pointer position into video time, inside the video', () => {
    const lane = { left: 100, width: 400 };
    expect(secAtPointer(300, lane, 12)).toBe(6);
    expect(secAtPointer(50, lane, 12)).toBe(0);
    expect(secAtPointer(900, lane, 12)).toBe(12);
  });
});

describe('formatSec', () => {
  it('writes seconds the German way', () => {
    expect(formatSec(2.4)).toBe('2,4 s');
    expect(formatSec(12, 0)).toBe('12 s');
  });
});
