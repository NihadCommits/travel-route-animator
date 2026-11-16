import { readProfile, type ElevationReading } from '../elevation/profile';
import { parseDurationText } from './duration';
import { pinsAt, type PinFrame } from '../pins/pins';
import { lineAhead, lineUntil, pointAt } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { Id } from '../model/primitives';
import type { Timeline, TrackPlan } from '../timeline/compileTimeline';
import { movingSecAt } from './animation';
import { cameraAt, metersPerPixel, sectionEffects, type CameraState } from './camera';
import {
  arcAhead,
  arcUntil,
  climbDegAt,
  flightStyleFor,
  heightAt,
  legAt,
  type FlightStyle,
} from './flight';
import { headingAt } from './heading';
import { distanceAt } from './position';
import { channelAt, speedAt, timeAtDistance } from '../recording/recording';
import { recordedSecAt } from '../timeline/recordedPace';

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
  /**
   * `altitudeM`: only planes leave the ground. It is the height above the ground, or above sea
   * level when they are drawn in 3D over 3D terrain (ADR 0012). Vehicles on the ground stay at
   * 0; the 3D layer puts them on the terrain as it is drawn.
   */
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
  /** Kilometres and travel time so far, when the stage counts them. */
  /**
   * The values the overlay blocks show, in metric units; the scene formats them for each block
   * (M17). Computed whether a block shows them or not: they are cheap, and a block of any kind
   * may come and go along the stage.
   */
  counters: {
    distanceKm?: number;
    travelSec?: number;
    /** Real speed from a recording (M16). */
    speedKmh?: number;
    heartRateBpm?: number;
    cadenceRpm?: number;
    /** The time of day as milliseconds since 1970; shown in `timeline.clock.timeZone`. */
    clockMs?: number;
    /** How much of the counted track is done, 0 to 1. */
    progress?: number;
    /** The last stop the counted track reached (the first before it sets off). */
    place?: string;
    /** Where the counted vehicle is, e.g. for the flag of the country it is in. */
    lngLat?: LngLat;
  };
  /** Height and metres climbed on the profile track, when the stage shows them (ADR 0012). */
  elevation: (ElevationReading & { trackId: Id }) | undefined;
  /** The photos and places open in this frame (ADR 0014). */
  pins: PinFrame[];
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

/** `onTerrain`: flights are drawn in 3D over 3D terrain, so their heights include the ground. */
function trackFrame(
  plan: TrackPlan,
  sec: number,
  camera: CameraState,
  onTerrain: boolean,
): TrackFrame {
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
  const arc = arcUntil(flight, s, lngLat, onTerrain);
  const ahead = aheadShown ? arcAhead(flight, s, lngLat, onTerrain) : undefined;
  return {
    trackId: plan.trackId,
    revealed: arc.points,
    ahead: ahead?.points,
    head: { ...head, altitudeM: heightAt(flight, s, onTerrain) },
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

  const counters: FrameState['counters'] = {};
  if (counted) {
    const { overlays, clock } = timeline;
    const { lengthM } = counted.line;
    const s = distanceAt(counted, sec);
    const share = lengthM > 0 ? s / lengthM : 0;
    counters.progress = share;
    counters.lngLat = pointAt(counted.line, s);
    // Scaled to the route's own distance, so the counter ends at what the inspector shows.
    counters.distanceKm = (share * counted.distanceM) / 1000;
    const reached = counted.stops.filter((stop) => stop.isStart || stop.arrivalSec <= sec).at(-1);
    if (reached) counters.place = reached.name;
    // Where the recording was when it got here: real time, speed and heart rate (M16).
    const { recording } = counted;
    // With the recorded pace the phases know the recording's time, also while resting.
    const recordedSec =
      recording && (recordedSecAt(counted.phases, sec) ?? timeAtDistance(recording, s));
    // A typed duration wins, then what was recorded, then the router's estimate.
    const { manualDurationText } = overlays;
    const typed =
      manualDurationText !== undefined ? parseDurationText(manualDurationText) : undefined;
    const travel =
      typed !== undefined
        ? share * typed
        : (recordedSec ??
          (counted.durationS !== undefined ? share * counted.durationS : undefined));
    if (travel !== undefined) counters.travelSec = travel;
    if (recording && recordedSec !== undefined) {
      counters.speedKmh = speedAt(recording, recordedSec) * 3.6;
      const heartRate = channelAt(recording, 'heartRateBpm', recordedSec);
      if (heartRate !== undefined) counters.heartRateBpm = heartRate;
      const cadence = channelAt(recording, 'cadenceRpm', recordedSec);
      if (cadence !== undefined) counters.cadenceRpm = cadence;
    }
    if (clock) {
      const start =
        clock.source === 'recorded' && recording?.startedAt
          ? Date.parse(recording.startedAt)
          : clock.departureMs;
      // A recorded clock runs with the recording; a typed departure with the travel time.
      const elapsed = clock.source === 'recorded' && recording?.startedAt ? recordedSec : travel;
      if (start !== undefined) counters.clockMs = start + (elapsed ?? 0) * 1000;
    }
  }

  const flightStyle = flightStyleFor(timeline.view.pitchDeg);
  const onTerrain = flightStyle === 'arc-3d' && timeline.mapOptions.terrain !== undefined;
  return {
    frame,
    sec,
    section: sec < 0 ? 'intro' : sec > timeline.mainSec ? 'outro' : 'main',
    mapStyleKey: timeline.mapStyleKey,
    projection: timeline.view.mode === 'globe' ? 'globe' : 'mercator',
    flightStyle,
    camera,
    tracks: timeline.tracks.map((plan) => trackFrame(plan, sec, camera, onTerrain)),
    labels: labelsAt(timeline, sec),
    counters,
    elevation: elevationReading(timeline, sec),
    pins: pinsAt(timeline.pins, sec),
    effects: sectionEffects(timeline, sec),
  };
}

function elevationReading(timeline: Timeline, sec: number): FrameState['elevation'] {
  const { elevation } = timeline;
  const plan = timeline.tracks.find((each) => each.trackId === elevation?.trackId);
  if (!elevation || !plan) return undefined;
  return { trackId: plan.trackId, ...readProfile(elevation.profile, distanceAt(plan, sec)) };
}
