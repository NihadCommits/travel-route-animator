import { Map as MapLibreMap, type MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type RenderMapOptions = Pick<
  MapOptions,
  'container' | 'style' | 'center' | 'zoom' | 'pitch' | 'bearing' | 'pixelRatio'
>;

/**
 * Creates a map that never moves or fades on its own. Remotion may render frames in any order,
 * so every change has to come from the current frame, applied with jumpTo/setData.
 */
export function createRenderMap(options: RenderMapOptions): MapLibreMap {
  return new MapLibreMap({
    ...options,
    interactive: false,
    fadeDuration: 0,
    attributionControl: false,
    // Tilted 3D views need room to look towards the horizon.
    maxPitch: 85,
    // preserveDrawingBuffer keeps the drawn frame in the canvas until Remotion has taken its
    // screenshot. antialias smooths the edges of the 3D plane; in the M8 spike it cost no
    // measurable render time.
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });
}
