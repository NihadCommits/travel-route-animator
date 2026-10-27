import { lineUntil, pointAt } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { Id } from '../model/primitives';
import type { Timeline, TrackPlan } from '../timeline/compileTimeline';
import { cameraAt, metersPerPixel, type CameraState } from './camera';
import { headingAt } from './heading';
import { distanceAt } from './position';

export interface TrackFrame {
  trackId: Id;
  /** The line driven so far, ending at the vehicle. */
  revealed: LngLat[];
  /** The whole route, when the track shows it faintly ahead ("ghost"). */
  ghost: readonly LngLat[] | undefined;
  head: { lngLat: LngLat; bearingDeg: number; altitudeM: number };
  /** Share of the distance driven, 0 to 1. */
  progress: number;
  visible: boolean;
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
  return {
    trackId: plan.trackId,
    revealed: lineUntil(line, s),
    ghost: plan.style.futureRoute === 'ghost' ? line.points : undefined,
    head: { lngLat, bearingDeg: headingAt(line, s, windowM), altitudeM: 0 },
    progress: line.lengthM > 0 ? s / line.lengthM : 1,
    visible: true,
  };
}

function labelsAt(timeline: Timeline, sec: number): LabelFrame[] {
  if (!timeline.overlays.labels) return [];
  return timeline.tracks.flatMap((plan) =>
    plan.stops
      .filter((stop) => stop.showLabel && stop.name.trim() !== '')
      .map((stop) => {
        // A faint route ahead shows its stops ahead too; otherwise they appear on arrival.
        const shownEarly = stop.isStart || plan.style.futureRoute === 'ghost';
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
    camera,
    tracks: timeline.tracks.map((plan) => trackFrame(plan, sec, camera)),
    labels: labelsAt(timeline, sec),
    counters: distanceKm === undefined ? {} : { distanceKm },
    effects: { blur: 0, flash: 0, fade: 0, satelliteMix: 0 },
  };
}
