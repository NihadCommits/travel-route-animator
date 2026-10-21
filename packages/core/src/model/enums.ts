import { z } from 'zod';

// Every closed set of values lives here once, so schemas, the vehicle catalog and the UI
// all read from the same list.

export const VEHICLE_TYPES = [
  'plane',
  'car',
  'motorbike',
  'bus',
  'train',
  'bike',
  'walk',
  'hike',
  'ferry',
] as const;
export const VehicleTypeSchema = z.enum(VEHICLE_TYPES);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const ROUTING_MODES = [
  'road',
  'cycling',
  'walking',
  'hiking',
  'great-circle',
  'straight',
  'smooth',
  'gpx',
] as const;
export const RoutingModeSchema = z.enum(ROUTING_MODES);
export type RoutingMode = z.infer<typeof RoutingModeSchema>;

export const ViewModeSchema = z.enum(['2d', '3d-tilted', 'globe']);
export type ViewMode = z.infer<typeof ViewModeSchema>;

export const CameraModeSchema = z.enum(['follow', 'follow-all', 'overview', 'static']);
export type CameraMode = z.infer<typeof CameraModeSchema>;

export const EasingSchema = z.enum(['linear', 'ease-in-out', 'ease-in', 'ease-out']);
export type Easing = z.infer<typeof EasingSchema>;

export const WaypointKindSchema = z.enum(['stop', 'shape']);
export type WaypointKind = z.infer<typeof WaypointKindSchema>;

export const WaypointSourceSchema = z.enum(['search', 'airport', 'map-click', 'gpx', 'manual']);
export type WaypointSource = z.infer<typeof WaypointSourceSchema>;

export const RoadAvoidSchema = z.enum(['highways', 'tolls', 'ferries']);
export type RoadAvoid = z.infer<typeof RoadAvoidSchema>;

export const MapBaseSchema = z.enum(['vector', 'satellite', 'satellite-hybrid', 'terrain']);
export type MapBase = z.infer<typeof MapBaseSchema>;
