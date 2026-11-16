import { measureLine } from '../geo/along';
import { distanceM } from '../geo/distance';
import type { LngLat } from '../geo/lngLat';
import { simplifyLineIndices } from '../geo/simplify';
import type { VehicleType } from '../model/enums';
import {
  createTrack,
  createWaypoint,
  defaultFactoryContext,
  type FactoryContext,
} from '../model/factories';
import { findEtappe } from '../resolve/resolve';
import type { Project } from '../model/project';
import type { ImportedLine, Track } from '../model/track';
import { SIMPLIFY_TOLERANCE_M } from '../routing/assemble';
import type { Added } from '../edit/operations';
import { editEtappe } from '../edit/operations';
import { buildRecording } from '../recording/recording';
import { lineFingerprint } from './fingerprint';
import type { ImportedTrackData, ImportPoint } from './parse';

// From a parsed file to a track (ADR 0014): the line, simplified and fingerprinted, a vehicle
// that fits the activity, and stops where the trip started, paused and ended.

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Leaves out points that repeat the previous one: a GPS standing still writes many. `of[k]` is
 * the index in `points` of the moving point that raw point k is at.
 */
function moving(raw: readonly ImportPoint[]): { points: ImportPoint[]; of: number[] } {
  const points: ImportPoint[] = [];
  const of = raw.map((point, i) => {
    const previous = raw[i - 1];
    if (
      i === 0 ||
      point.lngLat[0] !== previous!.lngLat[0] ||
      point.lngLat[1] !== previous!.lngLat[1]
    ) {
      points.push(point);
    }
    return points.length - 1;
  });
  return { points, of };
}

/**
 * How far along the simplified line each point is. A point between two kept ones lies the same
 * share of the way along that piece of line as it did along the original track.
 */
function alongLine(
  points: readonly ImportPoint[],
  kept: readonly number[],
  line: LngLat[],
): number[] {
  const raw = [0];
  for (let j = 1; j < points.length; j++) {
    raw.push(raw[j - 1]! + distanceM(points[j - 1]!.lngLat, points[j]!.lngLat));
  }
  const { cumulative } = measureLine(line);
  const along = points.map(() => 0);
  for (let q = 0; q + 1 < kept.length; q++) {
    const [a, b] = [kept[q]!, kept[q + 1]!];
    const span = raw[b]! - raw[a]!;
    const piece = cumulative[q + 1]! - cumulative[q]!;
    for (let j = a; j <= b; j++) {
      along[j] = cumulative[q]! + (span > 0 ? ((raw[j]! - raw[a]!) / span) * piece : 0);
    }
  }
  return along;
}

/** The line of an import as stored in the track: simplified like a router's route (ADR 0005). */
export function toImportedLine(data: ImportedTrackData): ImportedLine {
  const { points, of } = moving(data.points);
  const kept = simplifyLineIndices(
    points.map((point) => point.lngLat),
    SIMPLIFY_TOLERANCE_M,
  );
  const line = kept.map((i): LngLat => [
    round6(points[i]!.lngLat[0]),
    round6(points[i]!.lngLat[1]),
  ]);
  if (line.length === 1) line.push([...line[0]!]);
  // Heights only when every kept point has one; a half-filled profile would mislead.
  const heights = kept.map((i) => points[i]!.ele);
  const elevationsM = heights.every((h): h is number => h !== undefined)
    ? heights.map((h) => Math.round(h * 10) / 10)
    : undefined;
  if (elevationsM && elevationsM.length < line.length) elevationsM.push(elevationsM[0]!);
  // Time, heart rate and cadence of every raw point, standing still included (M16).
  const along = alongLine(points, kept, line);
  const recording = buildRecording(
    data.points.flatMap((point, k) =>
      point.time === undefined
        ? []
        : [{ time: point.time, atM: along[of[k]!]!, hr: point.hr, cad: point.cad }],
    ),
    data.source !== 'dji-srt',
  );
  return {
    source: data.source,
    name: data.name,
    line,
    ...(elevationsM && { elevationsM }),
    fingerprint: lineFingerprint(line),
    ...(recording && { recording }),
  };
}

/** The vehicle an activity in a GPX file stands for; a bike when the file does not say. */
export function vehicleForActivity(
  data: Pick<ImportedTrackData, 'activity' | 'source'>,
): VehicleType {
  const activity = data.activity?.toLowerCase() ?? '';
  if (/cycl|bik|ride|velo|rad/.test(activity)) return 'bike';
  if (/hik|mountain|berg|wander|trek/.test(activity)) return 'hike';
  if (/run|walk|jog|lauf|geh/.test(activity)) return 'walk';
  if (/driv|car|auto|motor/.test(activity)) return 'car';
  // A drone flight has no vehicle of its own; walking speed suits its line best (ADR 0014).
  return data.source === 'dji-srt' ? 'hike' : 'bike';
}

export interface StopSuggestion {
  lngLat: LngLat;
  name: string;
  /** Index in the imported data's points, to keep them in order along the way. */
  at: number;
}

export interface StopNames {
  start: string;
  end: string;
  pause: string;
}

/** A named GPX waypoint counts as a stop when it lies this close to the track. */
const WAYPOINT_NEAR_M = 200;
/** A pause: at least this long within a small circle. */
const PAUSE_MIN_MS = 5 * 60 * 1000;
const PAUSE_RADIUS_M = 30;
/** More pauses than this would only clutter the map; the longest are kept. */
const MAX_PAUSES = 8;

function nearestIndex(points: readonly ImportPoint[], target: LngLat) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, i) => {
    const d = distanceM(point.lngLat, target);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return { index: best, distance: bestDistance };
}

/** Stretches where the trip stood still for a while, from the timestamps; longest first. */
function pauses(points: readonly ImportPoint[]): { at: number; ms: number }[] {
  const found: { at: number; ms: number }[] = [];
  let i = 0;
  while (i < points.length) {
    const start = points[i]!;
    let j = i + 1;
    while (j < points.length && distanceM(points[j]!.lngLat, start.lngLat) <= PAUSE_RADIUS_M) j++;
    const last = points[j - 1]!;
    const ms = start.time !== undefined && last.time !== undefined ? last.time - start.time : 0;
    // Not at the very start or end: those are the start and the finish already.
    if (ms >= PAUSE_MIN_MS && i > 0 && j < points.length) {
      found.push({ at: Math.floor((i + j - 1) / 2), ms });
    }
    i = j;
  }
  return found.sort((a, b) => b.ms - a.ms).slice(0, MAX_PAUSES);
}

/** Stops for an imported trip: start, named waypoints near the line, pauses, end; in order. */
export function suggestStops(data: ImportedTrackData, names: StopNames): StopSuggestion[] {
  const { points } = data;
  const last = points.length - 1;
  const inner: StopSuggestion[] = [
    ...data.waypoints.flatMap(({ lngLat, name }) => {
      const near = nearestIndex(points, lngLat);
      return near.distance <= WAYPOINT_NEAR_M && near.index > 0 && near.index < last
        ? [{ lngLat: points[near.index]!.lngLat, name, at: near.index }]
        : [];
    }),
    ...pauses(points).map(({ at }) => ({ lngLat: points[at]!.lngLat, name: names.pause, at })),
  ];
  inner.sort((a, b) => a.at - b.at);
  // Two suggestions at the same place (a waypoint at a pause) make one stop, the named one.
  const distinct = inner.filter(
    (stop, i) => i === 0 || distanceM(stop.lngLat, inner[i - 1]!.lngLat) > WAYPOINT_NEAR_M,
  );
  return [
    { lngLat: points[0]!.lngLat, name: names.start, at: 0 },
    ...distinct,
    { lngLat: points[last]!.lngLat, name: names.end, at: last },
  ];
}

export interface ImportTrackOptions {
  vehicleType: VehicleType;
  names: StopNames;
  /** Keep the suggested pauses and waypoints, or only start and end. */
  withStops: boolean;
  /** Position in the stage, for the line colour of the palette. */
  colorIndex?: number;
  ctx?: FactoryContext;
}

/** The new track of an import: gpx routing on the imported line, with the suggested stops. */
export function trackFromImport(
  data: ImportedTrackData,
  { vehicleType, names, withStops, colorIndex, ctx = defaultFactoryContext }: ImportTrackOptions,
): Track {
  const all = suggestStops(data, names);
  const stops = withStops ? all : [all[0]!, all.at(-1)!];
  const base = createTrack(
    {
      vehicleType,
      label: data.name,
      ...(colorIndex !== undefined && { colorIndex }),
      waypoints: stops.map((stop) =>
        createWaypoint({ name: stop.name, lngLat: stop.lngLat, source: 'gpx' }, ctx),
      ),
    },
    ctx,
  );
  return { ...base, routing: { mode: 'gpx' }, imported: toImportedLine(data) };
}

/** Adds an imported track to a stage; the editor computes its route like any local one. */
export function importTrack(
  project: Project,
  etappeId: string,
  data: ImportedTrackData,
  options: ImportTrackOptions,
): Added {
  // The next colour of the palette, like any added vehicle.
  const colorIndex = findEtappe(project, etappeId)?.etappe.tracks.length ?? 0;
  const track = trackFromImport(data, { colorIndex, ...options });
  const next = editEtappe(project, etappeId, (etappe) => ({
    ...etappe,
    tracks: [...etappe.tracks, track],
  }));
  return { project: next, id: track.id };
}
