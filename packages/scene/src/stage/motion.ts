import {
  liftedPoint,
  metersPerPixel,
  type FrameState,
  type LngLat,
  type MotionFrame,
  type Timeline,
} from '@travel-route-animator/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { SceneFeatures } from './features';
import type { Layer3d, ScreenPoint } from './layer3d';

// Where every vehicle is in the finished picture (M13): measured after the map is idle, with
// the map's own projection, so tilt, rotation, terrain and the globe are all in it.

/** A point some pixels ahead along a heading, to see which way that heading points on screen. */
const AHEAD_PX = 20;

export function measureMotion(
  map: MapLibreMap,
  timeline: Timeline,
  state: FrameState,
  features: SceneFeatures,
  layer: Layer3d | null,
): MotionFrame['tracks'] {
  const { viewport, scale } = timeline;
  const drawn: ReadonlyMap<string, ScreenPoint> = layer?.screenPoints() ?? new Map();
  const icons = new Map(
    features.vehicles.features.map((feature) => [feature.properties.trackId, feature]),
  );
  return state.tracks.map((track) => {
    let point = drawn.get(track.trackId);
    if (!point) {
      // Flat icons (and vehicles without one) sit where the flat layers put them.
      const icon = icons.get(track.trackId);
      const at: LngLat = icon?.geometry.coordinates ?? track.head.lngLat;
      const heading =
        icon && icon.properties.bearing !== 0 ? icon.properties.bearing : track.head.bearingDeg;
      const metres = AHEAD_PX * metersPerPixel(state.camera.zoom, at[1]);
      const p = map.project(at);
      const q = map.project(liftedPoint(at, metres, heading));
      const rotationDeg = (Math.atan2(q.x - p.x, p.y - q.y) * 180) / Math.PI;
      point = { x: p.x, y: p.y, rotationDeg: (rotationDeg + 360) % 360 };
    }
    const inside =
      point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height;
    return {
      trackId: track.trackId,
      // From the map's reference pixels to the video's.
      x: point.x * scale,
      y: point.y * scale,
      rotationDeg: point.rotationDeg,
      visible: track.visible && inside,
    };
  });
}
