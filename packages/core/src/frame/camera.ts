import { smoothedPointAt } from '../geo/along';
import { boundsOf, type Bounds } from '../geo/bounds';
import type { LngLat } from '../geo/lngLat';
import { overviewBlendSec, type Timeline, type TrackPlan } from '../timeline/compileTimeline';
import { ease } from '../timeline/easing';
import {
  altitudeAt,
  FAKE_LIFT,
  flightStyleFor,
  legAt,
  liftedPoint,
  type FlightPlan,
} from './flight';
import { distanceAt, positionAt } from './position';

export interface CameraState {
  center: LngLat;
  zoom: number;
  pitchDeg: number;
  bearingDeg: number;
  /**
   * Height of the point the camera looks at, in metres: a followed plane in the air. `cameraAt`
   * has already moved `center` so that this point is in the middle of the picture; the scene
   * needs nothing else (MapLibre's own centre elevation does nothing on the globe).
   */
  centerAltitudeM: number;
}

export interface Viewport {
  width: number;
  height: number;
}

// MapLibre's world is 512 pixels wide at zoom 0 and doubles with every zoom level.
const TILE_SIZE = 512;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const MAX_ZOOM = 16;

const mercatorX = (lng: number) => (lng + 180) / 360;
const mercatorY = (lat: number) => {
  const clamped = Math.max(-85.051129, Math.min(85.051129, lat));
  const phi = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
};
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** Ground metres per screen pixel; how big things look at a zoom. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (TILE_SIZE * 2 ** zoom);
}

/** Free space in pixels on each side of the picture. */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Centre and zoom that show the box with the padding free around it: the Web Mercator version
 * of map.fitBounds, but as plain maths. That keeps the camera testable and free of asynchronous
 * map calls (ARCHITEKTUR: Kamera). With a tilted map it is an approximation.
 */
export function fitBounds(
  bounds: Bounds,
  viewport: Viewport,
  padding: number | Padding,
  maxZoom = MAX_ZOOM,
): { center: LngLat; zoom: number } {
  const pad =
    typeof padding === 'number'
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : padding;
  const x0 = mercatorX(bounds.west);
  const x1 = mercatorX(bounds.east);
  const y0 = mercatorY(bounds.north);
  const y1 = mercatorY(bounds.south);
  const width = Math.max(1, viewport.width - pad.left - pad.right);
  const height = Math.max(1, viewport.height - pad.top - pad.bottom);
  // A box without width or height (one point, or all vehicles at the start) fits at any zoom.
  const zoomX = x1 > x0 ? Math.log2(width / ((x1 - x0) * TILE_SIZE)) : Infinity;
  const zoomY = y1 > y0 ? Math.log2(height / ((y1 - y0) * TILE_SIZE)) : Infinity;
  const zoom = Math.max(0, Math.min(maxZoom, zoomX, zoomY));
  // With uneven padding the box sits in the middle of the free area, not of the picture, so
  // the map centre moves by half the difference.
  const world = TILE_SIZE * 2 ** zoom;
  const shiftX = (pad.right - pad.left) / 2 / world;
  const shiftY = (pad.bottom - pad.top) / 2 / world;
  return { center: [lngOf((x0 + x1) / 2 + shiftX), latOf((y0 + y1) / 2 + shiftY)], zoom };
}

/**
 * Bands the overlays take: the title at the top, the kilometre counter at the bottom (see
 * packages/scene/src/overlays). Fits keep routes and vehicles out of them.
 */
export const OVERLAY_BAND_PX = 130;

/** The camera's padding plus the bands of the overlays this stage shows. */
export function framePadding(timeline: Timeline): Padding {
  const { paddingPx } = timeline.view.camera;
  const { title, distanceCounter } = timeline.overlays;
  return {
    top: paddingPx + (title ? OVERLAY_BAND_PX : 0),
    right: paddingPx,
    bottom: paddingPx + (distanceCounter ? OVERLAY_BAND_PX : 0),
    left: paddingPx,
  };
}

/** A camera between two others; zoom is already logarithmic, so plain blending looks even. */
export function blendCamera(a: CameraState, b: CameraState, f: number): CameraState {
  const mix = (from: number, to: number) => from + (to - from) * f;
  // The shorter way round for the bearing (350° → 10° turns 20°, not 340°).
  const turn = ((((b.bearingDeg - a.bearingDeg) % 360) + 540) % 360) - 180;
  return {
    center: [mix(a.center[0], b.center[0]), mix(a.center[1], b.center[1])],
    zoom: mix(a.zoom, b.zoom),
    pitchDeg: mix(a.pitchDeg, b.pitchDeg),
    bearingDeg: a.bearingDeg + turn * f,
    centerAltitudeM: mix(a.centerAltitudeM, b.centerAltitudeM),
  };
}

/**
 * A camera between two others that keeps one point steady on screen: the anchor (usually the
 * vehicle) glides in a straight line from where `a` shows it to where `b` shows it, while the
 * zoom changes. Blending centre and zoom independently would let the vehicle swerve across
 * the picture during an overview zoom.
 */
export function anchoredBlend(
  a: CameraState,
  b: CameraState,
  f: number,
  anchor: LngLat,
): CameraState {
  const blended = blendCamera(a, b, f);
  const ax = mercatorX(anchor[0]);
  const ay = mercatorY(anchor[1]);
  // Where the anchor appears, in pixels from the picture's centre, in either camera.
  const offset = (camera: CameraState) => {
    const world = TILE_SIZE * 2 ** camera.zoom;
    return [
      (ax - mercatorX(camera.center[0])) * world,
      (ay - mercatorY(camera.center[1])) * world,
    ] as const;
  };
  const [oax, oay] = offset(a);
  const [obx, oby] = offset(b);
  const world = TILE_SIZE * 2 ** blended.zoom;
  const ox = oax + (obx - oax) * f;
  const oy = oay + (oby - oay) * f;
  return { ...blended, center: [lngOf(ax - ox / world), latOf(ay - oy / world)] };
}

/** Tilt and turn of the stage's view, looking at the ground. */
function viewAngles(timeline: Timeline) {
  return {
    pitchDeg: timeline.view.pitchDeg,
    bearingDeg: timeline.view.bearingDeg,
    centerAltitudeM: 0,
  };
}

export function overviewCamera(timeline: Timeline): CameraState {
  const { overview, viewport } = timeline;
  const fit = overview
    ? fitBounds(overview, viewport, framePadding(timeline))
    : { center: [0, 0] as LngLat, zoom: 1 };
  return { ...fit, ...viewAngles(timeline) };
}

/** The zoom for following a track when none is set: a bit closer than its own overview. */
function followZoom(timeline: Timeline, plan: TrackPlan): number {
  const bounds = boundsOf(plan.line.points);
  if (!bounds) return 10;
  const { zoom } = fitBounds(bounds, timeline.viewport, framePadding(timeline));
  return Math.max(3, Math.min(14, zoom + 1.5));
}

function followedTrack(timeline: Timeline): TrackPlan | undefined {
  const { followTrackId } = timeline.view.camera;
  return timeline.tracks.find((t) => t.trackId === followTrackId) ?? timeline.tracks[0];
}

/** The camera smooths the route over this share of the picture's short side (ADR 0006). */
const PATH_SMOOTHING_SHARE = 0.3;
/** Samples of the time window; a triangle of ten is smooth and cheap per frame. */
const TIME_SAMPLES = 10;

/**
 * Where a stabilised camera looks for a vehicle, like a drone shot rather than a camera
 * bolted to the car (ADR 0006). Two smoothings, both without state between frames:
 *
 * - along the route, over about a third of the picture: the camera cuts through bends and
 *   junctions instead of tracing every one, the vehicle swings a little around the centre;
 * - over time, a triangle of ±lagSec around now: starting and braking become soft, but on
 *   average the camera is neither behind nor ahead of the vehicle.
 *
 * `spatialZoom` sizes the stretch along the route; undefined skips that part (follow-all,
 * whose zoom depends on the very positions it frames).
 */
function stabilisedPosition(
  timeline: Timeline,
  plan: TrackPlan,
  sec: number,
  spatialZoom: number | undefined,
): LngLat {
  const { lagSec } = timeline.view.camera;
  const { width, height } = timeline.viewport;
  const halfWindowM =
    spatialZoom === undefined
      ? 0
      : ((PATH_SMOOTHING_SHARE * Math.min(width, height)) / 2) *
        metersPerPixel(spatialZoom, positionAt(plan, sec)[1]);
  const pointAtTime = (time: number) =>
    smoothedPointAt(plan.line, distanceAt(plan, time), halfWindowM);
  // The window shrinks towards the start and the end of the journey, so the camera does not
  // run ahead of a vehicle that is still waiting, and arrives with it.
  const halfWindowSec = Math.min(
    lagSec,
    Math.max(0, Math.min(sec - plan.startSec, plan.endSec - sec)),
  );
  if (halfWindowSec <= 0) return pointAtTime(sec);

  let lng = 0;
  let lat = 0;
  let weights = 0;
  for (let k = 0; k < TIME_SAMPLES; k++) {
    // Midpoints of TIME_SAMPLES equal slices of -1..1, weighted as a triangle.
    const u = (2 * k + 1) / TIME_SAMPLES - 1;
    const weight = 1 - Math.abs(u);
    const [x, y] = pointAtTime(sec + u * halfWindowSec);
    lng += x * weight;
    lat += y * weight;
    weights += weight;
  }
  return [lng / weights, lat / weights];
}

/** Flights: how much closer the take-off/landing camera starts and ends than at cruise. */
const TAKEOFF_ZOOM_IN = 3;
const MAX_GROUND_ZOOM = 11;
/** At cruise the camera shows a little more than the whole flight. */
const CRUISE_ZOOM_OUT = 0.3;

/**
 * Zoom change that keeps the globe the same size on screen when the centre moves from
 * `fromLat` to `lat`. MapLibre grows the globe towards the poles so that the scale in the
 * middle matches Mercator at the same zoom; without this a north–south flight would "pump".
 */
export function globeZoomShift(lat: number, fromLat: number): number {
  const cos = (deg: number) => Math.max(0.01, Math.cos((deg * Math.PI) / 180));
  return Math.log2(cos(lat) / cos(fromLat));
}

/**
 * Following a plane: the camera looks at it in the air. With `takeoffLandingCamera` the zoom
 * follows the height, close at the airports and out to the whole flight at the top.
 */
function flightCamera(
  timeline: Timeline,
  plan: TrackPlan,
  flight: FlightPlan,
  sec: number,
): CameraState {
  const bounds = boundsOf(plan.line.points);
  const fit = bounds
    ? fitBounds(bounds, timeline.viewport, framePadding(timeline))
    : { center: plan.line.points[0] ?? ([0, 0] as LngLat), zoom: 5 };
  const cruise = timeline.view.camera.zoom ?? Math.max(1, fit.zoom - CRUISE_ZOOM_OUT);
  const s = distanceAt(plan, sec);
  const altitudeM = altitudeAt(flight, s);
  let zoom = cruise;
  if (flight.options.takeoffLandingCamera) {
    const peakM = legAt(flight, s)?.peakM ?? 0;
    const ground = Math.max(cruise, Math.min(MAX_GROUND_ZOOM, cruise + TAKEOFF_ZOOM_IN));
    zoom = ground + (cruise - ground) * (peakM > 0 ? altitudeM / peakM : 0);
  }
  const center = stabilisedPosition(timeline, plan, sec, zoom);
  if (timeline.view.mode === 'globe') zoom += globeZoomShift(center[1], fit.center[1]);
  return { center, zoom, ...viewAngles(timeline), centerAltitudeM: altitudeM };
}

/** The camera of the chosen mode at `sec`, without the overview transitions. */
function modeCamera(timeline: Timeline, sec: number): CameraState {
  const { camera } = timeline.view;
  switch (camera.mode) {
    case 'static':
      return camera.staticCamera
        ? {
            center: camera.staticCamera.center,
            zoom: camera.staticCamera.zoom,
            pitchDeg: camera.staticCamera.pitchDeg,
            bearingDeg: camera.staticCamera.bearingDeg,
            centerAltitudeM: 0,
          }
        : overviewCamera(timeline);
    case 'overview':
      return overviewCamera(timeline);
    case 'follow': {
      const plan = followedTrack(timeline);
      if (!plan) return overviewCamera(timeline);
      if (plan.flight) return flightCamera(timeline, plan, plan.flight, sec);
      const zoom = camera.zoom ?? followZoom(timeline, plan);
      return {
        center: stabilisedPosition(timeline, plan, sec, zoom),
        zoom,
        ...viewAngles(timeline),
      };
    }
    case 'follow-all': {
      const bounds = boundsOf(
        timeline.tracks.map((plan) => stabilisedPosition(timeline, plan, sec, undefined)),
      );
      if (!bounds) return overviewCamera(timeline);
      // When all vehicles stand together (often at the start) the box is a point; do not dive
      // in further than a couple of levels above the overview.
      const maxZoom = camera.zoom ?? Math.min(14, overviewCamera(timeline).zoom + 2);
      return {
        ...fitBounds(bounds, timeline.viewport, framePadding(timeline), maxZoom),
        ...viewAngles(timeline),
      };
    }
  }
}

/**
 * Where the camera is at `sec` (seconds from the start of the main part; negative during the
 * intro, beyond mainSec during the outro). A pure function of the timeline and the time.
 */
export function cameraAt(timeline: Timeline, sec: number): CameraState {
  const camera = cameraOnPath(timeline, sec);
  if (camera.centerAltitudeM <= 0) return camera;
  // Something h metres up shows where the camera's ray through it meets the ground: h · tan
  // (tilt) further along the view. Moving the centre there puts the plane in the middle of the
  // picture, on the globe and the flat map alike. Fake 3D lifts the plane on screen by its own
  // share of the height instead (ADR 0007).
  const lift =
    flightStyleFor(camera.pitchDeg) === 'arc-3d'
      ? Math.tan((camera.pitchDeg * Math.PI) / 180)
      : FAKE_LIFT;
  return {
    ...camera,
    center: liftedPoint(camera.center, camera.centerAltitudeM * lift, camera.bearingDeg),
  };
}

/** How close the 3D arrival comes: buildings stand from zoom 13 on and read well at 16. */
export const ARRIVAL_ZOOM = 16;
/** A dive-out starts this close above the start, as if a drone had just taken off. */
export const DIVE_OUT_ZOOM = 17;
/** Share of the 3D arrival spent moving in and tilting; the orbit takes the whole time. */
const ARRIVAL_APPROACH_SHARE = 0.5;

/** Where the eye ends up: the followed vehicle's place at `sec`, else the first vehicle's. */
function placeAt(timeline: Timeline, sec: number): LngLat | undefined {
  const track = followedTrack(timeline);
  return track ? positionAt(track, sec) : undefined;
}

function cameraOnPath(timeline: Timeline, sec: number): CameraState {
  const { camera } = timeline.view;
  const { mainSec, introSec, outroSec, intro, outro } = timeline;
  // What the eye follows through an overview zoom: the followed vehicle, otherwise the
  // centre of the mode's own picture.
  const followed = camera.mode === 'follow' ? followedTrack(timeline) : undefined;
  const anchorAt = (time: number, base: CameraState) =>
    followed ? positionAt(followed, time) : base.center;

  if (sec < 0) {
    // Where the main part really starts (an overview start included), so nothing jumps.
    const start = cameraOnPath(timeline, 0);
    if (intro.type === 'none' || introSec <= 0) return start;
    const t = (sec + introSec) / introSec;
    if (intro.type === 'overview-to-start') {
      return anchoredBlend(
        overviewCamera(timeline),
        start,
        ease('ease-in-out', t),
        anchorAt(0, start),
      );
    }
    // dive-out: from straight above the start, fast at first, settling into the stage.
    const origin = placeAt(timeline, 0) ?? start.center;
    const deep: CameraState = {
      ...start,
      center: origin,
      zoom: Math.max(start.zoom, DIVE_OUT_ZOOM),
      pitchDeg: 0,
    };
    return anchoredBlend(deep, start, ease('ease-out', t), origin);
  }
  if (sec > mainSec) {
    // Where the main part really ends (an overview end included), so nothing jumps.
    const end = cameraOnPath(timeline, mainSec);
    if (outro.type === 'none' || outroSec <= 0) return end;
    const t = Math.min(1, (sec - mainSec) / outroSec);
    const target = placeAt(timeline, mainSec) ?? end.center;
    switch (outro.type) {
      case 'overview': {
        const f = ease('ease-in-out', (sec - mainSec) / Math.min(2, outroSec * 0.6));
        return anchoredBlend(end, overviewCamera(timeline), f, anchorAt(mainSec, end));
      }
      case 'dive-in': {
        // Straight down onto the destination, faster and faster: the hard cut to the footage
        // comes in the middle of the movement.
        const deep: CameraState = {
          center: target,
          zoom: outro.targetZoom,
          pitchDeg: 0,
          bearingDeg: end.bearingDeg,
          centerAltitudeM: 0,
        };
        return anchoredBlend(end, deep, ease('ease-in', t), target);
      }
      case 'arrival-3d': {
        // Move in and tilt during the first half; circle the destination the whole time.
        const close: CameraState = {
          center: target,
          zoom: Math.max(end.zoom, ARRIVAL_ZOOM),
          pitchDeg: outro.pitchDeg,
          bearingDeg: end.bearingDeg,
          centerAltitudeM: 0,
        };
        const approach = ease('ease-in-out', Math.min(1, t / ARRIVAL_APPROACH_SHARE));
        const moved = anchoredBlend(end, close, approach, target);
        return { ...moved, bearingDeg: end.bearingDeg + outro.orbitDeg * ease('ease-in-out', t) };
      }
    }
  }

  const base = modeCamera(timeline, sec);
  const blendSec = overviewBlendSec(mainSec);
  if (camera.startWithOverview && sec < blendSec) {
    const f = ease('ease-in-out', sec / blendSec);
    return anchoredBlend(overviewCamera(timeline), base, f, anchorAt(sec, base));
  }
  if (camera.endWithOverview && sec > mainSec - blendSec) {
    const f = ease('ease-in-out', (sec - (mainSec - blendSec)) / blendSec);
    return anchoredBlend(base, overviewCamera(timeline), f, anchorAt(sec, base));
  }
  return base;
}

/** What an outro adds over the map in a frame (FrameState.effects). */
export interface SectionEffects {
  /** Blur in reference pixels. */
  blur: number;
  /** White over the picture, 0 to 1 (flash, fade to white). */
  flash: number;
  /** Black over the picture, 0 to 1. */
  fade: number;
  /** How much of the satellite picture shows over the map, 0 to 1. */
  satelliteMix: number;
}

const NO_EFFECTS: SectionEffects = { blur: 0, flash: 0, fade: 0, satelliteMix: 0 };
/** Strongest blur of a dive-in, at its last frame. */
const DIVE_BLUR_PX = 14;

/**
 * The look of a dive-in's end (M11): the effect rises towards the last frame, so that frame is
 * the strongest, and the cut to the footage comes right after it.
 */
export function sectionEffects(timeline: Timeline, sec: number): SectionEffects {
  const { outro, mainSec, outroSec } = timeline;
  if (outro.type !== 'dive-in' || outroSec <= 0 || sec <= mainSec) return NO_EFFECTS;
  const t = Math.min(1, (sec - mainSec) / outroSec);
  // 0 until `from` of the way through, 1 at the end.
  const ramp = (from: number) => Math.max(0, (t - from) / (1 - from));
  return {
    blur: outro.effect === 'blur' ? DIVE_BLUR_PX * ramp(0.6) : 0,
    flash:
      outro.effect === 'flash' ? ramp(0.85) ** 2 : outro.effect === 'fade-white' ? ramp(0.6) : 0,
    fade: outro.effect === 'fade-black' ? ramp(0.6) : 0,
    satelliteMix: outro.switchToSatellite ? ramp(0.45) : 0,
  };
}
