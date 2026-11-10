// Aircraft types a plane can be drawn as in 3D (vehicle.variant). Core only knows the ids, so
// the editor can offer them and the scene can look up their shape; the shapes themselves are
// built in the scene from the real aircraft's published dimensions (ADR 0007).

export const PLANE_TYPES = [
  'plane-default',
  'plane-a320',
  'plane-b737',
  'plane-e190',
  'plane-atr72',
  'plane-b787',
  'plane-a350',
  'plane-b777',
  'plane-b747',
  'plane-a380',
] as const;

export type PlaneType = (typeof PLANE_TYPES)[number];

/** The type of a plane's variant; anything unknown (or another vehicle's) is the default. */
export function planeTypeOf(variant: string): PlaneType {
  return (PLANE_TYPES as readonly string[]).includes(variant)
    ? (variant as PlaneType)
    : 'plane-default';
}
