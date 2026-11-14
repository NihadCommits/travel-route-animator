import {
  flightStyleFor,
  MOTION_LOG_PREFIX,
  type FrameState,
  type MotionFrame,
  type Timeline,
} from '@travel-route-animator/core';
import { SATELLITE_MIX_LAYER } from '@travel-route-animator/styles';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState, type FC } from 'react';
import { useBufferState, useCurrentFrame, useDelayRender, useRemotionEnvironment } from 'remotion';
import { decodeImage, type DecodedImage, type StageImage } from '../vehicles/images';
import { drawings3d, modelOf } from './data3d';
import { sceneFeatures } from './features';
import type { Layer3d } from './layer3d';
import { addSceneLayers, addStageImages, loadVehicleIcons, setSceneFeatures } from './layers';
import type { ImageTimings } from './look';
import type { MapLook } from './mapLook';
import { measureMotion } from './motion';
import { createRenderMap } from './renderMap';

/**
 * A thin atmosphere around the globe in the theme's colours, fading out as the camera comes
 * closer; none on the flat map.
 */
function applyProjection(
  map: MapLibreMap,
  projection: FrameState['projection'],
  look: Pick<MapLook, 'sky' | 'transparent'>,
): void {
  if (map.getProjection()?.type !== projection) map.setProjection({ type: projection });
  if (look.transparent) {
    // An overlay has no sky, no fog and no atmosphere: everything around the lines stays clear.
    const clear = 'rgba(0, 0, 0, 0)';
    map.setSky({
      'sky-color': clear,
      'horizon-color': clear,
      'fog-color': clear,
      'atmosphere-blend': 0,
    });
    return;
  }
  map.setSky(
    projection === 'globe'
      ? {
          ...look.sky,
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0],
        }
      : { 'atmosphere-blend': 0 },
  );
}

/**
 * Whether the stage is tilted and has a flight or a vehicle with a model, which the 3D layer
 * draws (ADR 0007).
 */
function needsLayer3d(timeline: Timeline): boolean {
  return (
    timeline.tracks.some((plan) => plan.flight || modelOf(plan)) &&
    flightStyleFor(timeline.view.pitchDeg) === 'arc-3d'
  );
}

/**
 * Adds the 3D layer once a stage needs it. It is loaded on demand: three.js is by far the
 * largest part of it, and stages seen from straight above never use it.
 */
async function ensureLayer3d(
  map: MapLibreMap,
  layer: { current: Layer3d | null },
  images: ReadonlyMap<string, DecodedImage>,
): Promise<void> {
  if (layer.current) return;
  const { createLayer3d } = await import('./layer3d');
  if (layer.current) return;
  layer.current = createLayer3d();
  // The same map the images are decoded into, so the layer sees the ones still to come.
  layer.current.setImages(images);
  map.addLayer(layer.current);
}

/**
 * Decodes the stage's images the map does not have yet and adds their pictures to it
 * (ADR 0009). Returns how long the pictures of every decoded image show.
 */
async function loadStageImages(
  map: MapLibreMap,
  images: readonly StageImage[],
  decoded: Map<string, DecodedImage>,
): Promise<ImageTimings> {
  const missing = images.filter(({ asset }) => !decoded.has(asset.id));
  const loaded = await Promise.all(
    missing.map(async (image) => [image.asset.id, await decodeImage(image)] as const),
  );
  for (const [id, image] of loaded) decoded.set(id, image);
  addStageImages(map, decoded);
  return new Map([...decoded].map(([id, { durationsMs }]) => [id, durationsMs]));
}

export interface MapStageProps {
  timeline: Timeline;
  state: FrameState;
  /** Own images of the stage's vehicles (ADR 0009). */
  images?: readonly StageImage[];
  /** The style and its sky; a new look needs a new MapStage (give it the look's key). */
  look: MapLook;
  /**
   * Every stage this map will show (a sequence, ADR 0011): their icons and 3D layer are loaded
   * before the first frame. Missing: only `timeline`.
   */
  preload?: readonly Timeline[];
  /**
   * While rendering: report where every vehicle is once the frame is drawn, as a console line
   * the render collects (M13: motion data for After Effects and Premiere).
   */
  reportMotion?: boolean;
}

const NO_IMAGES: readonly StageImage[] = [];

/**
 * The one map of a composition (ARCHITEKTUR: Szene). It is created once; every frame then sets
 * the camera with jumpTo and hands the frame's lines and points to the map.
 *
 * - **Rendering** holds Remotion's screenshot back until the map is idle, so no half-loaded
 *   tiles end up in the video.
 * - **Player and Studio** (the editor's preview) wait only for the first load, through
 *   useBufferState: delayRender does nothing there, and waiting on every frame would stall
 *   playback. Tiles may come in a moment late while playing, as in any map app.
 *
 * The map lives in the reference size (1080 pixels on the short side) and draws `scale` times
 * sharper; a CSS scale stretches it to the picture. Zoom, line widths and text sizes thus look
 * the same at every resolution, and a half-resolution preview only draws a quarter of the
 * pixels.
 */
export const MapStage: FC<MapStageProps> = ({
  timeline,
  state,
  images = NO_IMAGES,
  look,
  preload,
  reportMotion = false,
}) => {
  const { isRendering } = useRemotionEnvironment();
  // The video's frame; in a sequence the stage's own frame state counts from its start.
  const videoFrame = useCurrentFrame();
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const buffer = useBufferState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Holds the first frame back until style, our layers and the vehicle icons are ready.
  const [loadHandle] = useState(() => delayRender('Loading the map'));
  const loadPending = useRef(true);
  // What the map is created with; later changes arrive through the effects below.
  const initial = useRef({ timeline, state, images, look, preload: preload ?? [timeline] });
  const layer3d = useRef<Layer3d | null>(null);
  // Decoded once per image; the frame picks a picture by the timings (never by a clock).
  const decoded = useRef(new Map<string, DecodedImage>());
  const [timings, setTimings] = useState<ImageTimings>(() => new Map());
  // Preview only: open pins the camera does not show (ADR 0014), with where to point. Worked
  // out after each repaint of the map, from the frame it last drew.
  const [outside, setOutside] = useState<OutsidePin[]>([]);
  const frameRef = useRef({ timeline, state });
  useEffect(() => {
    if (!map || isRendering) return;
    const update = () => {
      const next = pinsOutside(map, frameRef.current.timeline, frameRef.current.state);
      setOutside((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    map.on('render', update);
    return () => {
      map.off('render', update);
    };
  }, [map, isRendering]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { timeline: first, state: firstState, look: firstLook } = initial.current;
    // The preview pauses until the map can draw; created here and not in useState, because
    // React's strict mode runs state initialisers twice and one handle would never be freed.
    const playback = buffer.delayPlayback();
    const instance = createRenderMap({
      container,
      style: firstLook.style,
      center: firstState.camera.center,
      zoom: firstState.camera.zoom,
      pitch: firstState.camera.pitchDeg,
      bearing: firstState.camera.bearingDeg,
      pixelRatio: first.scale,
      // The walls at the edges of terrain tiles hide gaps between zoom levels. With no map
      // around them (an overlay) they would show as grey strokes below every line.
      terrainSkirtLength: firstLook.transparent ? 'none' : 'auto',
    });
    instance.on('style.load', () => applyProjection(instance, firstState.projection, firstLook));
    instance.on('load', () => {
      addSceneLayers(instance);
      const all = initial.current.preload;
      const models = all.some(needsLayer3d)
        ? ensureLayer3d(instance, layer3d, decoded.current)
        : Promise.resolve();
      Promise.all([
        models,
        Promise.all(all.map((each) => loadVehicleIcons(instance, each))),
        loadStageImages(instance, initial.current.images, decoded.current),
      ])
        .then(([, , imageTimings]) => {
          setTimings(imageTimings);
          setMap(instance);
          playback.unblock();
        })
        .catch((error: unknown) => cancelRender(error));
    });
    instance.on('error', (event) => {
      // Missing tiles at the edge of the world are normal; a broken style is not.
      if (!instance.isStyleLoaded()) cancelRender(event.error);
    });
    return () => {
      playback.unblock();
      // While rendering, Remotion warns that map.remove() breaks the render lifecycle; the
      // render's page is thrown away anyway. In the editor's preview the map has to go when
      // the preview closes, or every switch to the preview would leave a WebGL context behind.
      if (!isRendering) instance.remove();
    };
  }, [buffer, cancelRender, isRendering]);

  // New vehicles or colours in the editor need their icons; already loaded ones are skipped.
  // The same for the 3D layer, once the stage gets tilted or a vehicle with a model.
  useEffect(() => {
    if (!map) return;
    loadVehicleIcons(map, timeline).catch((error: unknown) => cancelRender(error));
    if (needsLayer3d(timeline)) {
      ensureLayer3d(map, layer3d, decoded.current)
        .then(() => map.triggerRepaint())
        .catch((error: unknown) => cancelRender(error));
    }
  }, [map, timeline, cancelRender]);

  // An image chosen in the editor is decoded once and then drawn from the next frame on.
  useEffect(() => {
    if (!map) return;
    loadStageImages(map, images, decoded.current)
      .then(setTimings)
      .catch((error: unknown) => cancelRender(error));
  }, [map, images, cancelRender]);

  // Switching the view between flat map and globe in the editor.
  const { projection } = state;
  useEffect(() => {
    if (map) applyProjection(map, projection, look);
  }, [map, projection, look]);

  // Switching the preview between half and full resolution.
  useEffect(() => {
    if (map && map.getPixelRatio() !== timeline.scale) map.setPixelRatio(timeline.scale);
  }, [map, timeline.scale]);

  useEffect(() => {
    if (!map) return;
    const { camera } = state;
    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      pitch: camera.pitchDeg,
      bearing: camera.bearingDeg,
    });
    layer3d.current?.setDrawings(drawings3d(timeline, state, timings));
    frameRef.current = { timeline, state };
    // The satellite picture a dive-in fades in, by the frame's share (M11).
    if (map.getLayer(SATELLITE_MIX_LAYER)) {
      map.setPaintProperty(SATELLITE_MIX_LAYER, 'raster-opacity', state.effects.satelliteMix);
    }
    const features = sceneFeatures(timeline, state, timings);
    const drawn = setSceneFeatures(map, features);
    if (!isRendering) {
      drawn.catch((error: unknown) => cancelRender(error));
      return;
    }

    const handle = delayRender(`Drawing frame ${state.frame}`);
    // Release the load handle only now, after this frame's handle exists, so Remotion never sees
    // a moment without a pending handle and screenshots an empty map.
    if (loadPending.current) {
      loadPending.current = false;
      continueRender(loadHandle);
    }
    drawn
      .then(() => {
        // 'idle' fires once all tiles for this camera and the new data are drawn. triggerRepaint
        // makes sure it fires even if nothing changed since the previous frame.
        map.once('idle', () => {
          if (reportMotion) {
            const report: MotionFrame = {
              frame: videoFrame,
              tracks: measureMotion(map, timeline, state, features, layer3d.current),
            };
            console.log(MOTION_LOG_PREFIX + JSON.stringify(report));
          }
          continueRender(handle);
        });
        map.triggerRepaint();
      })
      .catch((error: unknown) => cancelRender(error));
  }, [
    map,
    timeline,
    state,
    timings,
    isRendering,
    loadHandle,
    delayRender,
    continueRender,
    cancelRender,
    reportMotion,
    videoFrame,
  ]);

  // Outside rendering the load handle has no effect, but it must not stay open either.
  useEffect(() => {
    if (map && !isRendering && loadPending.current) {
      loadPending.current = false;
      continueRender(loadHandle);
    }
  }, [map, isRendering, loadHandle, continueRender]);

  const { viewport, scale } = timeline;
  const frame = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: viewport.width,
    height: viewport.height,
    transform: scale === 1 ? undefined : `scale(${scale})`,
    transformOrigin: 'top left',
  } as const;
  return (
    <>
      <div
        ref={containerRef}
        style={{
          ...frame,
          // The blur of a dive-in's end (M11), in reference pixels like everything here.
          filter: state.effects.blur > 0 ? `blur(${state.effects.blur}px)` : undefined,
        }}
      />
      {outside.length > 0 && (
        <div style={{ ...frame, pointerEvents: 'none' }}>
          {outside.map((pin) => (
            <div
              key={pin.pinId}
              style={{
                position: 'absolute',
                left: pin.x,
                top: pin.y,
                transform: 'translate(-50%, -50%)',
                padding: '6px 14px',
                borderRadius: 999,
                background: '#dc2626',
                color: '#ffffff',
                font: '600 22px "Segoe UI", "Noto Sans", Arial, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ display: 'inline-block', transform: `rotate(${pin.angleDeg}deg)` }}>
                ➜
              </span>{' '}
              ⚠ {pin.title}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

interface OutsidePin {
  pinId: string;
  title: string;
  /** Where the badge sits, at the edge towards the pin, in reference pixels. */
  x: number;
  y: number;
  /** The arrow's direction, clockwise from pointing right. */
  angleDeg: number;
}

/** How far in from the edge the badge of a pin outside the picture sits. */
const EDGE_PX = 70;

/**
 * Open pins that lie outside the picture (ADR 0014): in a video they would pop up with no map
 * under them. The preview points at them from the edge instead; a render never shows this.
 */
function pinsOutside(map: MapLibreMap, timeline: Timeline, state: FrameState): OutsidePin[] {
  const { width, height } = timeline.viewport;
  return state.pins.flatMap((pin) => {
    const { x, y } = map.project(pin.lngLat);
    if (x >= 0 && y >= 0 && x <= width && y <= height) return [];
    const cx = width / 2;
    const cy = height / 2;
    const angle = Math.atan2(y - cy, x - cx);
    // Along the line from the middle towards the pin, stopped just inside the edge.
    const reach = Math.min(
      (width / 2 - EDGE_PX) / Math.max(1e-6, Math.abs(Math.cos(angle))),
      (height / 2 - EDGE_PX) / Math.max(1e-6, Math.abs(Math.sin(angle))),
    );
    return [
      {
        pinId: pin.pinId,
        title: pin.title,
        x: cx + Math.cos(angle) * reach,
        y: cy + Math.sin(angle) * reach,
        angleDeg: (angle * 180) / Math.PI,
      },
    ];
  });
}
