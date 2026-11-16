import { ISO_NUMERIC_TO_ALPHA2 } from './isoCountries';
import type { LngLat } from './lngLat';

// Which country a point lies in, for the flag block (M17). Offline: the borders are Natural
// Earth's (1:50 million, public domain) as the world-atlas package ships them, a TopoJSON
// topology. Decoded once into plain rings with a bounding box each; a lookup then only tests
// the few countries whose box holds the point.

/** A TopoJSON topology as world-atlas ships it: quantized, delta-encoded arcs. */
export interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { type: string; geometries: TopoGeometry[] }>;
}

interface TopoGeometry {
  type: string;
  id?: string;
  properties?: { name?: string };
  arcs?: number[][] | number[][][];
}

type Ring = LngLat[];
type Polygon = Ring[];

interface Country {
  /** ISO 3166-1 alpha-2, lower case, e.g. "at". */
  code: string;
  bbox: [west: number, south: number, east: number, north: number];
  polygons: Polygon[];
}

export interface CountryIndex {
  countries: Country[];
}

/** Places Natural Earth draws without an ISO number, but with a flag of their own. */
const WITHOUT_NUMBER: Readonly<Record<string, string>> = { Kosovo: 'xk' };

/** The arcs as absolute coordinates: each arc starts from the transform, then adds deltas. */
function decodeArcs(topology: Topology): LngLat[][] {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx!;
      y += dy!;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as LngLat;
    });
  });
}

/** A ring from its arcs; a negative index (~i) runs arc i backwards. */
function ringOf(arcIndices: number[], arcs: LngLat[][]): Ring {
  const ring: Ring = [];
  for (const index of arcIndices) {
    const arc = index < 0 ? [...arcs[~index]!].reverse() : arcs[index]!;
    // Consecutive arcs share their joint; keep it once.
    ring.push(...(ring.length > 0 ? arc.slice(1) : arc));
  }
  return ring;
}

function bboxOf(polygons: Polygon[]): Country['bbox'] {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of polygons) {
    for (const [lng, lat] of polygon[0] ?? []) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return [west, south, east, north];
}

/** Decodes the countries of a topology once; places with no known flag are left out. */
export function indexCountries(topology: Topology, objectName = 'countries'): CountryIndex {
  const arcs = decodeArcs(topology);
  const countries: Country[] = [];
  for (const geometry of topology.objects[objectName]?.geometries ?? []) {
    const code =
      (geometry.id !== undefined ? ISO_NUMERIC_TO_ALPHA2[geometry.id] : undefined) ??
      WITHOUT_NUMBER[geometry.properties?.name ?? ''];
    if (!code || !geometry.arcs) continue;
    const polygons =
      geometry.type === 'Polygon'
        ? [(geometry.arcs as number[][]).map((ring) => ringOf(ring, arcs))]
        : geometry.type === 'MultiPolygon'
          ? (geometry.arcs as number[][][]).map((polygon) =>
              polygon.map((ring) => ringOf(ring, arcs)),
            )
          : [];
    if (polygons.length > 0) countries.push({ code, bbox: bboxOf(polygons), polygons });
  }
  return { countries };
}

/** Even-odd rule over all rings: inside the outer ring and in none of its holes. */
function inPolygon([x, y]: LngLat, polygon: Polygon): boolean {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const KM_PER_DEGREE = 111.32;

/** Roughly how far a point is from a ring's edge, in km; fine for the few km it is used for. */
function kmToRing([x, y]: LngLat, ring: Ring): number {
  // Degrees of longitude shrink towards the poles; scaled here, the plane is near enough.
  const k = Math.cos((y * Math.PI) / 180);
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1]!;
    const [bx, by] = ring[i]!;
    const [dx, dy] = [(bx - ax) * k, by - ay];
    const [px, py] = [(x - ax) * k, y - ay];
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / length));
    best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
  }
  return best * KM_PER_DEGREE;
}

function inBox([lng, lat]: LngLat, [west, south, east, north]: Country['bbox'], margin = 0) {
  return (
    lng >= west - margin && lng <= east + margin && lat >= south - margin && lat <= north + margin
  );
}

/**
 * The country a point lies in, as a lower-case ISO code. At this scale coasts are coarse: a
 * harbour, an estuary or a small country can lie "at sea", so a point within `nearKm` of a
 * coast counts for the nearest country. Further out at sea there is none.
 */
export function countryAt(index: CountryIndex, lngLat: LngLat, nearKm = 20): string | undefined {
  const inside = index.countries.find(
    ({ bbox, polygons }) =>
      inBox(lngLat, bbox) && polygons.some((polygon) => inPolygon(lngLat, polygon)),
  );
  if (inside) return inside.code;
  // A degree of latitude is the shortest a degree gets, so this margin covers nearKm anywhere
  // but near the poles, where nobody needs a flag.
  const margin = nearKm / KM_PER_DEGREE / Math.max(0.2, Math.cos((lngLat[1] * Math.PI) / 180));
  let nearest: { code: string; km: number } | undefined;
  for (const { code, bbox, polygons } of index.countries) {
    if (!inBox(lngLat, bbox, margin)) continue;
    for (const polygon of polygons) {
      const km = kmToRing(lngLat, polygon[0] ?? []);
      if (km <= nearKm && km < (nearest?.km ?? Infinity)) nearest = { code, km };
    }
  }
  return nearest?.code;
}
