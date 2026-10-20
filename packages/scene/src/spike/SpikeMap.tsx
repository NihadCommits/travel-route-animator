import { sliceLineByProgress, type LngLat } from '@travel-route-animator/core';
import {
  OPENFREEMAP_ATTRIBUTION,
  OPENFREEMAP_LIBERTY_STYLE_URL,
} from '@travel-route-animator/styles';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState, type FC } from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import { createRenderMap } from '../stage/renderMap';
import { SALZBURG_TO_VIENNA } from './route';

export type SpikeMapProps = {
  projection: 'mercator' | 'globe';
};

type Camera = { center: LngLat; zoom: number };

const ROUTE_SOURCE = 'route';
const VEHICLE_SOURCE = 'vehicle';
const ROUTE_COLOR = '#E4572E';
const ROUTE_CENTER: LngLat = [14.71, 48.05];

// Flat: framed by hand for 1920×1080. Globe: zooms out from Austria to the whole globe while the
// line grows, which exercises tile loading at many zoom levels. Real camera modes come in M5.
function cameraAt(projection: SpikeMapProps['projection'], progress: number): Camera {
  if (projection === 'mercator') return { center: ROUTE_CENTER, zoom: 8.2 };
  return { center: ROUTE_CENTER, zoom: interpolate(progress, [0, 1], [6.5, 2.2]) };
}

function lineFeature(coordinates: LngLat[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };
}

function pointFeature(coordinates: LngLat) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates },
  };
}

export const SpikeMap: FC<SpikeMapProps> = ({ projection }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const { delayRender, continueRender, cancelRender } = useDelayRender();

  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  // Holds the first frame back until the style, the first tiles and our layers are ready.
  const [loadHandle] = useState(() => delayRender('Loading map style'));
  const loadPending = useRef(true);

  const progress = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    easing: Easing.bezier(0.65, 0, 0.35, 1), // ease-in-out cubic

    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const instance = createRenderMap({
      container,
      style: OPENFREEMAP_LIBERTY_STYLE_URL,
      ...cameraAt(projection, 0),
    });

    instance.on('style.load', () => {
      instance.setProjection({ type: projection });
    });

    instance.on('load', () => {
      const start = SALZBURG_TO_VIENNA[0]!;
      instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: lineFeature([start, start]) });
      instance.addSource(VEHICLE_SOURCE, { type: 'geojson', data: pointFeature(start) });
      instance.addLayer({
        id: 'route-casing',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 10 },
      });
      instance.addLayer({
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ROUTE_COLOR, 'line-width': 6 },
      });
      instance.addLayer({
        id: 'vehicle',
        type: 'circle',
        source: VEHICLE_SOURCE,
        paint: {
          'circle-radius': 9,
          'circle-color': ROUTE_COLOR,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      setMap(instance);
    });

    // Deliberately no map.remove() cleanup: the Remotion docs warn that it breaks rendering.
  }, [projection]);

  useEffect(() => {
    if (!map) return;

    const handle = delayRender(`Drawing frame ${frame}`);
    // Release the load handle only now, after this frame's handle exists, so Remotion never sees a
    // moment without a pending handle and screenshots an empty map.
    if (loadPending.current) {
      loadPending.current = false;
      continueRender(loadHandle);
    }

    const travelled = sliceLineByProgress(SALZBURG_TO_VIENNA, progress);
    const head = travelled.at(-1)!;
    map.jumpTo(cameraAt(projection, progress));

    Promise.all([
      map.getSource<GeoJSONSource>(ROUTE_SOURCE)?.setData(lineFeature(travelled)),
      map.getSource<GeoJSONSource>(VEHICLE_SOURCE)?.setData(pointFeature(head)),
    ])
      .then(() => {
        // 'idle' fires once all tiles for this camera and the new data are drawn. triggerRepaint
        // makes sure it fires even if nothing changed since the previous frame.
        map.once('idle', () => continueRender(handle));
        map.triggerRepaint();
      })
      .catch((error: unknown) => cancelRender(error));
  }, [map, frame, progress, projection, loadHandle, delayRender, continueRender, cancelRender]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0b1020' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, width, height }} />
      <div
        style={{
          position: 'absolute',
          right: 16,
          bottom: 12,
          padding: '4px 10px',
          borderRadius: 4,
          fontFamily: 'sans-serif',
          fontSize: 18,
          color: '#333333',
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
        }}
      >
        {OPENFREEMAP_ATTRIBUTION}
      </div>
    </AbsoluteFill>
  );
};
