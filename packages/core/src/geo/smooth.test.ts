import { describe, expect, it } from 'vitest';
import { distanceToSegment } from './closestSegment';
import type { LngLat } from './lngLat';
import { toMercator } from './mercator';
import { smoothLine } from './smooth';
import { unwrapLongitudes } from './unwrap';

// Salzburg → Vienna by train, with shape points roughly along the Westbahn.
const westbahn: LngLat[] = [
  [13.0458, 47.8128], // Salzburg Hbf
  [13.5502, 48.0062], // near Vöcklabruck
  [14.2913, 48.2904], // Linz Hbf
  [14.9817, 48.1252], // near Amstetten
  [15.6243, 48.2085], // St. Pölten Hbf
  [16.3752, 48.1852], // Wien Hbf
];

/** Largest change of direction between two consecutive steps, in degrees, on the map. */
function sharpestTurnDeg(line: LngLat[]) {
  const points = unwrapLongitudes(line).map(toMercator);
  let sharpest = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const before = Math.atan2(points[i]![1] - points[i - 1]![1], points[i]![0] - points[i - 1]![0]);
    const after = Math.atan2(points[i + 1]![1] - points[i]![1], points[i + 1]![0] - points[i]![0]);
    let turn = Math.abs(after - before);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    sharpest = Math.max(sharpest, (turn * 180) / Math.PI);
  }
  return sharpest;
}

describe('smoothLine', () => {
  it('goes exactly through every point', () => {
    const { line, pointIndices } = smoothLine(westbahn);
    expect(pointIndices).toHaveLength(westbahn.length);
    westbahn.forEach((point, i) => expect(line[pointIndices[i]!]).toEqual(point));
    expect(pointIndices[0]).toBe(0);
    expect(pointIndices.at(-1)).toBe(line.length - 1);
  });

  it('turns gently instead of kinking at the points', () => {
    const { line } = smoothLine(westbahn);
    // Straight lines through the same points turn by up to ~35° at Linz.
    expect(sharpestTurnDeg(westbahn)).toBeGreaterThan(30);
    expect(sharpestTurnDeg(line)).toBeLessThan(6);
  });

  it('does not loop back when the points run in one direction', () => {
    const { line } = smoothLine(westbahn);
    for (let i = 1; i < line.length; i++) expect(line[i]![0]).toBeGreaterThan(line[i - 1]![0]);
  });

  it('is a straight line for two points', () => {
    const from: LngLat = [13.0458, 47.8128];
    const to: LngLat = [16.3752, 48.1852];
    const { line } = smoothLine([from, to]);
    expect(line.length).toBeGreaterThan(2);
    const [a, b] = [toMercator(from), toMercator(to)];
    for (const point of line) {
      expect(distanceToSegment(toMercator(point), a, b)).toBeLessThan(0.01);
    }
  });

  it('samples by length, within limits', () => {
    const short = smoothLine([
      [16.37, 48.2],
      [16.38, 48.2],
    ]);
    expect(short.line).toHaveLength(9); // minSamples 8 → 7 in between plus both ends
    const long = smoothLine([
      [0, 0],
      [40, 0],
    ]);
    expect(long.line).toHaveLength(65);
  });

  it('copes with the same point twice in a row', () => {
    const points: LngLat[] = [
      [13.0458, 47.8128],
      [14.2913, 48.2904],
      [14.2913, 48.2904],
      [16.3752, 48.1852],
    ];
    const { line, pointIndices } = smoothLine(points);
    for (const [lng, lat] of line) expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
    expect(pointIndices[2]).toBe(pointIndices[1]! + 1);
    points.forEach((point, i) => expect(line[pointIndices[i]!]).toEqual(point));
  });

  it('crosses the date line on the short side and stays in range', () => {
    const { line } = smoothLine([
      [178, -17],
      [-179, -16],
      [-177, -18],
    ]);
    for (const [lng] of line) expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    const unwrapped = unwrapLongitudes(line);
    const steps = unwrapped.slice(1).map(([lng], i) => Math.abs(lng - unwrapped[i]![0]));
    expect(Math.max(...steps)).toBeLessThan(1);
  });

  it('handles nothing and a single point', () => {
    expect(smoothLine([])).toEqual({ line: [], pointIndices: [] });
    expect(smoothLine([[1, 2]])).toEqual({ line: [[1, 2]], pointIndices: [0] });
  });
});
