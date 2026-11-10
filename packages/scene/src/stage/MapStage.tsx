import { flightStyleFor, type FrameState, type Timeline } from '@travel-route-animator/core';
import { OPENFREEMAP_LIBERTY_STYLE_URL } from '@travel-route-animator/styles';
import type { Map as MapLibreMap, SkySpecification } from 'maplibre-gl';
import { useEffect, useRef, useState, type FC } from 'react';
import { useBufferState, useDelayRender, useRemotionEnvironment } from 'remotion';
import { sceneFeatures } from './features';
import { flightDrawings } from './flightData';
import type { FlightLayer } from './flightLayer';
import { addSceneLayers, loadVehicleIcons, setSceneFeatures } from './layers';
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

/** Whether the stage shows a flight in a tilted view, which the 3D layer draws (ADR 0007). */
function needsFlightLayer(timeline: Timeline): boolean {
  return (
    timeline.tracks.some((plan) => plan.flight) &&
    flightStyleFor(timeline.view.pitchDeg) === 'arc-3d'
  );
}

/**
 * Adds the 3D layer for flights once a stage needs it. It is loaded on demand: three.js is
 * by far the largest part of it, and most stages have no flight.
 */
async function ensureFlightLayer(
  map: MapLibreMap,
  layer: { current: FlightLayer | null },
): Promise<void> {
  if (layer.current) return;
  const { createFlightLayer } = await import('./flightLayer');
  if (layer.current) return;
  layer.current = createFlightLayer();
  map.addLayer(layer.current);
}

export interface MapStageProps {
  timeline: Timeline;
  state: FrameState;
}

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
export const MapStage: FC<MapStageProps> = ({ timeline, state }) => {
  const { isRendering } = useRemotionEnvironment();
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const buffer = useBufferState();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Holds the first frame back until style, our layers and the vehicle icons are ready.
  const [loadHandle] = useState(() => delayRender('Loading the map'));
  const loadPending = useRef(true);
  // What the map is created with; later changes arrive through the effects below.
  const initial = useRef({ timeline, state });
  const flightLayer = useRef<FlightLayer | null>(null);

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
      const flights = needsFlightLayer(first)
        ? ensureFlightLayer(instance, flightLayer)
        : Promise.resolve();
      Promise.all([flights, loadVehicleIcons(instance, initial.current.timeline)])
        .then(() => {
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
  // The same for the 3D layer, once the stage gets a flight in a tilted view.
  useEffect(() => {
    if (!map) return;
    loadVehicleIcons(map, timeline).catch((error: unknown) => cancelRender(error));
    if (needsFlightLayer(timeline)) {
      ensureFlightLayer(map, flightLayer)
        .then(() => map.triggerRepaint())
        .catch((error: unknown) => cancelRender(error));
    }
  }, [map, timeline, cancelRender]);

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
    flightLayer.current?.setDrawings(flightDrawings(timeline, state));
    const drawn = setSceneFeatures(map, sceneFeatures(timeline, state));
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
  }, [map, timeline, state, isRendering, loadHandle, delayRender, continueRender, cancelRender]);

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
