import type { MeasuredLine } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { FlightOptions } from '../model/track';

// Flights (ARCHITEKTUR: Flüge in 3D, ADR 0007). The height comes from a profile along the
// route, not from a simulation: h = H · sin(π u) per leg, u running from 0 at one landing to
// 1 at the next. Real cruising altitude would be invisible on a map of Europe, so H is a share
// of the leg's length (arcHeightFactor).

/** One hop between two landings. */
export interface FlightLeg {
  fromM: number;
  toM: number;
  peakM: number;
}

export interface FlightPlan {
  options: FlightOptions;
  legs: FlightLeg[];
  /** The whole route, sampled densely enough that the arc stays round, with the heights. */
  arc: { points: LngLat[]; atM: number[]; altitudesM: number[] };
}

/** A flight is drawn with at least this many points; great circles bring one every 50 km. */
const ARC_SAMPLES = 240;
/** Share of a leg over which the nose comes up after take-off (and down before landing). */
const ROTATE_SHARE = 0.03;

/** How flights are drawn: a real arc in 3D, or the flat fake for views from straight above. */
export type FlightStyle = 'arc-3d' | 'fake-3d';

/**
 * From this tilt on the 3D arc reads as height. Looking straight down it is a plain line
 * (the spike showed it), so flat views lift the line on screen instead (ADR 0007).
 */
export const FLIGHT_3D_MIN_PITCH_DEG = 20;

export function flightStyleFor(pitchDeg: number): FlightStyle {
  return pitchDeg >= FLIGHT_3D_MIN_PITCH_DEG ? 'arc-3d' : 'fake-3d';
}

/**
 * Fake 3D lifts a point towards the top of the picture by this share of its height: what a
 * camera tilted by about 45° would show, so flat and tilted views of a flight look alike.
 */
export const FAKE_LIFT = 0.7;
const METRES_PER_DEGREE = 111_320;

/** The point moved `metres` along the compass direction `bearingDeg` (flat approximation). */
export function liftedPoint([lng, lat]: LngLat, metres: number, bearingDeg: number): LngLat {
  const b = (bearingDeg * Math.PI) / 180;
  const north = metres * Math.cos(b);
  const east = metres * Math.sin(b);
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  return [lng + east / (METRES_PER_DEGREE * cosLat), lat + north / METRES_PER_DEGREE];
}

function sampleLine(line: MeasuredLine, stepM: number): { points: LngLat[]; atM: number[] } {
  const { points, cumulative } = line;
  const out: LngLat[] = [];
  const atM: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    out.push([a[0], a[1]]);
    atM.push(cumulative[i]!);
    const b = points[i + 1];
    if (!b) break;
    const span = cumulative[i + 1]! - cumulative[i]!;
    const steps = Math.ceil(span / stepM);
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      atM.push(cumulative[i]! + span * f);
    }
  }
  return { points: out, atM };
}

/** `landingsM`: where the plane touches down on the line, the start and the end included. */
export function planFlight(
  line: MeasuredLine,
  landingsM: readonly number[],
  options: FlightOptions,
): FlightPlan {
  const marks = [...new Set([0, ...landingsM, line.lengthM])]
    .filter((m) => m >= 0 && m <= line.lengthM)
    .sort((a, b) => a - b);
  const legs: FlightLeg[] = [];
  for (let i = 1; i < marks.length; i++) {
    const fromM = marks[i - 1]!;
    const toM = marks[i]!;
    if (toM > fromM) legs.push({ fromM, toM, peakM: options.arcHeightFactor * (toM - fromM) });
  }
  const sampled = sampleLine(line, Math.max(1, line.lengthM / ARC_SAMPLES));
  const plan: FlightPlan = { options, legs, arc: { ...sampled, altitudesM: [] } };
  plan.arc.altitudesM = sampled.atM.map((m) => altitudeAt(plan, m));
  return plan;
}

export function legAt(flight: FlightPlan, s: number): FlightLeg | undefined {
  return flight.legs.find((leg) => leg.fromM <= s && s <= leg.toM);
}

/** Height above the ground `s` metres along the route. */
export function altitudeAt(flight: FlightPlan, s: number): number {
  const leg = legAt(flight, s);
  if (!leg) return 0;
  const u = (s - leg.fromM) / (leg.toM - leg.fromM);
  return leg.peakM * Math.sin(Math.PI * u);
}

/**
 * The plane's pitch: the slope of the arc it flies along, positive while climbing. Right at
 * the ends it eases to level, so a plane waiting at the gate does not point at the sky.
 */
export function climbDegAt(flight: FlightPlan, s: number): number {
  const leg = legAt(flight, s);
  if (!leg) return 0;
  const length = leg.toM - leg.fromM;
  const u = (s - leg.fromM) / length;
  const slope = ((leg.peakM * Math.PI) / length) * Math.cos(Math.PI * u);
  const level = Math.min(1, Math.min(u, 1 - u) / ROTATE_SHARE);
  return ((Math.atan(slope) * 180) / Math.PI) * level;
}

/** The arc flown up to `s` with its heights, ending exactly at the plane (`head`). */
export function arcUntil(
  flight: FlightPlan,
  s: number,
  head: LngLat,
): { points: LngLat[]; altitudesM: number[] } {
  const { points, atM, altitudesM } = flight.arc;
  const headAltitude = altitudeAt(flight, s);
  // Same shape as lineUntil: a vehicle at the start still has a (zero-length) line.
  if (s <= 0) return { points: [[...head], [...head]], altitudesM: [headAltitude, headAltitude] };
  let low = 0;
  let high = atM.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (atM[middle]! < s) low = middle + 1;
    else high = middle;
  }
  return {
    points: [...points.slice(0, low).map((p): LngLat => [p[0], p[1]]), [...head]],
    altitudesM: [...altitudesM.slice(0, low), headAltitude],
  };
}
