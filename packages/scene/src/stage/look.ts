import { animationFrameAt, type TrackFrame, type TrackPlan } from '@travel-route-animator/core';
import { iconId, PLANE_SHADOW_ICON, ROTATES } from '../vehicles/icons';
import { imageFrameId, imageShadowId } from '../vehicles/images';

// What stands for a vehicle in a frame (ADR 0009): its type's icon, a picture of an own image,
// or nothing at all. Shared by the flat layers and the 3D layer, so both pick the same picture.

/** How long each picture of every loaded image shows, by asset ID. */
export type ImageTimings = ReadonlyMap<string, readonly number[]>;

export type VehicleLook =
  | {
      kind: 'catalog' | 'image';
      /** The MapLibre image to draw. */
      icon: string;
      /** The shadow of a flight on the ground. */
      shadowIcon: string;
      /** Turns with the heading, lying flat on the map. */
      turns: boolean;
      /** Stands facing the viewer instead (an own image that does not turn). */
      upright: boolean;
      /** Images only: which one and which of its pictures. */
      image?: { assetId: string; frame: number };
    }
  | { kind: 'none' };

export function vehicleLook(
  plan: TrackPlan,
  track: TrackFrame,
  timings: ImageTimings,
): VehicleLook {
  const { icon } = plan.style;
  if (icon.kind === 'none') return { kind: 'none' };
  if (icon.kind === 'catalog') {
    return {
      kind: 'catalog',
      icon: iconId(plan.vehicle, plan.style.lineColor),
      shadowIcon: PLANE_SHADOW_ICON,
      turns: ROTATES[plan.vehicle],
      upright: false,
    };
  }
  // An animated image runs only while the vehicle moves (ADR 0009).
  const frame = animationFrameAt(timings.get(icon.assetId) ?? [], track.movingSec);
  return {
    kind: 'image',
    icon: imageFrameId(icon.assetId, frame),
    shadowIcon: imageShadowId(icon.assetId),
    turns: icon.rotates,
    upright: !icon.rotates,
    image: { assetId: icon.assetId, frame },
  };
}
