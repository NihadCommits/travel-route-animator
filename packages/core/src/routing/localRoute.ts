import { elevationSampleCount, elevationStepFor } from '../elevation/profile';
import { measureLine } from '../geo/along';
import { toMercator } from '../geo/mercator';
import { greatCircle } from '../geo/greatCircle';
import type { LngLat } from '../geo/lngLat';
import { smoothLine } from '../geo/smooth';
import type { RoutingMode } from '../model/enums';
import type { ComputedRoute, ImportedLine, RouteElevation } from '../model/track';
import { cutRecording } from '../recording/recording';
import { assembleComputedRoute, type LegShape } from './assemble';
import type { RouteInput } from './inputHash';

/**
 * Routing modes computed right here, without a router: instant and offline. `gpx` follows
 * the track's imported line (ADR 0014).
 */
export const LOCAL_ROUTING_MODES = ['great-circle', 'straight', 'smooth', 'gpx'] as const;
export type LocalRoutingMode = (typeof LOCAL_ROUTING_MODES)[number];

export function isLocalRoutingMode(mode: RoutingMode): mode is LocalRoutingMode {
  return (LOCAL_ROUTING_MODES as readonly RoutingMode[]).includes(mode);
}

/**
 * The route of a plane, train, ferry, "straight" or imported track. Undefined for modes that
 * need a router (road, cycling, walking, hiking), for a `gpx` track without its imported line,
 * and for tracks with fewer than two points. `computedAt` comes from the caller, so the
 * function stays pure.
 */
export function computeLocalRoute(
  track: RouteInput & { imported?: ImportedLine | undefined },
  computedAt: string,
): ComputedRoute | undefined {
  const { mode } = track.routing;
  if (!isLocalRoutingMode(mode) || track.waypoints.length < 2) return undefined;
  if (mode === 'gpx') return track.imported && importedRoute(track, track.imported, computedAt);
  const points = track.waypoints.map((waypoint) => waypoint.lngLat);
  return assembleComputedRoute(
    track,
    { provider: `local-${mode}`, legs: localLegs(mode, points) },
    computedAt,
  );
}

/** A place on a line: on the segment from line[index] to line[index + 1], at share t. */
interface LinePosition {
  index: number;
  t: number;
  point: LngLat;
}

/**
 * The point of the line closest to `target`, not before `from`: the foot of the perpendicular
 * on the nearest segment, measured in Web Mercator like everything drawn on the map.
 */
function locateOnLine(
  line: readonly LngLat[],
  projected: readonly (readonly [number, number])[],
  target: LngLat,
  from: LinePosition,
): LinePosition {
  const [px, py] = toMercator(target);
  let best = from;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = from.index; i < line.length - 1; i++) {
    const [ax, ay] = projected[i]!;
    const [bx, by] = projected[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
    t = Math.max(i === from.index ? from.t : 0, Math.min(1, t));
    const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (distance < bestDistance) {
      const [a, b] = [line[i]!, line[i + 1]!];
      best = { index: i, t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * An imported track's route: its line from stop to stop. Each stop is laid onto the line at
 * the closest place at or after the previous stop, so the order of the trip stays, also on a
 * loop that ends where it began.
 */
function importedRoute(
  track: RouteInput,
  imported: ImportedLine,
  computedAt: string,
): ComputedRoute {
  const { line } = imported;
  const projected = line.map(toMercator);
  let from: LinePosition = { index: 0, t: 0, point: line[0]! };
  const positions = track.waypoints.map(({ lngLat }) => {
    from = locateOnLine(line, projected, lngLat, from);
    return from;
  });
  const legs = positions.slice(1).map((to, k) => {
    const start = positions[k]!;
    return { line: [start.point, ...line.slice(start.index + 1, to.index + 1), to.point] };
  });
  const route = assembleComputedRoute(track, { provider: imported.source, legs }, computedAt);
  const { lengthM } = measureLine(route.geometry);
  const elevation = importedElevation(imported, positions[0]!, lengthM);
  // The recording from the first stop to the last, in the route's own metres (M16).
  const measured = measureLine(imported.line);
  const offsetOf = ({ index, t }: LinePosition) =>
    measured.cumulative[index]! +
    t *
      ((measured.cumulative[index + 1] ?? measured.cumulative[index]!) -
        measured.cumulative[index]!);
  const recording =
    imported.recording &&
    cutRecording(imported.recording, offsetOf(positions[0]!), offsetOf(positions.at(-1)!), lengthM);
  return { ...route, ...(elevation && { elevation }), ...(recording && { recording }) };
}

/**
 * The file's heights along the route, sampled like the DEM's (ADR 0012): the route starts at
 * the first stop, which may lie some way into the imported line.
 */
function importedElevation(
  imported: ImportedLine,
  start: LinePosition,
  lengthM: number,
): RouteElevation | undefined {
  const { elevationsM } = imported;
  if (!elevationsM || lengthM <= 0) return undefined;
  const measured = measureLine(imported.line);
  const segment = (measured.cumulative[start.index + 1] ?? 0) - measured.cumulative[start.index]!;
  const offset = measured.cumulative[start.index]! + start.t * Math.max(0, segment);
  const heightAt = (s: number) => {
    const at = Math.min(measured.lengthM, offset + s);
    let i = 0;
    while (i < measured.cumulative.length - 2 && measured.cumulative[i + 1]! < at) i++;
    const a = measured.cumulative[i]!;
    const b = measured.cumulative[i + 1] ?? a;
    const f = b > a ? (at - a) / (b - a) : 0;
    return elevationsM[i]! + ((elevationsM[i + 1] ?? elevationsM[i]!) - elevationsM[i]!) * f;
  };
  const stepM = elevationStepFor(lengthM);
  const count = elevationSampleCount(lengthM, stepM);
  return {
    source: 'gpx',
    stepM,
    elevationsM: Array.from(
      { length: count },
      (_, i) => Math.round(heightAt(Math.min(i * stepM, lengthM)) * 10) / 10,
    ),
  };
}

function localLegs(mode: Exclude<LocalRoutingMode, 'gpx'>, points: LngLat[]): LegShape[] {
  const pairs = points.slice(1).map((to, i): [LngLat, LngLat] => [points[i]!, to]);
  switch (mode) {
    case 'great-circle':
      return pairs.map(([from, to]) => ({ line: greatCircle(from, to) }));
    case 'straight':
      return pairs.map(([from, to]) => ({ line: [[...from], [...to]] }));
    case 'smooth': {
      // One curve through all points, cut at the points: the bends must flow across them.
      const { line, pointIndices } = smoothLine(points);
      return pairs.map((_, i) => ({ line: line.slice(pointIndices[i], pointIndices[i + 1]! + 1) }));
    }
  }
}
