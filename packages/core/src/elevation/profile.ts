import { z } from 'zod';
import { measureLine, pointAt, type MeasuredLine } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { Etappe } from '../model/etappe';
import { LngLatSchema } from '../model/primitives';
import type { RouteElevation, Track } from '../model/track';
import { isRouteStale } from '../routing/inputHash';

// Height profiles along a route (ADR 0012): where the samples lie, how a stage picks the track
// it shows, and how the metres climbed are counted without counting noise.

/** Samples lie at least this far apart: about the DEM's own resolution in Europe. */
export const MIN_ELEVATION_STEP_M = 20;
/** At most this many samples per route; a long drive gets wider steps instead. */
export const MAX_ELEVATION_SAMPLES = 2000;
/** A line longer than this is simplified by the client before it asks. */
export const MAX_ELEVATION_LINE_POINTS = 50_000;

/** The step between samples for a route of this length. */
export function elevationStepFor(lengthM: number): number {
  return Math.max(MIN_ELEVATION_STEP_M, lengthM / (MAX_ELEVATION_SAMPLES - 1));
}

/** How many samples a route of this length gets at this step: both ends included. */
export function elevationSampleCount(lengthM: number, stepM: number): number {
  return Math.max(2, Math.ceil(lengthM / stepM - 1e-9) + 1);
}

/** Where sample i lies: every stepM metres, the last one at the very end. */
function sampleAtM(i: number, stepM: number, lengthM: number): number {
  return Math.min(i * stepM, lengthM);
}

/** The points to sample on a measured line. */
export function elevationSamplePoints(line: MeasuredLine, stepM: number): LngLat[] {
  const count = elevationSampleCount(line.lengthM, stepM);
  return Array.from({ length: count }, (_, i) => pointAt(line, sampleAtM(i, stepM, line.lengthM)));
}

/** What the editor and the render CLI send to POST /api/elevation. */
export const ElevationRequestSchema = z.strictObject({
  /** The route's geometry, as stored in `computed.geometry`. */
  line: z.array(LngLatSchema).min(2).max(MAX_ELEVATION_LINE_POINTS),
  stepM: z.number().min(MIN_ELEVATION_STEP_M).optional(),
});
export type ElevationRequest = z.infer<typeof ElevationRequestSchema>;

/** The request for a track's route; undefined without a fresh one. */
export function toElevationRequest(track: Track): ElevationRequest | undefined {
  if (!track.computed || isRouteStale(track)) return undefined;
  const { geometry } = track.computed;
  return { line: geometry, stepM: elevationStepFor(measureLine(geometry).lengthM) };
}

/** The raw height `s` metres along the route, between the two samples around it. */
export function elevationAt(elevation: RouteElevation, lengthM: number, s: number): number {
  const { stepM, elevationsM } = elevation;
  const last = elevationsM.length - 1;
  const at = Math.max(0, Math.min(lengthM, s));
  const i = Math.min(last - 1, Math.floor(at / stepM));
  const from = sampleAtM(i, stepM, lengthM);
  const to = sampleAtM(i + 1, stepM, lengthM);
  const f = to > from ? Math.max(0, Math.min(1, (at - from) / (to - from))) : 1;
  return elevationsM[i]! + (elevationsM[i + 1]! - elevationsM[i]!) * f;
}

// ---------- Which track a stage profiles ----------

function isGroundTrack(track: Track): boolean {
  return track.vehicle.type !== 'plane' && track.waypoints.length >= 2;
}

/**
 * The track whose profile a stage shows: the followed one, unless it flies; otherwise the
 * first one on the ground. Planes have no profile worth showing (their height is drawn).
 */
export function profileTrackOf(etappe: Pick<Etappe, 'view' | 'tracks'>): Track | undefined {
  const { camera } = etappe.view;
  const followed =
    camera.mode === 'follow'
      ? etappe.tracks.find((track) => track.id === camera.followTrackId)
      : undefined;
  if (followed && isGroundTrack(followed)) return followed;
  return etappe.tracks.find(isGroundTrack);
}

export function showsElevation(etappe: Pick<Etappe, 'overlays'>): boolean {
  return etappe.overlays.elevationProfile || etappe.overlays.elevationCounter;
}

/**
 * The stage's tracks that need heights and have a fresh route without them: the profile
 * track when the stage shows its profile or counter, and planes on 3D terrain (they take off
 * and land at the ground's height).
 */
export function tracksAwaitingElevation(
  etappe: Pick<Etappe, 'view' | 'tracks' | 'overlays'>,
): Track[] {
  const profiled = showsElevation(etappe) ? profileTrackOf(etappe) : undefined;
  return etappe.tracks.filter((track) => {
    if (!track.computed || track.computed.elevation || isRouteStale(track)) return false;
    if (track === profiled) return true;
    return track.vehicle.type === 'plane' && etappe.view.terrain.enabled;
  });
}

// ---------- Climb and descent ----------

/**
 * Below this change in height nothing is counted. DEM heights wobble by a few metres where a
 * path runs along a slope (the grid is coarser than the path), and every wobble would add to
 * the total. GPS heights wobble more.
 */
export const CLIMB_THRESHOLD_M: Record<RouteElevation['source'], number> = { dem: 3, gpx: 5 };
/** Heights are averaged over about this distance before anything is counted or drawn. */
const SMOOTHING_M = 100;

/** A profile prepared for the frames: smoothed, with the metres climbed and descended so far. */
export interface ElevationProfile {
  stepM: number;
  lengthM: number;
  /** Smoothed heights per sample. */
  elevationsM: number[];
  /** Metres climbed and descended from the start up to each sample. */
  gainM: number[];
  lossM: number[];
  minM: number;
  maxM: number;
}

/** Moving average over a window of samples; the window shrinks at the ends. */
function smooth(values: readonly number[], halfWindow: number): number[] {
  if (halfWindow < 1) return [...values];
  return values.map((_, i) => {
    const from = Math.max(0, i - halfWindow);
    const to = Math.min(values.length - 1, i + halfWindow);
    let sum = 0;
    for (let k = from; k <= to; k++) sum += values[k]!;
    return sum / (to - from + 1);
  });
}

/**
 * Metres climbed and descended with a threshold (hysteresis): a change counts only once the
 * height has moved at least `thresholdM` away from the last counted height. Small ups and
 * downs within the threshold cancel out instead of adding up.
 */
export function climbAndDescent(
  elevationsM: readonly number[],
  thresholdM: number,
): { gainM: number[]; lossM: number[] } {
  const gainM: number[] = [];
  const lossM: number[] = [];
  let reference = elevationsM[0] ?? 0;
  let gain = 0;
  let loss = 0;
  for (const height of elevationsM) {
    if (height - reference >= thresholdM) {
      gain += height - reference;
      reference = height;
    } else if (reference - height >= thresholdM) {
      loss += reference - height;
      reference = height;
    }
    gainM.push(gain);
    lossM.push(loss);
  }
  return { gainM, lossM };
}

export function compileProfile(elevation: RouteElevation, lengthM: number): ElevationProfile {
  const { stepM } = elevation;
  const elevationsM = smooth(elevation.elevationsM, Math.floor(SMOOTHING_M / stepM / 2));
  const { gainM, lossM } = climbAndDescent(elevationsM, CLIMB_THRESHOLD_M[elevation.source]);
  return {
    stepM,
    lengthM,
    elevationsM,
    gainM,
    lossM,
    minM: Math.min(...elevationsM),
    maxM: Math.max(...elevationsM),
  };
}

export interface ElevationReading {
  /** Where the reading is taken, metres along the route. */
  atM: number;
  elevationM: number;
  gainM: number;
  lossM: number;
}

/** Height and the metres climbed and descended so far, `s` metres along the route. */
export function readProfile(profile: ElevationProfile, s: number): ElevationReading {
  const { stepM, lengthM } = profile;
  const at = Math.max(0, Math.min(lengthM, s));
  const read = (values: number[]) =>
    elevationAt({ source: 'dem', stepM, elevationsM: values }, lengthM, at);
  return {
    atM: at,
    elevationM: read(profile.elevationsM),
    gainM: read(profile.gainM),
    lossM: read(profile.lossM),
  };
}
