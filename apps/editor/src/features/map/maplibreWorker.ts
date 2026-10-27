import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 finds its worker next to its own module via import.meta.url. Vite pre-bundles
// dependencies into another folder, so that lookup would miss. "?worker&url" makes Vite build
// the file as a worker and hand us its address; a plain "?url" would serve it as app code,
// with Vite's hot-reload client injected, which cannot run inside a worker.
// Imported for its side effect by every module that creates a map: the edit map and the
// preview, whose scene code leaves the worker to its host (see packages/scene/src/index.ts).
setWorkerUrl(workerUrl);
