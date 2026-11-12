import { flightStyleFor, type FrameState, type Timeline } from '@travel-route-animator/core';
import { OPENFREEMAP_LIBERTY_STYLE_URL } from '@travel-route-animator/styles';
import type { Map as MapLibreMap, SkySpecification } from 'maplibre-gl';
import { useEffect, useRef, useState, type FC } from 'react';
import { useBufferState, useDelayRender, useRemotionEnvironment } from 'remotion';
import { decodeImage, type DecodedImage, type StageImage } from '../vehicles/images';
import { drawings3d, modelOf } from './data3d';
import { sceneFeatures } from './features';
import type { Layer3d } from './layer3d';
import { addSceneLayers, addStageImages, loadVehicleIcons, setSceneFeatures } from './layers';
import type { ImageTimings } from './look';
import { createRenderMap } from './renderMap';

/** A thin atmosphere around the globe that fades out as the camera comes closer. */
const GLOBE_SKY: SkySpecification = {
  'sky-color': '#7fb8f0',
  'horizon-color': '#e8f2fc',
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0],
};

function applyProjection(map: MapLibreMap, projection: FrameState['projection']): void {
  if (map.getProjection()?.type !== projection) map.setProjection({ type: projection });
  map.setSky(projection === 'globe' ? GLOBE_SKY : { 'atmosphere-blend': 0 });
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
export const MapStage: FC<MapStageProps> = ({ timeline, state, images = NO_IMAGES }) => {
  const { isRendering } = useRemotionEnvironment();
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const buffer = useBufferState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Holds the first frame back until style, our layers and the vehicle icons are ready.
  const [loadHandle] = useState(() => delayRender('Loading the map'));
  const loadPending = useRef(true);
  // What the map is created with; later changes arrive through the effects below.
  const initial = useRef({ timeline, state, images });
  const layer3d = useRef<Layer3d | null>(null);
  // Decoded once per image; the frame picks a picture by the timings (never by a clock).
  const decoded = useRef(new Map<string, DecodedImage>());
  const [timings, setTimings] = useState<ImageTimings>(() => new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { timeline: first, state: firstState } = initial.current;
    // The preview pauses until the map can draw; created here and not in useState, because
    // React's strict mode runs state initialisers twice and one handle would never be freed.
    const playback = buffer.delayPlayback();
    const instance = createRenderMap({
      container,
      style: OPENFREEMAP_LIBERTY_STYLE_URL,
      center: firstState.camera.center,
      zoom: firstState.camera.zoom,
      pitch: firstState.camera.pitchDeg,
      bearing: firstState.camera.bearingDeg,
      pixelRatio: first.scale,
    });
    instance.on('style.load', () => applyProjection(instance, firstState.projection));
    instance.on('load', () => {
      addSceneLayers(instance);
      const models = needsLayer3d(first)
        ? ensureLayer3d(instance, layer3d, decoded.current)
        : Promise.resolve();
      Promise.all([
        models,
        loadVehicleIcons(instance, first),
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
    if (map) applyProjection(map, projection);
  }, [map, projection]);

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
    const drawn = setSceneFeatures(map, sceneFeatures(timeline, state, timings));
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
        map.once('idle', () => continueRender(handle));
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
  ]);

  // Outside rendering the load handle has no effect, but it must not stay open either.
  useEffect(() => {
    if (map && !isRendering && loadPending.current) {
      loadPending.current = false;
      continueRender(loadHandle);
    }
  }, [map, isRendering, loadHandle, continueRender]);

  const { viewport, scale } = timeline;
  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    />
  );
};
