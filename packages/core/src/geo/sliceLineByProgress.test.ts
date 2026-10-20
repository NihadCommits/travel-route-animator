import { describe, expect, it } from 'vitest';
import type { LngLat } from './lngLat';
import { sliceLineByProgress } from './sliceLineByProgress';

// Along the equator one degree of longitude is the same distance everywhere,
// which makes the expected positions easy to reason about.
const EQUATOR: LngLat[] = [
  [0, 0],
  [10, 0],
];

// Two segments of equal length: one along the equator, one along a meridian.
const CORNER: LngLat[] = [
  [0, 0],
  [1, 0],
  [1, 1],
];

describe('sliceLineByProgress', () => {
  it('collapses to the start point at progress 0', () => {
    expect(sliceLineByProgress(EQUATOR, 0)).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('returns the whole line at progress 1', () => {
    expect(sliceLineByProgress(CORNER, 1)).toEqual(CORNER);
  });

  it('ends halfway along a straight line at progress 0.5', () => {
    const slice = sliceLineByProgress(EQUATOR, 0.5);
    const head = slice.at(-1);

    expect(slice).toHaveLength(2);
    expect(head?.[0]).toBeCloseTo(5, 6);
    expect(head?.[1]).toBeCloseTo(0, 6);
  });

  it('measures progress by distance across several segments', () => {
    // 75 % of the total length is the middle of the second segment.
    const slice = sliceLineByProgress(CORNER, 0.75);
    const head = slice.at(-1);

    expect(slice.slice(0, 2)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(head?.[0]).toBeCloseTo(1, 6);
    expect(head?.[1]).toBeCloseTo(0.5, 2);
  });

  it('clamps progress outside 0..1', () => {
    expect(sliceLineByProgress(EQUATOR, -0.5)).toEqual(sliceLineByProgress(EQUATOR, 0));
    expect(sliceLineByProgress(EQUATOR, 1.5)).toEqual(sliceLineByProgress(EQUATOR, 1));
  });

  it('gives the same result no matter in which order frames are requested', () => {
    const forward = [0.2, 0.4, 0.6].map((p) => sliceLineByProgress(CORNER, p));
    const backward = [0.6, 0.4, 0.2].map((p) => sliceLineByProgress(CORNER, p)).reverse();

    expect(backward).toEqual(forward);
  });

  it('does not mutate or share the input coordinates', () => {
    const line: LngLat[] = [
      [0, 0],
      [10, 0],
    ];
    const result = sliceLineByProgress(line, 1);
    result[0]![0] = 99;

    expect(line).toEqual(EQUATOR);
  });

  it('rejects lines with fewer than two points', () => {
    expect(() => sliceLineByProgress([[0, 0]], 0.5)).toThrow(RangeError);
    expect(() => sliceLineByProgress([], 0.5)).toThrow(RangeError);
  });

  it('rejects a non-finite progress', () => {
    expect(() => sliceLineByProgress(EQUATOR, Number.NaN)).toThrow(RangeError);
  });
});
