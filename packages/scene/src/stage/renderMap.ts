import { Map as MapLibreMap, setWorkerUrl, type MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre 6 looks for its worker next to its own module via import.meta.url, which the bundler
// rewrites to a file path. `new URL(..., import.meta.url)` makes webpack emit the worker as a local
// asset instead, so rendering never has to fetch MapLibre code from a CDN.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

export type RenderMapOptions = Pick<MapOptions, 'container' | 'style' | 'center' | 'zoom'>;

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
    // Keeps the drawn frame in the canvas until Remotion has taken its screenshot.
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
}
