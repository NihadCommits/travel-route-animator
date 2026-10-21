import type { RoutingMode, VehicleType, ViewMode } from './enums';

export interface VehicleCatalogEntry {
  /** Routing modes the UI offers for this vehicle; anything else is rejected on validation. */
  routingModes: readonly RoutingMode[];
  defaultRouting: RoutingMode;
  /** Suggested view for a stage that contains this vehicle. The stage decides in the end. */
  recommendedView: ViewMode;
  /** Hiking looks best with 3D terrain, which arrives in M12. */
  recommendsTerrain: boolean;
}

/**
 * Which options a vehicle gets lives here as data, not as scattered `if (type === 'plane')`
 * checks. The editor reads it to build its forms; validation reads it to reject mismatches.
 */
export const VEHICLE_CATALOG = {
  plane: {
    routingModes: ['great-circle'],
    defaultRouting: 'great-circle',
    recommendedView: 'globe',
    recommendsTerrain: false,
  },
  car: {
    routingModes: ['road', 'straight', 'gpx'],
    defaultRouting: 'road',
    recommendedView: '3d-tilted',
    recommendsTerrain: false,
  },
  motorbike: {
    routingModes: ['road', 'straight', 'gpx'],
    defaultRouting: 'road',
    recommendedView: '3d-tilted',
    recommendsTerrain: false,
  },
  bus: {
    routingModes: ['road', 'straight', 'gpx'],
    defaultRouting: 'road',
    recommendedView: '3d-tilted',
    recommendsTerrain: false,
  },
  bike: {
    routingModes: ['cycling', 'straight', 'gpx'],
    defaultRouting: 'cycling',
    recommendedView: '2d',
    recommendsTerrain: false,
  },
  walk: {
    routingModes: ['walking', 'straight', 'gpx'],
    defaultRouting: 'walking',
    recommendedView: '2d',
    recommendsTerrain: false,
  },
  hike: {
    routingModes: ['hiking', 'straight', 'gpx'],
    defaultRouting: 'hiking',
    recommendedView: '3d-tilted',
    recommendsTerrain: true,
  },
  train: {
    routingModes: ['smooth', 'straight', 'gpx'],
    defaultRouting: 'smooth',
    recommendedView: '2d',
    recommendsTerrain: false,
  },
  ferry: {
    routingModes: ['smooth', 'straight', 'gpx'],
    defaultRouting: 'smooth',
    recommendedView: '2d',
    recommendsTerrain: false,
  },
} as const satisfies Record<VehicleType, VehicleCatalogEntry>;

export function isRoutingAllowed(vehicle: VehicleType, mode: RoutingMode): boolean {
  const allowed: readonly RoutingMode[] = VEHICLE_CATALOG[vehicle].routingModes;
  return allowed.includes(mode);
}

/**
 * The view a stage should start with: a globe as soon as a plane is involved, otherwise the
 * recommendation of the first vehicle.
 */
export function recommendViewMode(vehicles: readonly VehicleType[]): ViewMode {
  if (vehicles.includes('plane')) return 'globe';
  const [first] = vehicles;
  return first ? VEHICLE_CATALOG[first].recommendedView : '2d';
}
