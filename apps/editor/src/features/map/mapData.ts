import {
  isRouteStale,
  locateItem,
  unwrapLongitudes,
  type Etappe,
  type Id,
  type LngLat,
  type Project,
  type Track,
  type WaypointKind,
} from '@travel-route-animator/core';

// What the edit map shows, as plain data. The map component only hands this to MapLibre, so
// everything that decides what is drawn is testable without WebGL.

/** A GeoJSON feature in the few shapes we draw; structurally what MapLibre's setData takes. */
export interface LineFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: LngLat[] };
  /** routed: the computed route; otherwise straight lines while it is missing or stale. */
  properties: { trackId: Id; color: string; active: boolean; routed: boolean };
}

export interface PointFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: LngLat };
  properties: { trackId: Id; waypointId: Id; color: string; kind: WaypointKind };
}

export interface FeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
}

/** A draggable point of the track being edited. */
export interface EditablePoint {
  waypointId: Id;
  lngLat: LngLat;
  kind: WaypointKind;
  /** 1-based number among the stops, as in the waypoint list. */
  number: number;
}

export type MapFit =
  { kind: 'bounds'; southWest: LngLat; northEast: LngLat } | { kind: 'point'; lngLat: LngLat };

/** The line drawn for a track, with where each leg (waypoint i → i + 1) starts in it. */
export interface DrawnLine {
  /** Unwrapped (see unwrapLongitudes), so flights over the date line are drawn in one piece. */
  coordinates: LngLat[];
  routed: boolean;
  legs: { startIndex: number }[];
}

export interface MapScene {
  /** The stage whose tracks are shown; undefined for a project or group selection. */
  etappeId: Id | undefined;
  /** The track whose points can be dragged, if a track is selected. */
  activeTrack: Track | undefined;
  /** The routes of the stage, the active track last. */
  lines: FeatureCollection<LineFeature>;
  /** The line of the active track, for clicks on it. */
  activeLine: DrawnLine | undefined;
  /** Points of the other tracks of the stage, drawn small and not draggable. */
  otherPoints: FeatureCollection<PointFeature>;
  editablePoints: EditablePoint[];
  /** What the map should show when the selection changes. */
  fit: MapFit | undefined;
}

const collection = <F>(features: F[]): FeatureCollection<F> => ({
  type: 'FeatureCollection',
  features,
});

/**
 * The computed route when it fits the waypoints; otherwise straight lines through them, which
 * the map draws dashed until the route is there (road routes come from the server).
 */
export function drawnLineOf(track: Track): DrawnLine | undefined {
  if (track.waypoints.length < 2) return undefined;
  if (track.computed && !isRouteStale(track)) {
    return {
      coordinates: unwrapLongitudes(track.computed.geometry),
      routed: true,
      legs: track.computed.legs,
    };
  }
  return {
    coordinates: unwrapLongitudes(track.waypoints.map((w) => w.lngLat)),
    routed: false,
    legs: track.waypoints.slice(1).map((_, startIndex) => ({ startIndex })),
  };
}

function lineOf(track: Track, line: DrawnLine | undefined, active: boolean): LineFeature[] {
  if (!line) return [];
  return [
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: line.coordinates },
      properties: { trackId: track.id, color: track.style.lineColor, active, routed: line.routed },
    },
  ];
}

/**
 * Whole turns to add to a line's longitudes to bring it next to `lng`. MapLibre repeats the
 * world side by side; an unwrapped flight over the Pacific (139° → 242°) may be on screen in
 * the copy to the left (−221° → −118°), where the user clicked.
 */
export function worldCopyShift(line: readonly LngLat[], lng: number): number {
  let west = Infinity;
  let east = -Infinity;
  for (const [x] of line) {
    west = Math.min(west, x);
    east = Math.max(east, x);
  }
  if (west > east) return 0;
  return 360 * Math.round((lng - (west + east) / 2) / 360);
}

/** The smallest box around the points, or the point itself when there is only one place. */
export function fitFor(points: readonly LngLat[]): MapFit | undefined {
  const [first] = points;
  if (!first) return undefined;
  let [west, south] = first;
  let [east, north] = first;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  if (west === east && south === north) return { kind: 'point', lngLat: first };
  return { kind: 'bounds', southWest: [west, south], northEast: [east, north] };
}

function etappeOf(project: Project, selectedId: Id | null): { etappe?: Etappe; track?: Track } {
  const location = selectedId === null ? undefined : locateItem(project, selectedId);
  if (location?.kind !== 'etappe' && location?.kind !== 'track') return {};
  const etappe = project.groups[location.groupIndex]!.etappen[location.etappeIndex]!;
  return location.kind === 'track'
    ? { etappe, track: etappe.tracks[location.trackIndex]! }
    : { etappe };
}

/**
 * The stage around the selection: a selected track is edited (its points can be dragged and
 * it is drawn on top), the other tracks of the stage stay visible but faint for orientation.
 */
export function buildMapScene(project: Project, selectedId: Id | null): MapScene {
  const { etappe, track: activeTrack } = etappeOf(project, selectedId);
  const tracks = etappe?.tracks ?? [];
  const others = tracks.filter((track) => track !== activeTrack);

  let stops = 0;
  const editablePoints = (activeTrack?.waypoints ?? []).map((waypoint) => ({
    waypointId: waypoint.id,
    lngLat: waypoint.lngLat,
    kind: waypoint.kind,
    number: waypoint.kind === 'stop' ? ++stops : stops,
  }));

  const drawn = new Map(tracks.map((track) => [track, drawnLineOf(track)]));
  const activeLine = activeTrack && drawn.get(activeTrack);
  // Fit to the drawn lines, not just the points: a flight arcs north of both airports, and
  // over the Pacific only the unwrapped line knows which way round to look.
  const fitPoints = (activeTrack ? [activeTrack] : tracks).flatMap(
    (track) => drawn.get(track)?.coordinates ?? track.waypoints.map((w) => w.lngLat),
  );

  return {
    etappeId: etappe?.id,
    activeTrack,
    // The active track last, so its line lies on top.
    lines: collection([
      ...others.flatMap((track) => lineOf(track, drawn.get(track), false)),
      ...(activeTrack ? lineOf(activeTrack, activeLine, true) : []),
    ]),
    activeLine,
    otherPoints: collection(
      others.flatMap((track) =>
        track.waypoints.map((waypoint): PointFeature => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: waypoint.lngLat },
          properties: {
            trackId: track.id,
            waypointId: waypoint.id,
            color: track.style.lineColor,
            kind: waypoint.kind,
          },
        })),
      ),
    ),
    editablePoints,
    fit: fitFor(fitPoints),
  };
}
