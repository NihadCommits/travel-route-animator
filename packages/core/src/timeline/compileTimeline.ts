import { measureLine, type MeasuredLine } from '../geo/along';
import { boundsOf, type Bounds } from '../geo/bounds';
import { planFlight, type FlightPlan } from '../frame/flight';
import type { LngLat } from '../geo/lngLat';
import type { Easing, VehicleType } from '../model/enums';
import type { IntroSettings, OutroSettings, OverlaySettings, ViewSettings } from '../model/etappe';
import { defaultFlightOptions } from '../model/defaults';
import type { OutputSettings } from '../model/output';
import type { Id } from '../model/primitives';
import type { Project } from '../model/project';
import { MAX_HOLD_SHARE } from '../model/readiness';
import type { MapStyleRef } from '../model/style';
import type { Track, TrackStyle } from '../model/track';
import { findEtappe, resolveMapStyle, resolveOutput } from '../resolve/resolve';
import { canonicalJson } from '../routing/canonicalJson';
import { isRouteStale } from '../routing/inputHash';
import { refreshLocalRoutes } from '../routing/refresh';
import { invertEase } from './easing';
import { outputSize } from './outputSize';

/**
 * One piece of a vehicle's journey: driving from one distance to another, or standing still
 * at a stop. Times are seconds from the start of the stage's main part (after the intro).
 */
export interface Phase {
  kind: 'move' | 'hold';
  startSec: number;
  endSec: number;
  fromM: number;
  toM: number;
}

export interface StopPlan {
  waypointId: Id;
  name: string;
  showLabel: boolean;
  /** Where the stop lies on the track's (unwrapped) line. */
  lngLat: LngLat;
  atM: number;
  /** When the vehicle gets there; the first stop is there from the start. */
  arrivalSec: number;
  isStart: boolean;
}

export interface TrackPlan {
  trackId: Id;
  vehicle: VehicleType;
  style: TrackStyle;
  easing: Easing;
  line: MeasuredLine;
  /** False while the stored route does not fit the points: straight lines stand in. */
  routed: boolean;
  /** "ors", "local-great-circle" … for the credits; undefined without a route. */
  provider: string | undefined;
  /** The route's real distance (a router's road distance), for the kilometre counter. */
  distanceM: number;
  startSec: number;
  endSec: number;
  phases: Phase[];
  stops: StopPlan[];
  /** Planes only: the height profile; it lands at every stop (ADR 0007). */
  flight: FlightPlan | undefined;
}

/**
 * Everything about a stage that does not change from frame to frame, worked out once. Every
 * frame is then a pure function of this and the frame number (computeFrameState), so Remotion
 * may render frames in any order (ARCHITEKTUR: Determinismus).
 */
export interface Timeline {
  etappeId: Id;
  fps: number;
  /** Video size in pixels. */
  width: number;
  height: number;
  /**
   * The same picture at 1080 pixels on the short side. Camera, line widths and text sizes are
   * defined in this space, and the map draws it `scale` times sharper: a 4K export then looks
   * exactly like the 1080p preview, only crisper.
   */
  viewport: { width: number; height: number };
  scale: number;
  durationInFrames: number;
  introSec: number;
  mainSec: number;
  outroSec: number;
  intro: IntroSettings;
  outro: OutroSettings;
  view: ViewSettings;
  overlays: OverlaySettings;
  mapStyle: MapStyleRef;
  /** Changes only when the look changes; the stage swaps styles on a new key (M10). */
  mapStyleKey: string;
  tracks: TrackPlan[];
  /** Box around every route of the stage, for the overview camera. */
  overview: Bounds | undefined;
}

export interface CompileOptions {
  /** Overrides from the render dialog, e.g. a 9:16 version. */
  output?: Partial<OutputSettings>;
  /**
   * Draws the picture at this share of its pixels, for a lighter preview (0.5 = half width
   * and height). Framing, line widths and text stay the same: only the scale changes.
   */
  previewScale?: number;
}

/** Overview transitions at the start and end of the main part: 15 % of it, at most 2 s. */
export const overviewBlendSec = (mainSec: number) => Math.min(2, mainSec * 0.15);

/** The size the look is designed at; see Timeline.viewport. */
export const REFERENCE_SHORT_SIDE = 1080;

function sectionSec(settings: IntroSettings | OutroSettings): number {
  return settings.type === 'none' ? 0 : settings.durationSec;
}

/**
 * The point of the line at each waypoint: where its leg starts on a route, or the waypoint
 * itself on the straight stand-in. The last waypoint is the end of the line.
 */
function waypointIndices(track: Track, line: MeasuredLine, routed: boolean): number[] {
  const last = line.points.length - 1;
  return track.waypoints.map((_, i) => {
    if (i === track.waypoints.length - 1) return last;
    if (!routed) return Math.min(i, last);
    return track.computed!.legs[i]?.startIndex ?? last;
  });
}

/**
 * The journey as phases. Holds at stops take their seconds; the driving time that is left is
 * shared out by distance, and each stretch between two holds gets its own easing, so the
 * vehicle pulls away and brakes at every stop instead of crawling through it.
 */
function planPhases(
  track: Track,
  atM: number[],
  lengthM: number,
  startSec: number,
  totalSec: number,
): Phase[] {
  const holds = track.waypoints
    .map((waypoint, i) => ({ atM: atM[i]!, sec: waypoint.kind === 'stop' ? waypoint.holdSec : 0 }))
    .filter((hold) => hold.sec > 0);
  const holdTotal = holds.reduce((sum, hold) => sum + hold.sec, 0);
  // Holds that leave (almost) no time to drive are reported by the readiness check
  // (track.holdsTooLong); until they are fixed the stage still plays, with shortened holds.
  const maxHoldSec = totalSec * MAX_HOLD_SHARE;
  const holdScale = holdTotal > maxHoldSec ? maxHoldSec / holdTotal : 1;
  const drivingSec = totalSec - holdTotal * holdScale;

  const phases: Phase[] = [];
  let time = startSec;
  let position = 0;
  const driveTo = (toM: number) => {
    if (toM <= position) return;
    const sec = lengthM > 0 ? (drivingSec * (toM - position)) / lengthM : 0;
    phases.push({ kind: 'move', startSec: time, endSec: time + sec, fromM: position, toM });
    time += sec;
    position = toM;
  };
  for (const hold of holds) {
    driveTo(hold.atM);
    const sec = hold.sec * holdScale;
    phases.push({
      kind: 'hold',
      startSec: time,
      endSec: time + sec,
      fromM: hold.atM,
      toM: hold.atM,
    });
    time += sec;
  }
  driveTo(lengthM);
  return phases;
}

function arrivalSec(phases: Phase[], easing: Easing, atM: number, fallback: number): number {
  const move = phases.find((p) => p.kind === 'move' && p.fromM <= atM && atM <= p.toM);
  if (!move) return fallback;
  const share = move.toM > move.fromM ? (atM - move.fromM) / (move.toM - move.fromM) : 1;
  return move.startSec + (move.endSec - move.startSec) * invertEase(easing, share);
}

function planTrack(track: Track, arriveBySec: number): TrackPlan | undefined {
  if (track.waypoints.length === 0) return undefined;
  const routed = track.computed !== undefined && !isRouteStale(track);
  const line = measureLine(
    routed ? track.computed!.geometry : track.waypoints.map((waypoint) => waypoint.lngLat),
  );
  const indices = waypointIndices(track, line, routed);
  const atM = indices.map((index) => line.cumulative[index]!);
  const startSec = track.timing.startOffsetSec;
  const totalSec = Math.max(0, track.timing.durationSec ?? arriveBySec - startSec);
  const phases = planPhases(track, atM, line.lengthM, startSec, totalSec);
  const { easing } = track.timing;

  const stops = track.waypoints.flatMap((waypoint, i): StopPlan[] => {
    if (waypoint.kind !== 'stop') return [];
    return [
      {
        waypointId: waypoint.id,
        name: waypoint.name,
        showLabel: waypoint.showLabel,
        lngLat: line.points[indices[i]!]!,
        atM: atM[i]!,
        arrivalSec: i === 0 ? startSec : arrivalSec(phases, easing, atM[i]!, startSec + totalSec),
        isStart: i === 0,
      },
    ];
  });

  const flight =
    track.vehicle.type === 'plane'
      ? planFlight(
          line,
          stops.map((stop) => stop.atM),
          track.flight ?? defaultFlightOptions(),
        )
      : undefined;

  return {
    trackId: track.id,
    vehicle: track.vehicle.type,
    style: track.style,
    easing,
    line,
    routed,
    provider: routed ? track.computed!.provider : undefined,
    distanceM: routed ? track.computed!.distanceM : line.lengthM,
    startSec,
    endSec: startSec + totalSec,
    phases,
    stops,
    flight,
  };
}

/**
 * The timeline of one stage: its sections (intro, main part, outro), the video format and,
 * per track, the measured line, the phases and the stops. Routes that need no router are
 * brought up to date here, so a project straight from the file plays correctly.
 */
export function compileTimeline(
  project: Project,
  etappeId: Id,
  options: CompileOptions = {},
): Timeline {
  const fresh = refreshLocalRoutes(project, project.updatedAt);
  const found = findEtappe(fresh, etappeId);
  if (!found) throw new Error(`Stage "${etappeId}" does not exist in project "${project.name}"`);
  const { etappe } = found;

  const output = resolveOutput(fresh, options.output);
  const full = outputSize(output);
  const previewScale = options.previewScale ?? 1;
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  const width = even(full.width * previewScale);
  const height = even(full.height * previewScale);
  const scale = (Math.min(full.width, full.height) / REFERENCE_SHORT_SIDE) * previewScale;
  const introSec = sectionSec(etappe.intro);
  const outroSec = sectionSec(etappe.outro);
  const mainSec = etappe.durationSec;
  // A stage that ends on the overview zooms out over an arrived vehicle: tracks that drive
  // "until the end" arrive before that zoom starts. An own duration is kept as it is.
  const arriveBySec = etappe.view.camera.endWithOverview
    ? mainSec - overviewBlendSec(mainSec)
    : mainSec;
  const tracks = etappe.tracks.flatMap((track) => planTrack(track, arriveBySec) ?? []);
  const mapStyle = resolveMapStyle(fresh, etappeId).value;

  return {
    etappeId,
    fps: output.fps,
    width,
    height,
    // The reference size of the full picture, not of the scaled pixels: same framing at any scale.
    viewport: {
      width: (full.width * REFERENCE_SHORT_SIDE) / Math.min(full.width, full.height),
      height: (full.height * REFERENCE_SHORT_SIDE) / Math.min(full.width, full.height),
    },
    scale,
    // One frame more than the length: the last frame shows the very end (the vehicle arrived).
    durationInFrames: Math.round((introSec + mainSec + outroSec) * output.fps) + 1,
    introSec,
    mainSec,
    outroSec,
    intro: etappe.intro,
    outro: etappe.outro,
    view: etappe.view,
    overlays: etappe.overlays,
    mapStyle,
    mapStyleKey: canonicalJson(mapStyle),
    tracks,
    overview: boundsOf(tracks.flatMap((track) => track.line.points)),
  };
}
