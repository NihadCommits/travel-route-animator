import {
  addWaypoint,
  closestSegment,
  editWaypoint,
  insertShapePoint,
  legIndexAtSegment,
  locateItem,
  type Id,
  type LngLat,
  type Point2,
  type Project,
} from '@travel-route-animator/core';
import { Crosshair } from 'lucide-react';
import type { Marker } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';
import { api } from '@/lib/api';
import { selectProject, useEditor, useEditorStore } from '@/state/editorStore';
import { buildMapScene, worldCopyShift, type MapFit } from './mapData';
import type { MapLibreMap } from './maplibre';
import { suggestWaypointName } from './suggestName';

type MapModule = typeof import('./maplibre');

/** Europe, where most of the trips start; replaced by the trip as soon as something is selected. */
const START_VIEW = { center: [10, 50] as LngLat, zoom: 3.5 };
// More room at the top, where the "Punkt auf Karte setzen" button sits over the map.
const FIT_PADDING = { top: 70, right: 50, bottom: 40, left: 40 };
const SINGLE_POINT_ZOOM = 11;
const FOCUS_ZOOM = 12;

const toLngLat = ({ lng, lat }: { lng: number; lat: number }): LngLat => [lng, lat];

function waypointOf(project: Project, trackId: Id, waypointId: Id) {
  const location = locateItem(project, trackId);
  if (location?.kind !== 'track') return undefined;
  const { groupIndex, etappeIndex, trackIndex } = location;
  const track = project.groups[groupIndex]!.etappen[etappeIndex]!.tracks[trackIndex]!;
  return track.waypoints.find((waypoint) => waypoint.id === waypointId);
}

function fitMap(map: MapLibreMap, fit: MapFit) {
  // Animated on purpose: the editor may move smoothly, only the renderer must not (ARCHITEKTUR).
  if (fit.kind === 'point') map.easeTo({ center: fit.lngLat, zoom: SINGLE_POINT_ZOOM });
  else map.fitBounds([fit.southWest, fit.northEast], { padding: FIT_PADDING, maxZoom: 13 });
}

/**
 * The interactive map in the middle (M3b): shows the stage around the selection, lets the
 * points of the selected track be dragged, set by clicking ("Punkt auf Karte setzen") and
 * added as shape points by clicking onto the line. Every change goes through the store, so
 * undo, autosave and the inspector see it like any other edit.
 */
export function EditMap() {
  const store = useEditorStore();
  const project = useEditor(selectProject);
  const selectedId = useEditor((state) => state.selectedId);
  const selectedWaypointId = useEditor((state) => state.selectedWaypointId);
  const mapTool = useEditor((state) => state.mapTool);
  const mapFocus = useEditor((state) => state.mapFocus);
  const setMapTool = useEditor((state) => state.setMapTool);

  const scene = useMemo(() => buildMapScene(project, selectedId), [project, selectedId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef(new Map<Id, Marker>());
  const [loaded, setLoaded] = useState<{ map: MapLibreMap; maplibre: MapModule } | null>(null);
  const [failed, setFailed] = useState(false);

  // Create the map once. MapLibre needs WebGL; without it (old hardware, tests) the editor
  // keeps working and says why the map is missing.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    const markers = markersRef.current;
    void import('./maplibre')
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;
        const view = store.getState().mapView ?? START_VIEW;
        map = maplibre.createEditMap(containerRef.current, view);
        const created = map;
        // 'style.load', not 'load': our sources and layers only need the style, while 'load'
        // also waits for every first tile and font, which took 8 to 13 seconds in tests.
        created.once('style.load', () => {
          maplibre.addSceneLayers(created);
          setLoaded({ map: created, maplibre });
        });
        created.on('moveend', () =>
          store
            .getState()
            .setMapView({ center: toLngLat(created.getCenter()), zoom: created.getZoom() }),
        );
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      map?.remove();
      setLoaded(null);
    };
  }, [store]);

  // Lines and the faint points of the other tracks.
  useEffect(() => {
    if (loaded) loaded.maplibre.setSceneData(loaded.map, scene);
  }, [loaded, scene]);

  // Show the trip when the selection changes, not on every edit: dragging a point must not
  // pull the map away under the pointer.
  useEffect(() => {
    if (!loaded) return;
    const { history, selectedId: id } = store.getState();
    const { fit } = buildMapScene(history.present, id);
    if (fit) fitMap(loaded.map, fit);
  }, [loaded, selectedId, store]);

  // "Auf Karte zeigen" from the waypoint list.
  useEffect(() => {
    if (!loaded || !mapFocus) return;
    loaded.map.easeTo({
      center: mapFocus.lngLat,
      zoom: Math.max(loaded.map.getZoom(), FOCUS_ZOOM),
    });
  }, [loaded, mapFocus]);

  // The draggable points of the selected track, kept in sync with the project.
  const activeTrack = scene.activeTrack;
  useEffect(() => {
    if (!loaded || !activeTrack) return;
    const markers = markersRef.current;
    const seen = new Set<Id>();
    for (const point of scene.editablePoints) {
      seen.add(point.waypointId);
      const waypoint = activeTrack.waypoints.find((w) => w.id === point.waypointId);
      const state = {
        point,
        color: activeTrack.style.lineColor,
        label: waypoint?.name || de.waypoints.unnamedShape,
        selected: point.waypointId === selectedWaypointId,
        draggable: mapTool === 'select',
      };
      const existing = markers.get(point.waypointId);
      if (existing) {
        loaded.maplibre.updatePointMarker(existing, state);
        continue;
      }
      const marker = loaded.maplibre.createPointMarker(loaded.map, state);
      const waypointId = point.waypointId;
      const trackId = activeTrack.id;
      marker
        .getElement()
        .addEventListener('click', () => store.getState().selectWaypoint(waypointId));
      marker.on('dragend', () => {
        const lngLat = toLngLat(marker.getLngLat().wrap());
        const { applyIfValid, selectWaypoint } = store.getState();
        applyIfValid((p) => editWaypoint(p, trackId, waypointId, (w) => ({ ...w, lngLat })));
        selectWaypoint(waypointId);
      });
      markers.set(waypointId, marker);
    }
    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
  }, [loaded, activeTrack, scene.editablePoints, selectedWaypointId, mapTool, store]);

  // Markers of a track that is no longer selected go away.
  useEffect(() => {
    if (activeTrack) return;
    for (const marker of markersRef.current.values()) marker.remove();
    markersRef.current.clear();
  }, [activeTrack]);

  // Clicks on the map: set a point, or insert a shape point when the line is hit.
  useEffect(() => {
    if (!loaded) return;
    const { map, maplibre } = loaded;
    map.getCanvas().style.cursor = mapTool === 'add-point' ? 'crosshair' : '';

    const subscription = map.on('click', (event) => {
      // A click on a marker reaches the map too; the marker has handled it already.
      if ((event.originalEvent.target as Element | null)?.closest('.maplibregl-marker')) return;
      const { history, selectedId: id, applyIfValid, selectWaypoint } = store.getState();
      const { activeTrack: track, activeLine } = buildMapScene(history.present, id);
      if (!track) return;
      const lngLat = toLngLat(event.lngLat.wrap());

      if (store.getState().mapTool === 'add-point') {
        const name = de.map.newPoint(track.waypoints.length + 1);
        const added = addWaypoint(history.present, track.id, {
          lngLat,
          name,
          source: 'map-click',
        });
        // The name suggestion arrives later and joins this undo step (see history.ts).
        const coalesceKey = `placed:${added.id}`;
        if (applyIfValid(() => added.project, { coalesceKey }).length > 0) return;
        selectWaypoint(added.id);
        void api
          .reversePlace(lngLat)
          .then(({ place }) => {
            const suggestion = place && suggestWaypointName(place);
            if (!suggestion) return;
            store.getState().applyIfValid(
              (p) => {
                // Renamed or removed in the meantime: the user's choice wins.
                if (waypointOf(p, track.id, added.id)?.name !== name) return p;
                return editWaypoint(p, track.id, added.id, (w) => ({ ...w, name: suggestion }));
              },
              { coalesceKey, coalesceWindowMs: Infinity },
            );
          })
          // Without a suggestion the point keeps "Punkt 3"; it can be renamed in the list.
          .catch(() => undefined);
        return;
      }

      const onLine = map.queryRenderedFeatures(event.point, {
        layers: [maplibre.ACTIVE_LINE_HIT_LAYER],
      });
      if (onLine.length === 0 || !activeLine) {
        selectWaypoint(null);
        return;
      }
      // Find the segment in screen pixels: "close to the line" means what the user sees. The
      // drawn line may be a route with many points; its legs say between which waypoints.
      const shift = worldCopyShift(activeLine.coordinates, event.lngLat.lng);
      const pixels = activeLine.coordinates.map(([lng, lat]): Point2 => {
        const { x, y } = map.project([lng + shift, lat]);
        return [x, y];
      });
      const hit = closestSegment(pixels, [event.point.x, event.point.y]);
      if (!hit) return;
      const leg = legIndexAtSegment(activeLine, hit.index);
      const inserted = insertShapePoint(history.present, track.id, leg, lngLat);
      if (applyIfValid(() => inserted.project).length === 0) selectWaypoint(inserted.id);
    });
    return () => subscription.unsubscribe();
  }, [loaded, mapTool, store]);

  // Escape ends "set a point", wherever the focus is.
  useEffect(() => {
    if (mapTool !== 'add-point') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMapTool('select');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mapTool, setMapTool]);

  return (
    <section aria-label={de.map.label} className="relative h-full">
      {/* Sized by width and height, not by absolute positioning: MapLibre's CSS makes the map
          container position: relative, which would leave an absolute inset-0 box 0 px high. */}
      <div ref={containerRef} className="h-full w-full" />
      {failed ? (
        <p className="text-muted-foreground absolute inset-0 flex items-center justify-center p-6 text-center">
          {de.map.unavailable}
        </p>
      ) : !loaded ? (
        <p className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center">
          {de.map.loading}
        </p>
      ) : null}
      {loaded && (
        <div className="absolute top-2 left-2 flex max-w-[70%] flex-col items-start gap-1.5">
          {activeTrack ? (
            <Button
              size="sm"
              variant={mapTool === 'add-point' ? 'default' : 'secondary'}
              aria-pressed={mapTool === 'add-point'}
              onClick={() => setMapTool(mapTool === 'add-point' ? 'select' : 'add-point')}
            >
              <Crosshair /> {mapTool === 'add-point' ? de.map.done : de.map.addPoint}
            </Button>
          ) : (
            <p className="bg-card/90 rounded-md px-2 py-1 text-xs">{de.map.pickTrack}</p>
          )}
          {activeTrack && mapTool === 'add-point' && (
            <p className="bg-card/90 text-muted-foreground rounded-md px-2 py-1 text-xs">
              {de.map.addPointHint}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
