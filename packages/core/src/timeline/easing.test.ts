import { describe, expect, it } from 'vitest';
import { EasingSchema } from '../model/enums';
import { lineAhead, lineUntil, measureLine, pointAt } from '../geo/along';
import { distanceM } from '../geo/distance';
import { ease, invertEase } from './easing';
import { outputSize } from './outputSize';

describe('ease', () => {
  it('starts at 0, ends at 1 and never runs backwards, for every curve', () => {
    for (const easing of EasingSchema.options) {
      expect(ease(easing, 0)).toBe(0);
      expect(ease(easing, 1)).toBe(1);
      let previous = 0;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const value = ease(easing, t);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('starts slowly with ease-in, stops slowly with ease-out and is symmetric in between', () => {
    expect(ease('ease-in', 0.25)).toBeLessThan(0.25);
    expect(ease('ease-out', 0.75)).toBeGreaterThan(0.75);
    expect(ease('ease-in-out', 0.5)).toBe(0.5);
    expect(ease('ease-in-out', 0.2) + ease('ease-in-out', 0.8)).toBeCloseTo(1, 12);
    expect(ease('linear', 0.3)).toBe(0.3);
  });

  it('clamps progress outside 0..1', () => {
    expect(ease('ease-in-out', -2)).toBe(0);
    expect(ease('ease-in-out', 3)).toBe(1);
  });

  it('finds back the linear progress for an eased one', () => {
    for (const easing of EasingSchema.options) {
      for (const t of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
        // Where a curve is flat, many t give almost the same value; 1e-4 is a hundredth of a frame.
        expect(invertEase(easing, ease(easing, t))).toBeCloseTo(t, 4);
      }
    }
  });
});

describe('measured line', () => {
  const line = measureLine([
    [16.0, 48.0],
    [16.1, 48.0],
    [16.1, 48.1],
  ]);

  it('knows the distance to every point', () => {
    const first = distanceM([16.0, 48.0], [16.1, 48.0]);
    expect(line.cumulative[1]).toBeCloseTo(first, 6);
    expect(line.lengthM).toBeCloseTo(first + distanceM([16.1, 48.0], [16.1, 48.1]), 6);
  });

  it('finds points along it and clamps at both ends', () => {
    const half = line.cumulative[1]! / 2;
    expect(pointAt(line, half)[0]).toBeCloseTo(16.05, 9);
    expect(pointAt(line, -5)).toEqual([16.0, 48.0]);
    expect(pointAt(line, line.lengthM + 5)).toEqual([16.1, 48.1]);
  });

  it('cuts the driven part so that it ends exactly at the vehicle', () => {
    const s = line.cumulative[1]! + 100;
    const driven = lineUntil(line, s);
    expect(driven).toHaveLength(3);
    expect(driven.at(-1)).toEqual(pointAt(line, s));
    expect(lineUntil(line, 0)).toEqual([
      [16.0, 48.0],
      [16.0, 48.0],
    ]);
    expect(lineUntil(line, line.lengthM)).toHaveLength(3);
  });

  it('lists the rest of the line from its end back to the vehicle', () => {
    const s = line.cumulative[1]! / 2;
    expect(lineAhead(line, s)).toEqual([[16.1, 48.1], [16.1, 48.0], pointAt(line, s)]);
    // Right at a point it is not repeated.
    expect(lineAhead(line, line.cumulative[1]!)).toEqual([
      [16.1, 48.1],
      [16.1, 48.0],
    ]);
    expect(lineAhead(line, -5)).toEqual([
      [16.1, 48.1],
      [16.1, 48.0],
      [16.0, 48.0],
    ]);
    expect(lineAhead(line, line.lengthM)).toEqual([
      [16.1, 48.1],
      [16.1, 48.1],
    ]);
  });

  it('measures over the date line the short way', () => {
    const pacific = measureLine([
      [179.9, 0],
      [-179.9, 0],
    ]);
    expect(pacific.points[1]![0]).toBeCloseTo(180.1, 9);
    expect(pacific.lengthM / 1000).toBeCloseTo(22.2, 1);
    expect(pointAt(pacific, pacific.lengthM / 2)[0]).toBeCloseTo(180, 9);
  });

  it('copes with a single point and refuses an empty line', () => {
    const dot = measureLine([[1, 2]]);
    expect(dot.lengthM).toBe(0);
    expect(pointAt(dot, 10)).toEqual([1, 2]);
    expect(lineUntil(dot, 10)).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(lineAhead(dot, 0)).toEqual([
      [1, 2],
      [1, 2],
    ]);
    expect(() => pointAt(measureLine([]), 0)).toThrow(RangeError);
    expect(() => lineAhead(measureLine([]), 0)).toThrow(RangeError);
  });
});

describe('outputSize', () => {
  it('takes the resolution as the short side', () => {
    expect(outputSize({ aspect: '16:9', resolution: '1080p' })).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(outputSize({ aspect: '9:16', resolution: '1080p' })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(outputSize({ aspect: '4:5', resolution: '1080p' })).toEqual({
      width: 1080,
      height: 1350,
    });
    expect(outputSize({ aspect: '1:1', resolution: '720p' })).toEqual({ width: 720, height: 720 });
    expect(outputSize({ aspect: '16:9', resolution: '2160p' })).toEqual({
      width: 3840,
      height: 2160,
    });
  });
});
