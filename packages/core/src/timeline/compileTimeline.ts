import {
  compileProfile,
  elevationAt,
  profileTrackOf,
  showsElevation,
  type ElevationProfile,
} from '../elevation/profile';
import { measureLine, type MeasuredLine } from '../geo/along';
import { planPins, type PinPlan } from '../pins/pins';
import { boundsOf, type Bounds } from '../geo/bounds';
import { planFlight, type FlightPlan } from '../frame/flight';
import type { LngLat } from '../geo/lngLat';
import type { Easing, VehicleType } from '../model/enums';
import type {
  Etappe,
  IntroSettings,
  OutroSettings,
  OverlaySettings,
  ViewSettings,
} from '../model/etappe';
import { defaultFlightOptions } from '../model/defaults';
import type { OutputSettings } from '../model/output';
import type { Id } from '../model/primitives';
import type { Project } from '../model/project';
import { MAX_HOLD_SHARE } from '../model/readiness';
import type { MapStyleRef } from '../model/style';
import type { Track, TrackStyle, Recording } from '../model/track';
import { findEtappe, resolveMapStyle, resolveOutput } from '../resolve/resolve';
import { canonicalJson } from '../routing/canonicalJson';
import { isRouteStale } from '../routing/inputHash';
import { refreshLocalRoutes } from '../routing/refresh';
import { invertEase } from './easing';
import { planRecordedPhases, type Hold } from './recordedPace';
import { zonedTimeToEpochMs } from '../time/zone';
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
  /**
   * With the recorded pace (M16): the stretch of the recording this phase plays, in seconds.
   * While the vehicle rests, the recording's time still runs on (clock, heart rate).
   */
  recordedSec?: { from: number; to: number };
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
  /** Look within the vehicle type, e.g. the aircraft type of a plane (PLANE_TYPES). */
  variant: string;
  style: TrackStyle;
  easing: Easing;
  line: MeasuredLine;
  /** False while the stored route does not fit the points: straight lines stand in. */
  routed: boolean;
  /** "ors", "local-great-circle" … for the credits; undefined without a route. */
  provider: string | undefined;
  /** The route's real distance (a router's road distance), for the kilometre counter. */
  distanceM: number;
  /** The router's estimate of the travel time, for the time counter (M14). */
  durationS: number | undefined;
  startSec: number;
  endSec: number;
  phases: Phase[];
  stops: StopPlan[];
  /** Planes only: the height profile; it lands at every stop (ADR 0007). */
  flight: FlightPlan | undefined;
  /** What a watch recorded along this route, for speed, heart rate and the clock (M16). */
  recording: Recording | undefined;
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
  /** What the stage adds to its map style, beyond the style itself. */
  mapOptions: MapOptions;
  /**
   * Changes whenever the map's style does (the style and its options); a chained stage with
   * another key needs a new map (M10, ADR 0012).
   */
  mapStyleKey: string;
  tracks: TrackPlan[];
  /** The height profile the stage shows (ADR 0012); undefined without heights or overlays. */
  elevation: { trackId: Id; profile: ElevationProfile } | undefined;
  /** Photos and places along the way, with when each is open (ADR 0014). */
  pins: PinPlan[];
  /** Box around every route of the stage, for the overview camera. */
  overview: Bounds | undefined;
  /** The time of day the stage shows (M16); the departure worked out once, not per frame. */
  clock: TimelineClock | undefined;
}

export interface TimelineClock {
  source: 'manual' | 'recorded';
  timeZone: string;
  /** A typed departure as milliseconds since 1970. */
  departureMs: number | undefined;
}

/** What a stage changes about its map style; all of it goes into `mapStyleKey`. */
export interface MapOptions {
  /** Buildings as blocks: the stage's view asks for them, or a 3D arrival (M11). */
  buildings3d: boolean;
  /** A dive-in that fades to the satellite picture at its end (M11). */
  satelliteMix: boolean;
  /** 3D terrain and how much higher it is drawn (ADR 0012); undefined on a flat map. */
  terrain: { exaggeration: number } | undefined;
  /** No map at all: only routes, vehicles and labels over a transparent picture (ADR 0013). */
  transparent: boolean;
}

export function mapOptionsOf(
  etappe: Pick<Etappe, 'view' | 'outro'>,
  output: Pick<OutputSettings, 'transparentOverlay'>,
): MapOptions {
  const { view, outro } = etappe;
  const transparent = output.transparentOverlay;
  return {
    // Without a map there are no buildings, and no satellite picture to fade to.
    buildings3d: !transparent && (view.buildings3d || outro.type === 'arrival-3d'),
    satelliteMix: !transparent && outro.type === 'dive-in' && outro.switchToSatellite,
    terrain: view.terrain.enabled ? { exaggeration: view.terrain.exaggeration } : undefined,
    transparent,
  };
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
function holdsOf(
  track: Track,
  atM: number[],
  totalSec: number,
): { holds: Hold[]; drivingSec: number } {
  const all = track.waypoints
    .map((waypoint, i) => ({ atM: atM[i]!, sec: waypoint.kind === 'stop' ? waypoint.holdSec : 0 }))
    .filter((hold) => hold.sec > 0);
  const holdTotal = all.reduce((sum, hold) => sum + hold.sec, 0);
  // Holds that leave (almost) no time to drive are reported by the readiness check
  // (track.holdsTooLong); until they are fixed the stage still plays, with shortened holds.
  const maxHoldSec = totalSec * MAX_HOLD_SHARE;
  const holdScale = holdTotal > maxHoldSec ? maxHoldSec / holdTotal : 1;
  return {
    holds: all.map((hold) => ({ atM: hold.atM, sec: hold.sec * holdScale })),
    drivingSec: totalSec - holdTotal * holdScale,
  };
}

function planPhases(
  { holds, drivingSec }: { holds: Hold[]; drivingSec: number },
  lengthM: number,
  startSec: number,
): Phase[] {
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
    const { sec } = hold;
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

/** When the vehicle is `atM` metres along its line: at the end of the trip if never. */
export function secAtDistance(plan: TrackPlan, atM: number): number {
  return arrivalSec(plan.phases, plan.easing, atM, plan.endSec);
}

function arrivalSec(phases: Phase[], easing: Easing, atM: number, fallback: number): number {
  const move = phases.find((p) => p.kind === 'move' && p.fromM <= atM && atM <= p.toM);
  if (!move) return fallback;
  const share = move.toM > move.fromM ? (atM - move.fromM) / (move.toM - move.fromM) : 1;
  return move.startSec + (move.endSec - move.startSec) * invertEase(easing, share);
}

/**
 * `terrain`: the stage's 3D terrain, from which a plane takes off and on which it lands at the
 * ground's height (ADR 0012).
 */
function planTrack(
  track: Track,
  arriveBySec: number,
  terrain: MapOptions['terrain'],
): TrackPlan | undefined {
  if (track.waypoints.length === 0) return undefined;
  const routed = track.computed !== undefined && !isRouteStale(track);
  const line = measureLine(
    routed ? track.computed!.geometry : track.waypoints.map((waypoint) => waypoint.lngLat),
  );
  const indices = waypointIndices(track, line, routed);
  const atM = indices.map((index) => line.cumulative[index]!);
  const startSec = track.timing.startOffsetSec;
  const totalSec = Math.max(0, track.timing.durationSec ?? arriveBySec - startSec);
  const stopHolds = holdsOf(track, atM, totalSec);
  // The recording cut to this route, when the route is up to date (M16).
  const recording = routed ? track.computed!.recording : undefined;
  const recordedPhases =
    track.timing.pace === 'recorded' && recording
      ? planRecordedPhases(
          recording,
          stopHolds.holds,
          startSec,
          stopHolds.drivingSec,
          track.timing.skipPauses === true,
        )
      : undefined;
  const phases = recordedPhases ?? planPhases(stopHolds, line.lengthM, startSec);
  // The recorded pace is the speed curve itself; an easing on top would distort it.
  const easing: Easing = recordedPhases ? 'linear' : track.timing.easing;

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

  const elevation = routed ? track.computed!.elevation : undefined;
  const groundAt =
    terrain && elevation
      ? (s: number) => elevationAt(elevation, line.lengthM, s) * terrain.exaggeration
      : undefined;
  const flight =
    track.vehicle.type === 'plane'
      ? planFlight(
          line,
          stops.map((stop) => stop.atM),
          track.flight ?? defaultFlightOptions(),
          groundAt,
        )
      : undefined;

  return {
    trackId: track.id,
    vehicle: track.vehicle.type,
    variant: track.vehicle.variant,
    style: track.style,
    easing,
    line,
    routed,
    provider: routed ? track.computed!.provider : undefined,
    distanceM: routed ? track.computed!.distanceM : line.lengthM,
    durationS: routed ? track.computed!.durationS : undefined,
    startSec,
    endSec: startSec + totalSec,
    phases,
    stops,
    flight,
    recording,
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
  const mapOptions = mapOptionsOf(etappe, output);
  const tracks = etappe.tracks.flatMap(
    (track) => planTrack(track, arriveBySec, mapOptions.terrain) ?? [],
  );
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
    mapOptions,
    mapStyleKey: canonicalJson({ mapStyle, mapOptions }),
    tracks,
    elevation: elevationOf(etappe, tracks),
    pins: planPins(
      etappe.pins,
      tracks.map((plan) => ({
        trackId: plan.trackId,
        line: plan.line,
        secAt: (s: number) => secAtDistance(plan, s),
      })),
      etappe.view.camera.mode === 'follow' ? etappe.view.camera.followTrackId : undefined,
    ),
    overview: boundsOf(tracks.flatMap((track) => track.line.points)),
    clock: etappe.clock && {
      source: etappe.clock.source,
      timeZone: etappe.clock.timeZone,
      departureMs:
        etappe.clock.departure === undefined
          ? undefined
          : zonedTimeToEpochMs(etappe.clock.departure, etappe.clock.timeZone),
    },
  };
}

/** The profile of the stage's profile track, once its route has heights. */
function elevationOf(etappe: Etappe, tracks: readonly TrackPlan[]): Timeline['elevation'] {
  if (!showsElevation(etappe)) return undefined;
  const track = profileTrackOf(etappe);
  const plan = tracks.find((each) => each.trackId === track?.id);
  const elevation = track?.computed?.elevation;
  if (!track || !plan?.routed || !elevation) return undefined;
  return { trackId: track.id, profile: compileProfile(elevation, plan.line.lengthM) };
}
