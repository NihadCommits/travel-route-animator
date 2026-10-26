// Everything that touches MapLibre directly. The editor loads this module lazily, so the map
// library (about 1 MB) does not slow down the project overview, and tests can replace it.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { OPENFREEMAP_LIBERTY_STYLE_URL } from '@travel-route-animator/styles';
import type { LngLat } from '@travel-route-animator/core';
import type { EditablePoint, MapScene } from './mapData';

// MapLibre 6 finds its worker next to its own module via import.meta.url. Vite pre-bundles
// dependencies into another folder, so that lookup would miss. "?worker&url" makes Vite build
// the file as a worker and hand us its address; a plain "?url" would serve it as app code,
// with Vite's hot-reload client injected, which cannot run inside a worker.
setWorkerUrl(workerUrl);

export type { MapLibreMap };

const LINES = 'tra-lines';
const OTHER_POINTS = 'tra-other-points';
/** Invisible, wide copy of the active line: makes "click on the line" easy to hit. */
export const ACTIVE_LINE_HIT_LAYER = 'tra-lines-active-hit';

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

export function createEditMap(
  container: HTMLElement,
  view: { center: LngLat; zoom: number },
): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: OPENFREEMAP_LIBERTY_STYLE_URL,
    center: view.center,
    zoom: view.zoom,
    // The style's sources bring their credits (OpenFreeMap, OpenMapTiles, OpenStreetMap).
    attributionControl: { compact: true },
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  return map;
}

/** Our own sources and layers on top of the base map; call once the style has loaded. */
export function addSceneLayers(map: MapLibreMap): void {
  map.addSource(LINES, { type: 'geojson', data: EMPTY });
  map.addSource(OTHER_POINTS, { type: 'geojson', data: EMPTY });

  // A computed route is solid. Straight lines stand in, dashed, while the route is missing or
  // no longer fits the points. Separate layers because line-dasharray cannot depend on data.
  for (const active of [false, true]) {
    for (const routed of [true, false]) {
      map.addLayer({
        id: `tra-lines-${active ? 'active' : 'other'}${routed ? '' : '-draft'}`,
        type: 'line',
        source: LINES,
        filter: ['all', ['==', ['get', 'active'], active], ['==', ['get', 'routed'], routed]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': active ? 4 : 3,
          'line-opacity': active ? 1 : 0.45,
          ...(!routed && { 'line-dasharray': active ? [2, 1.5] : [2, 2] }),
        },
      });
    }
  }
  map.addLayer({
    id: ACTIVE_LINE_HIT_LAYER,
    type: 'line',
    source: LINES,
    filter: ['==', ['get', 'active'], true],
    paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 16 },
  });
  map.addLayer({
    id: 'tra-other-points',
    type: 'circle',
    source: OTHER_POINTS,
    paint: {
      'circle-radius': ['match', ['get', 'kind'], 'shape', 3, 5],
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
}

export function setSceneData(map: MapLibreMap, scene: MapScene): void {
  void map.getSource<GeoJSONSource>(LINES)?.setData(scene.lines);
  void map.getSource<GeoJSONSource>(OTHER_POINTS)?.setData(scene.otherPoints);
}

export interface PointMarkerState {
  point: EditablePoint;
  color: string;
  label: string;
  selected: boolean;
  draggable: boolean;
}

/**
 * A waypoint as on the list: a numbered dot for a stop, a small ring for a shape point. Drawn
 * into an inner element: the outer one belongs to MapLibre, which keeps its own classes on it
 * (maplibregl-marker, needed for positioning and for telling marker clicks from map clicks).
 */
function paintMarker(outer: HTMLElement, { point, color, label, selected }: PointMarkerState) {
  const dot = outer.firstElementChild as HTMLElement;
  const isStop = point.kind === 'stop';
  dot.className = [
    'flex items-center justify-center rounded-full border-2 text-[10px] font-semibold text-white shadow-md',
    isStop ? 'size-6' : 'size-3.5',
    selected ? 'ring-primary ring-2 ring-offset-1 ring-offset-transparent' : '',
  ].join(' ');
  dot.style.backgroundColor = isStop ? color : '#ffffff';
  dot.style.borderColor = isStop ? '#ffffff' : color;
  dot.textContent = isStop ? String(point.number) : '';
  outer.setAttribute('aria-label', label);
  outer.title = label;
}

export function createPointMarker(map: MapLibreMap, state: PointMarkerState): Marker {
  const outer = document.createElement('div');
  outer.setAttribute('role', 'img');
  outer.append(document.createElement('div'));
  paintMarker(outer, state);
  return new Marker({ element: outer, draggable: state.draggable })
    .setLngLat(state.point.lngLat)
    .addTo(map);
}

export function updatePointMarker(marker: Marker, state: PointMarkerState): void {
  paintMarker(marker.getElement(), state);
  marker.setDraggable(state.draggable);
  const [lng, lat] = state.point.lngLat;
  const current = marker.getLngLat();
  if (current.lng !== lng || current.lat !== lat) marker.setLngLat(state.point.lngLat);
}
