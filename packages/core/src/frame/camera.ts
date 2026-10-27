import { smoothedPointAt } from '../geo/along';
import { boundsOf, type Bounds } from '../geo/bounds';
import type { LngLat } from '../geo/lngLat';
import { overviewBlendSec, type Timeline, type TrackPlan } from '../timeline/compileTimeline';
import { ease } from '../timeline/easing';
import { distanceAt, positionAt } from './position';

export interface CameraState {
  center: LngLat;
  zoom: number;
  pitchDeg: number;
  bearingDeg: number;
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

function viewAngles(timeline: Timeline) {
  return { pitchDeg: timeline.view.pitchDeg, bearingDeg: timeline.view.bearingDeg };
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
          }
        : overviewCamera(timeline);
    case 'overview':
      return overviewCamera(timeline);
    case 'follow': {
      const plan = followedTrack(timeline);
      if (!plan) return overviewCamera(timeline);
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
  const { camera } = timeline.view;
  const { mainSec, introSec, outroSec, intro, outro } = timeline;
  // What the eye follows through an overview zoom: the followed vehicle, otherwise the
  // centre of the mode's own picture.
  const followed = camera.mode === 'follow' ? followedTrack(timeline) : undefined;
  const anchorAt = (time: number, base: CameraState) =>
    followed ? positionAt(followed, time) : base.center;

  if (sec < 0) {
    const start = modeCamera(timeline, 0);
    // dive-out comes with M11; until then the intro holds the first camera.
    if (intro.type !== 'overview-to-start' || introSec <= 0) return start;
    const f = ease('ease-in-out', (sec + introSec) / introSec);
    return anchoredBlend(overviewCamera(timeline), start, f, anchorAt(0, start));
  }
  if (sec > mainSec) {
    const end = modeCamera(timeline, mainSec);
    // dive-in and arrival-3d come with M11; until then the outro holds the last camera.
    if (outro.type !== 'overview' || outroSec <= 0) return end;
    const f = ease('ease-in-out', (sec - mainSec) / Math.min(2, outroSec * 0.6));
    return anchoredBlend(end, overviewCamera(timeline), f, anchorAt(mainSec, end));
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
