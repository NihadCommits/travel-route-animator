import { lineString } from '@turf/helpers';
import { length } from '@turf/length';
import { lineSliceAlong } from '@turf/line-slice-along';
import type { LngLat } from './lngLat';

/**
 * Returns the part of `line` from its start up to `progress` (0..1) of its total length.
 *
 * Progress is measured along the ground distance, not by point count, so a vehicle moves at a
 * steady speed even when the points are unevenly spaced. The result always has at least two
 * points and can go straight into a GeoJSON source: at progress 0 it is the start point twice,
 * which renders as nothing. The input is never mutated.
 */
export function sliceLineByProgress(line: readonly LngLat[], progress: number): LngLat[] {
  const [start] = line;
  if (start === undefined || line.length < 2) {
    throw new RangeError(`A line needs at least 2 points, got ${line.length}`);
  }
  if (!Number.isFinite(progress)) {
    throw new RangeError(`Progress must be a finite number, got ${progress}`);
  }

  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped === 0) return [[...start], [...start]];
  if (clamped === 1) return line.map((point) => [...point]);

  const feature = lineString(line.map((point) => [...point]));
  const travelledKm = length(feature, { units: 'kilometers' }) * clamped;
  const slice = lineSliceAlong(feature, 0, travelledKm, { units: 'kilometers' });
  return slice.geometry.coordinates.map(toLngLat);
}

// GeoJSON positions are plain number arrays; LngLat makes the [lng, lat] order explicit.
function toLngLat(position: readonly number[]): LngLat {
  const [lng, lat] = position;
  if (lng === undefined || lat === undefined) {
    throw new RangeError('Turf returned a position without longitude or latitude');
  }
  return [lng, lat];
}
