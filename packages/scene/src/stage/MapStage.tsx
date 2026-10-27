import type { FrameState, Timeline } from '@travel-route-animator/core';
import { OPENFREEMAP_LIBERTY_STYLE_URL } from '@travel-route-animator/styles';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState, type FC } from 'react';
import { useDelayRender } from 'remotion';
import { sceneFeatures } from './features';
import { addSceneLayers, loadVehicleIcons, setSceneFeatures } from './layers';
import { createRenderMap } from './renderMap';

export interface MapStageProps {
  timeline: Timeline;
  state: FrameState;
}

/**
 * The one map of a composition (ARCHITEKTUR: Szene). It is created once; every frame then sets
 * the camera with jumpTo, hands the frame's lines and points to the map and holds the
 * screenshot back until the map is idle, so no half-loaded tiles end up in the video.
 *
 * The map lives in the reference size (1080 pixels on the short side) and draws `scale` times
 * sharper; a CSS scale stretches it to the video size. Zoom, line widths and text sizes thus
 * look the same at every resolution.
 *
 * In the editor's player (M6) waiting for idle on every frame would stall playback; that
 * switch belongs here, in one place.
 */
export const MapStage: FC<MapStageProps> = ({ timeline, state }) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Holds the first frame back until style, our layers and the vehicle icons are ready.
  const [loadHandle] = useState(() => delayRender('Loading the map'));
  const loadPending = useRef(true);
  // The first frame's camera, so the map starts where the video starts.
  const [initial] = useState(() => state);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const instance = createRenderMap({
      container,
      style: OPENFREEMAP_LIBERTY_STYLE_URL,
      center: initial.camera.center,
      zoom: initial.camera.zoom,
      pitch: initial.camera.pitchDeg,
      bearing: initial.camera.bearingDeg,
      pixelRatio: timeline.scale,
    });
    instance.on('style.load', () => instance.setProjection({ type: initial.projection }));
    instance.on('load', () => {
      addSceneLayers(instance);
      loadVehicleIcons(instance, timeline)
        .then(() => setMap(instance))
        .catch((error: unknown) => cancelRender(error));
    });
    instance.on('error', (event) => {
      // Missing tiles at the edge of the world are normal; a broken style is not.
      if (!instance.isStyleLoaded()) cancelRender(event.error);
    });
    // Deliberately no map.remove() cleanup: the Remotion docs warn that it breaks rendering.
  }, [timeline, initial, cancelRender]);

  useEffect(() => {
    if (!map) return;
    const handle = delayRender(`Drawing frame ${state.frame}`);
    // Release the load handle only now, after this frame's handle exists, so Remotion never sees
    // a moment without a pending handle and screenshots an empty map.
    if (loadPending.current) {
      loadPending.current = false;
      continueRender(loadHandle);
    }

    const { camera } = state;
    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      pitch: camera.pitchDeg,
      bearing: camera.bearingDeg,
    });
    setSceneFeatures(map, sceneFeatures(timeline, state))
      .then(() => {
        // 'idle' fires once all tiles for this camera and the new data are drawn. triggerRepaint
        // makes sure it fires even if nothing changed since the previous frame.
        map.once('idle', () => continueRender(handle));
        map.triggerRepaint();
      })
      .catch((error: unknown) => cancelRender(error));
  }, [map, timeline, state, loadHandle, delayRender, continueRender, cancelRender]);

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
