import { describe, expect, it } from 'vitest';
import { closestSegment, type Point2 } from './closestSegment';

// An L-shaped line: right along y = 0, then up along x = 10.
const line: Point2[] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

describe('closestSegment', () => {
  it('finds the segment under a point and its distance', () => {
    expect(closestSegment(line, [5, 2])).toEqual({ index: 0, distance: 2 });
    expect(closestSegment(line, [13, 6])).toEqual({ index: 1, distance: 3 });
  });

  it('measures to the nearest end beyond a segment', () => {
    expect(closestSegment(line, [-3, -4])).toEqual({ index: 0, distance: 5 });
  });

  it('copes with two identical points', () => {
    expect(
      closestSegment(
        [
          [1, 1],
          [1, 1],
        ],
        [4, 5],
      ),
    ).toEqual({ index: 0, distance: 5 });
  });

  it('has no answer for a single point', () => {
    expect(closestSegment([[0, 0]], [1, 1])).toBeUndefined();
  });
});
