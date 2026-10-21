import type { VehicleType } from '@travel-route-animator/core';
import {
  Bike,
  Bus,
  Car,
  Footprints,
  Motorbike,
  Mountain,
  Plane,
  Ship,
  TrainFront,
  type LucideIcon,
} from 'lucide-react';

/** Fixed icon per vehicle type, so the tree can be read at a glance. */
export const VEHICLE_ICONS: Record<VehicleType, LucideIcon> = {
  plane: Plane,
  car: Car,
  motorbike: Motorbike,
  bus: Bus,
  train: TrainFront,
  bike: Bike,
  walk: Footprints,
  hike: Mountain,
  ferry: Ship,
};
