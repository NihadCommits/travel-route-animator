// Body types a car can be drawn as in 3D (vehicle.variant), like the aircraft types in
// planeTypes.ts. These are generic classes, not real models: the scene builds each one from
// typical dimensions of its class, so no make is copied.

export const CAR_TYPES = [
  // A saloon: what most people picture as "a car".
  'car-default',
  'car-compact',
  'car-estate',
  'car-suv',
  'car-van',
  'car-camper',
] as const;

export type CarType = (typeof CAR_TYPES)[number];

/** The body type of a car's variant; anything unknown (or another vehicle's) is the default. */
export function carTypeOf(variant: string): CarType {
  return (CAR_TYPES as readonly string[]).includes(variant) ? (variant as CarType) : 'car-default';
}
