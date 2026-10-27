import { boundsOf, type Bounds } from '../geo/bounds';
import type { LngLat } from '../geo/lngLat';
import type { Timeline, TrackPlan } from '../timeline/compileTimeline';
import { ease } from '../timeline/easing';
import { positionAt } from './position';

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

/**
 * Centre and zoom that show the box with `paddingPx` free on every side: the Web Mercator
 * version of map.fitBounds, but as plain maths. That keeps the camera testable and free of
 * asynchronous map calls (ARCHITEKTUR: Kamera). With a tilted map it is an approximation.
 */
export function fitBounds(
  bounds: Bounds,
  viewport: Viewport,
  paddingPx: number,
  maxZoom = MAX_ZOOM,
): { center: LngLat; zoom: number } {
  const x0 = mercatorX(bounds.west);
  const x1 = mercatorX(bounds.east);
  const y0 = mercatorY(bounds.north);
  const y1 = mercatorY(bounds.south);
  const width = Math.max(1, viewport.width - 2 * paddingPx);
  const height = Math.max(1, viewport.height - 2 * paddingPx);
  // A box without width or height (one point, or all vehicles at the start) fits at any zoom.
  const zoomX = x1 > x0 ? Math.log2(width / ((x1 - x0) * TILE_SIZE)) : Infinity;
  const zoomY = y1 > y0 ? Math.log2(height / ((y1 - y0) * TILE_SIZE)) : Infinity;
  const zoom = Math.max(0, Math.min(maxZoom, zoomX, zoomY));
  return { center: [lngOf((x0 + x1) / 2), latOf((y0 + y1) / 2)], zoom };
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

/** Overview transitions at the start and end of the main part: 15 % of it, at most 2 s. */
const overviewBlendSec = (mainSec: number) => Math.min(2, mainSec * 0.15);

function viewAngles(timeline: Timeline) {
  return { pitchDeg: timeline.view.pitchDeg, bearingDeg: timeline.view.bearingDeg };
}

export function overviewCamera(timeline: Timeline): CameraState {
  const { overview, viewport, view } = timeline;
  const fit = overview
    ? fitBounds(overview, viewport, view.camera.paddingPx)
    : { center: [0, 0] as LngLat, zoom: 1 };
  return { ...fit, ...viewAngles(timeline) };
}

/** The zoom for following a track when none is set: a bit closer than its own overview. */
function followZoom(timeline: Timeline, plan: TrackPlan): number {
  const bounds = boundsOf(plan.line.points);
  if (!bounds) return 10;
  const { zoom } = fitBounds(bounds, timeline.viewport, timeline.view.camera.paddingPx);
  return Math.max(3, Math.min(14, zoom + 1.5));
}

function followedTrack(timeline: Timeline): TrackPlan | undefined {
  const { followTrackId } = timeline.view.camera;
  return timeline.tracks.find((t) => t.trackId === followTrackId) ?? timeline.tracks[0];
}

/** The camera of the chosen mode at `sec`, without the overview transitions. */
function modeCamera(timeline: Timeline, sec: number): CameraState {
  const { camera } = timeline.view;
  // The camera trails the vehicle: it looks where the vehicle was lagSec ago, which smooths
  // its movement without remembering anything between frames.
  const lagged = sec - camera.lagSec;
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
      return {
        center: positionAt(plan, lagged),
        zoom: camera.zoom ?? followZoom(timeline, plan),
        ...viewAngles(timeline),
      };
    }
    case 'follow-all': {
      const bounds = boundsOf(timeline.tracks.map((plan) => positionAt(plan, lagged)));
      if (!bounds) return overviewCamera(timeline);
      // When all vehicles stand together (often at the start) the box is a point; do not dive
      // in further than a couple of levels above the overview.
      const maxZoom = camera.zoom ?? Math.min(14, overviewCamera(timeline).zoom + 2);
      return {
        ...fitBounds(bounds, timeline.viewport, camera.paddingPx, maxZoom),
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

  if (sec < 0) {
    const start = modeCamera(timeline, 0);
    // dive-out comes with M11; until then the intro holds the first camera.
    if (intro.type !== 'overview-to-start' || introSec <= 0) return start;
    return blendCamera(
      overviewCamera(timeline),
      start,
      ease('ease-in-out', (sec + introSec) / introSec),
    );
  }
  if (sec > mainSec) {
    const end = modeCamera(timeline, mainSec);
    // dive-in and arrival-3d come with M11; until then the outro holds the last camera.
    if (outro.type !== 'overview' || outroSec <= 0) return end;
    const blendSec = Math.min(2, outroSec * 0.6);
    return blendCamera(
      end,
      overviewCamera(timeline),
      ease('ease-in-out', (sec - mainSec) / blendSec),
    );
  }

  const base = modeCamera(timeline, sec);
  const blendSec = overviewBlendSec(mainSec);
  if (camera.startWithOverview && sec < blendSec) {
    return blendCamera(overviewCamera(timeline), base, ease('ease-in-out', sec / blendSec));
  }
  if (camera.endWithOverview && sec > mainSec - blendSec) {
    return blendCamera(
      base,
      overviewCamera(timeline),
      ease('ease-in-out', (sec - (mainSec - blendSec)) / blendSec),
    );
  }
  return base;
}
