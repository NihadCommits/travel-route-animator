import { lineAhead, lineUntil, pointAt } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { Id } from '../model/primitives';
import type { Timeline, TrackPlan } from '../timeline/compileTimeline';
import { movingSecAt } from './animation';
import { cameraAt, metersPerPixel, sectionEffects, type CameraState } from './camera';
import {
  altitudeAt,
  arcAhead,
  arcUntil,
  climbDegAt,
  flightStyleFor,
  legAt,
  type FlightStyle,
} from './flight';
import { headingAt } from './heading';
import { distanceAt } from './position';

/** What a flight adds to its track's frame (ADR 0007). */
export interface FlightFrame {
  /** Height of every point of `revealed`, in metres. */
  revealedAltitudesM: number[];
  /** Height of every point of `ahead`, when the route ahead is shown. */
  aheadAltitudesM: number[] | undefined;
  /** Nose up (positive) or down, in degrees. */
  climbDeg: number;
  /** Top of the current hop, for scaling the fake-3D icon. */
  peakM: number;
  showShadow: boolean;
}

export interface TrackFrame {
  trackId: Id;
  /** The line driven so far, ending at the vehicle. Flights: densely sampled along the arc. */
  revealed: LngLat[];
  /**
   * The route still to go, from its end back to the vehicle (ADR 0008); undefined when the
   * track hides it. Flights: densely sampled along the arc.
   */
  ahead: LngLat[] | undefined;
  /** `altitudeM` is the height above the ground; only planes leave it. */
  head: { lngLat: LngLat; bearingDeg: number; altitudeM: number };
  /** Share of the distance driven, 0 to 1. */
  progress: number;
  /** Seconds on the move so far, without holds; animated icons follow it (ADR 0009). */
  movingSec: number;
  visible: boolean;
  flight: FlightFrame | undefined;
}

export interface LabelFrame {
  waypointId: Id;
  trackId: Id;
  text: string;
  lngLat: LngLat;
  opacity: number;
}

/** Everything visible in one frame (ARCHITEKTUR: FrameState). */
export interface FrameState {
  frame: number;
  /** Seconds from the start of the main part: negative in the intro, beyond its end in the outro. */
  sec: number;
  section: 'intro' | 'main' | 'outro';
  mapStyleKey: string;
  projection: 'mercator' | 'globe';
  /** How the stage's flights are drawn; follows the tilt (ADR 0007). */
  flightStyle: FlightStyle;
  camera: CameraState;
  tracks: TrackFrame[];
  labels: LabelFrame[];
  counters: { distanceKm?: number };
  /** Blur, flash, fade and satellite blend come with the transitions (M10, M11). */
  effects: { blur: number; flash: number; fade: number; satelliteMix: number };
}

/**
 * The heading looks this many (reference) pixels behind and ahead of the vehicle: an icon turns
 * over about three of its lengths, like a real car through a bend, and kinks much smaller than
 * that do not show (a road wiggling 4 m every 30 m turns it by under a degree per frame).
 */
const HEADING_WINDOW_PX = 64;
/** Labels fade in over this time once the vehicle arrives. */
export const LABEL_FADE_SEC = 0.4;

function trackFrame(plan: TrackPlan, sec: number, camera: CameraState): TrackFrame {
  const { line } = plan;
  const s = distanceAt(plan, sec);
  const lngLat = pointAt(line, s);
  const windowM = HEADING_WINDOW_PX * metersPerPixel(camera.zoom, lngLat[1]);
  const aheadShown = plan.style.ahead.opacity > 0;
  const head = { lngLat, bearingDeg: headingAt(line, s, windowM), altitudeM: 0 };
  const progress = line.lengthM > 0 ? s / line.lengthM : 1;
  const movingSec = movingSecAt(plan.phases, sec);
  const { flight } = plan;
  if (!flight) {
    return {
      trackId: plan.trackId,
      revealed: lineUntil(line, s),
      ahead: aheadShown ? lineAhead(line, s) : undefined,
      head,
      progress,
      movingSec,
      visible: true,
      flight: undefined,
    };
  }
  const arc = arcUntil(flight, s, lngLat);
  const ahead = aheadShown ? arcAhead(flight, s, lngLat) : undefined;
  return {
    trackId: plan.trackId,
    revealed: arc.points,
    ahead: ahead?.points,
    head: { ...head, altitudeM: altitudeAt(flight, s) },
    progress,
    movingSec,
    visible: true,
    flight: {
      revealedAltitudesM: arc.altitudesM,
      aheadAltitudesM: ahead?.altitudesM,
      climbDeg: climbDegAt(flight, s),
      peakM: legAt(flight, s)?.peakM ?? 0,
      showShadow: flight.options.showGroundShadow,
    },
  };
}

function labelsAt(timeline: Timeline, sec: number): LabelFrame[] {
  if (!timeline.overlays.labels) return [];
  return timeline.tracks.flatMap((plan) =>
    plan.stops
      .filter((stop) => stop.showLabel && stop.name.trim() !== '')
      .map((stop) => {
        // A visible route ahead shows its stops ahead too; otherwise they appear on arrival.
        const shownEarly = stop.isStart || plan.style.ahead.opacity > 0;
        const opacity = shownEarly
          ? 1
          : Math.min(1, Math.max(0, (sec - stop.arrivalSec) / LABEL_FADE_SEC));
        return {
          waypointId: stop.waypointId,
          trackId: plan.trackId,
          text: stop.name,
          lngLat: stop.lngLat,
          opacity,
        };
      }),
  );
}

/** The track whose kilometres the counter shows: the followed one, else the first. */
function counterTrack(timeline: Timeline): TrackPlan | undefined {
  const { followTrackId } = timeline.view.camera;
  return timeline.tracks.find((t) => t.trackId === followTrackId) ?? timeline.tracks[0];
}

/**
 * What frame `frame` shows. A pure function: the same timeline and frame always give the same
 * result, in whatever order frames are asked for, because Remotion renders them in parallel
 * and out of order (ARCHITEKTUR: Determinismus).
 */
export function computeFrameState(timeline: Timeline, frame: number): FrameState {
  const sec = frame / timeline.fps - timeline.introSec;
  const camera = cameraAt(timeline, sec);
  const counted = counterTrack(timeline);

  let distanceKm: number | undefined;
  if (timeline.overlays.distanceCounter && counted) {
    const { lengthM } = counted.line;
    const share = lengthM > 0 ? distanceAt(counted, sec) / lengthM : 0;
    // Scaled to the route's own distance, so the counter ends at what the inspector shows.
    distanceKm = (share * counted.distanceM) / 1000;
  }

  return {
    frame,
    sec,
    section: sec < 0 ? 'intro' : sec > timeline.mainSec ? 'outro' : 'main',
    mapStyleKey: timeline.mapStyleKey,
    projection: timeline.view.mode === 'globe' ? 'globe' : 'mercator',
    flightStyle: flightStyleFor(timeline.view.pitchDeg),
    camera,
    tracks: timeline.tracks.map((plan) => trackFrame(plan, sec, camera)),
    labels: labelsAt(timeline, sec),
    counters: distanceKm === undefined ? {} : { distanceKm },
    effects: sectionEffects(timeline, sec),
  };
}
