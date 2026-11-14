import { closestOnLine, measureLine, type MeasuredLine } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { Etappe, Pin } from '../model/etappe';
import type { Id } from '../model/primitives';
import { isRouteStale } from '../routing/inputHash';

// Photos and places that pop up along the way (M14, ADR 0014). When a pin opens comes from
// the timeline: as a vehicle passes it, or at a set time. Opening and closing are plain
// functions of the time, so every frame stands on its own.

/** A place this far from every route is probably the wrong one (a city of the same name). */
export const PIN_FAR_FROM_ROUTE_M = 5000;
/** How long a pin takes to pop up and to go again. */
export const PIN_POP_SEC = 0.35;

/** A pin as the frames need it: where it is and when it is open. */
export interface PinPlan {
  pinId: Id;
  kind: Pin['kind'];
  lngLat: LngLat;
  title: string;
  assetId: string | undefined;
  openSec: number;
  closeSec: number;
}

/** What a vehicle offers for "as it passes": its line and when it is where. */
export interface PassingTrack {
  trackId: Id;
  line: MeasuredLine;
  /** Seconds from the start of the main part at which the vehicle is `s` metres along. */
  secAt: (s: number) => number;
}

/**
 * When each pin is open. "As it passes" means the vehicle whose line comes closest to the pin
 * (the followed one first, if it passes within reach): the pin opens a quarter of its time
 * before the vehicle is closest and stays for the rest.
 */
export function planPins(
  pins: readonly Pin[],
  tracks: readonly PassingTrack[],
  followedId: Id | undefined,
): PinPlan[] {
  return pins.map((pin) => {
    let at: number;
    if (pin.trigger.mode === 'time') {
      at = pin.trigger.atSec + pin.durationSec / 4;
    } else {
      const candidates = tracks.map((track) => ({
        track,
        ...closestOnLine(track.line, pin.lngLat),
      }));
      const followed = candidates.find(
        (c) => c.track.trackId === followedId && c.distanceM <= PIN_FAR_FROM_ROUTE_M,
      );
      const nearest = candidates.reduce<(typeof candidates)[number] | undefined>(
        (best, c) => (!best || c.distanceM < best.distanceM ? c : best),
        undefined,
      );
      const chosen = followed ?? nearest;
      at = chosen ? chosen.track.secAt(chosen.s) : 0;
    }
    const openSec = at - pin.durationSec / 4;
    return {
      pinId: pin.id,
      kind: pin.kind,
      lngLat: pin.lngLat,
      title: pin.title,
      assetId: pin.assetId,
      openSec,
      closeSec: openSec + pin.durationSec,
    };
  });
}

/** A pin in one frame: how far it has popped up (1 = full size) and how visible it is. */
export interface PinFrame {
  pinId: Id;
  kind: Pin['kind'];
  lngLat: LngLat;
  title: string;
  assetId: string | undefined;
  scale: number;
  opacity: number;
}

/** Overshoots a little and settles, like something that springs open. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** The pins open at `sec`; closed ones are left out. */
export function pinsAt(plans: readonly PinPlan[], sec: number): PinFrame[] {
  return plans.flatMap((plan) => {
    const opening = clamp01((sec - plan.openSec) / PIN_POP_SEC);
    const closing = clamp01((plan.closeSec - sec) / PIN_POP_SEC);
    if (opening <= 0 || closing <= 0) return [];
    return [
      {
        pinId: plan.pinId,
        kind: plan.kind,
        lngLat: plan.lngLat,
        title: plan.title,
        assetId: plan.assetId,
        scale: easeOutBack(opening) * (1 - (1 - closing) ** 2),
        opacity: Math.min(opening, closing),
      },
    ];
  });
}

/** Every line of the stage: the stored route, or the waypoints until it is there. */
function stageLines(etappe: Pick<Etappe, 'tracks'>): MeasuredLine[] {
  return etappe.tracks.flatMap((track) => {
    const points =
      track.computed && !isRouteStale(track)
        ? track.computed.geometry
        : track.waypoints.map((w) => w.lngLat);
    return points.length > 0 ? [measureLine(points)] : [];
  });
}

/** How far a place lies from the nearest route of the stage, in metres; Infinity without one. */
export function distanceToRoutes(etappe: Pick<Etappe, 'tracks'>, lngLat: LngLat): number {
  return Math.min(
    Number.POSITIVE_INFINITY,
    ...stageLines(etappe).map((line) => closestOnLine(line, lngLat).distanceM),
  );
}

export interface PinWarning {
  pinId: Id;
  kind: 'farFromRoute';
  distanceKm: number;
}

/**
 * Pins that are probably wrong: further from every route than PIN_FAR_FROM_ROUTE_M. Only a
 * warning: a viewpoint some way off can be meant, and the render goes ahead.
 */
export function pinWarnings(etappe: Pick<Etappe, 'tracks' | 'pins'>): PinWarning[] {
  if (etappe.tracks.length === 0) return [];
  return etappe.pins.flatMap((pin) => {
    const distance = distanceToRoutes(etappe, pin.lngLat);
    return distance > PIN_FAR_FROM_ROUTE_M && Number.isFinite(distance)
      ? [{ pinId: pin.id, kind: 'farFromRoute' as const, distanceKm: distance / 1000 }]
      : [];
  });
}
