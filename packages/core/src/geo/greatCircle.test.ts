import { lineString } from '@turf/helpers';
import { length } from '@turf/length';
import { describe, expect, it } from 'vitest';
import { distanceM, lineLengthM } from './distance';
import { greatCircle } from './greatCircle';
import type { LngLat } from './lngLat';
import { unwrapLongitudes } from './unwrap';

const vienna: LngLat = [16.5697, 48.1103];
const porto: LngLat = [-8.6814, 41.2481];
const tokyo: LngLat = [139.7798, 35.5494];
const losAngeles: LngLat = [-118.4085, 33.9416];

/** Every point of a great circle lies on it: the detour over it is zero. */
function expectOnGreatCircle(line: LngLat[], from: LngLat, to: LngLat) {
  const direct = distanceM(from, to);
  for (const point of line) {
    expect(distanceM(from, point) + distanceM(point, to) - direct).toBeLessThan(1);
  }
}

function longestStepM(line: LngLat[]) {
  return Math.max(...line.slice(1).map((point, i) => distanceM(line[i]!, point)));
}

describe('distanceM', () => {
  it('matches @turf/length', () => {
    const turfM = length(lineString([vienna, porto]), { units: 'meters' });
    expect(distanceM(vienna, porto)).toBeCloseTo(turfM, 3);
    expect(lineLengthM([vienna, porto, vienna])).toBeCloseTo(2 * turfM, 3);
  });

  it('takes the short way over the date line', () => {
    expect(distanceM([179.5, 0], [-179.5, 0]) / 1000).toBeCloseTo(111.2, 1);
  });
});

describe('greatCircle', () => {
  it('runs from Vienna to Porto on the great circle and bends north on the map', () => {
    const line = greatCircle(vienna, porto);
    expect(line[0]).toEqual(vienna);
    expect(line.at(-1)).toEqual(porto);
    expectOnGreatCircle(line, vienna, porto);
    expect(longestStepM(line)).toBeLessThanOrEqual(50_000);

    const middle = line[Math.floor(line.length / 2)]!;
    expect(middle[1]).toBeGreaterThan((vienna[1] + porto[1]) / 2);
    // Sampled, the arc is a hair shorter than the true distance, never longer.
    expect(distanceM(vienna, porto) - lineLengthM(line)).toBeLessThan(100);
  });

  it('crosses the Pacific without jumping across the map', () => {
    const line = greatCircle(tokyo, losAngeles);
    for (const [lng] of line) expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    expectOnGreatCircle(line, tokyo, losAngeles);

    const unwrapped = unwrapLongitudes(line);
    const steps = unwrapped.slice(1).map(([lng], i) => Math.abs(lng - unwrapped[i]![0]));
    expect(Math.max(...steps)).toBeLessThan(2);
    // Over the North Pacific, towards the Aleutians, not along the 35th parallel.
    expect(Math.max(...line.map(([, lat]) => lat))).toBeGreaterThan(45);
  });

  it('draws even a short hop as an arc with a minimum of steps', () => {
    expect(greatCircle([16.37, 48.21], [16.57, 48.11])).toHaveLength(17);
    expect(greatCircle([16.37, 48.21], [16.57, 48.11], { minSteps: 4 })).toHaveLength(5);
  });

  it('copes with the same point twice', () => {
    expect(greatCircle(vienna, vienna)).toEqual([vienna, vienna]);
  });

  it('finds one of the shortest paths between exact antipodes', () => {
    const from: LngLat = [20, 30];
    const to: LngLat = [-160, -30];
    const line = greatCircle(from, to);
    expect(line[0]).toEqual(from);
    expect(line.at(-1)).toEqual(to);
    expect(longestStepM(line)).toBeLessThanOrEqual(50_000);
    expectOnGreatCircle(line, from, to);
    for (const [lng, lat] of line) {
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
    }
  });

  it('finds a path between antipodes from the southern hemisphere too', () => {
    const line = greatCircle([10, -20], [-170, 20]);
    expect(line.at(-1)).toEqual([-170, 20]);
    expect(longestStepM(line)).toBeLessThanOrEqual(50_000);
  });
});
