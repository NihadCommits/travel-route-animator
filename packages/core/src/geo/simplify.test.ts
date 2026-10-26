import { describe, expect, it } from 'vitest';
import type { LngLat } from './lngLat';
import { simplifyLine } from './simplify';

/** Metres → degrees of latitude (one degree is about 111.2 km everywhere). */
const metresNorth = (m: number) => m / 111_195;

describe('simplifyLine', () => {
  it('reduces a straight stretch to its two ends', () => {
    const line: LngLat[] = Array.from({ length: 50 }, (_, i) => [-9.1 + i * 0.01, 38.7]);
    expect(simplifyLine(line, 5)).toEqual([line[0], line.at(-1)]);
  });

  it('keeps bends larger than the tolerance and drops smaller wiggles', () => {
    const line: LngLat[] = [
      [-8.0, 37.0],
      [-7.99, 37 + metresNorth(2)], // wiggle of 2 m
      [-7.98, 37.0],
      [-7.97, 37 + metresNorth(300)], // real bend of 300 m
      [-7.96, 37.0],
    ];
    expect(simplifyLine(line, 5)).toEqual([line[0], line[2], line[3], line[4]]);
  });

  it('measures in ground metres, not in stretched Mercator metres', () => {
    // At 60° north Mercator doubles every distance; an 8 m bend is 16 Mercator metres.
    const line: LngLat[] = [
      [10.0, 60],
      [10.01, 60 + metresNorth(8)],
      [10.02, 60],
    ];
    expect(simplifyLine(line, 5)).toHaveLength(3);
    expect(simplifyLine(line, 10)).toHaveLength(2);
  });

  it('works on lines over the date line', () => {
    const line: LngLat[] = [
      [179.98, 0],
      [179.99, 0],
      [-179.99, 0],
      [-179.98, 0],
    ];
    expect(simplifyLine(line, 5)).toEqual([line[0], line[3]]);
  });

  it('returns short lines as copies', () => {
    const line: LngLat[] = [
      [1, 2],
      [3, 4],
    ];
    const result = simplifyLine(line, 5);
    expect(result).toEqual(line);
    expect(result[0]).not.toBe(line[0]);
  });
});
