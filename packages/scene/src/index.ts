// The Remotion entry: Remotion Studio, the render script and later the server bundle this file
// with webpack. The editor imports the compositions through public.ts instead.
import { setWorkerUrl } from 'maplibre-gl';
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

// MapLibre 6 looks for its worker next to its own module via import.meta.url, which webpack
// rewrites to a file path. `new URL(..., import.meta.url)` makes webpack emit the worker as a
// local asset instead, so rendering never has to fetch MapLibre code from a CDN. The editor
// (Vite) cannot resolve this form for a package in node_modules and sets its own worker URL.
setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);

registerRoot(RemotionRoot);
