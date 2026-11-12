import { nanoid } from 'nanoid';
import type { LngLat } from '../geo/lngLat';
import {
  DEFAULT_ETAPPE_DURATION_SEC,
  defaultFlightOptions,
  defaultOverlays,
  defaultProjectSettings,
  defaultTrackStyle,
  defaultView,
} from './defaults';
import type { VehicleType, WaypointKind, WaypointSource } from './enums';
import type { CameraSettings, Etappe } from './etappe';
import type { Id } from './primitives';
import { CURRENT_SCHEMA_VERSION, type Group, type Project } from './project';
import type { Track, Waypoint } from './track';
import { recommendViewMode, VEHICLE_CATALOG } from './vehicles';

/**
 * Where new IDs and timestamps come from. Injected so tests get predictable values;
 * the default uses nanoid and the system clock (never used inside the renderer).
 */
export interface FactoryContext {
  createId: (prefix: string) => Id;
  now: () => string;
}

export const defaultFactoryContext: FactoryContext = {
  createId: (prefix) => `${prefix}_${nanoid(12)}`,
  now: () => new Date().toISOString(),
};

export function createProject(name: string, ctx = defaultFactoryContext): Project {
  const timestamp = ctx.now();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: ctx.createId('p'),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    defaults: defaultProjectSettings(),
    groups: [],
    assets: [],
  };
}

export function createGroup(name: string, ctx = defaultFactoryContext): Group {
  return { id: ctx.createId('g'), name, etappen: [] };
}

export interface CreateWaypointInput {
  lngLat: LngLat;
  name: string;
  kind?: WaypointKind;
  source?: WaypointSource;
  airportCode?: string;
}

export function createWaypoint(input: CreateWaypointInput, ctx = defaultFactoryContext): Waypoint {
  const kind = input.kind ?? 'stop';
  return {
    id: ctx.createId('w'),
    lngLat: [...input.lngLat],
    name: input.name,
    kind,
    source: input.source ?? 'manual',
    ...(input.airportCode !== undefined && { airportCode: input.airportCode }),
    holdSec: 0,
    showLabel: kind === 'stop',
  };
}

export interface CreateTrackInput {
  vehicleType: VehicleType;
  waypoints?: Waypoint[];
  label?: string;
  /** Position in the stage; picks the line colour from the palette. */
  colorIndex?: number;
}

export function createTrack(input: CreateTrackInput, ctx = defaultFactoryContext): Track {
  const { vehicleType } = input;
  return {
    id: ctx.createId('t'),
    ...(input.label !== undefined && { label: input.label }),
    vehicle: { type: vehicleType, variant: `${vehicleType}-default` },
    routing: { mode: VEHICLE_CATALOG[vehicleType].defaultRouting },
    waypoints: input.waypoints ?? [],
    timing: { startOffsetSec: 0, easing: 'ease-in-out' },
    style: defaultTrackStyle(input.colorIndex),
    ...(vehicleType === 'plane' && { flight: defaultFlightOptions() }),
  };
}

export interface CreateEtappeInput {
  name: string;
  tracks: Track[];
  durationSec?: number;
}

/**
 * The view follows the vehicles (globe as soon as a plane is involved) and the camera follows
 * a single vehicle, or keeps all of them in frame when there are several.
 */
export function createEtappe(input: CreateEtappeInput, ctx = defaultFactoryContext): Etappe {
  const { tracks } = input;
  const [onlyTrack] = tracks.length === 1 ? tracks : [];
  const camera: CameraSettings = {
    mode: onlyTrack ? 'follow' : 'follow-all',
    ...(onlyTrack && { followTrackId: onlyTrack.id }),
    paddingPx: 80,
    lagSec: 0.4,
    startWithOverview: true,
    endWithOverview: false,
  };
  const viewMode = recommendViewMode(tracks.map((track) => track.vehicle.type));

  return {
    id: ctx.createId('e'),
    name: input.name,
    durationSec: input.durationSec ?? DEFAULT_ETAPPE_DURATION_SEC,
    view: defaultView(viewMode, camera),
    intro: { type: 'none' },
    outro: { type: 'none' },
    overlays: defaultOverlays(),
    tracks,
  };
}
