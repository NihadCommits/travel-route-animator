import {
  carTypeOf,
  metersPerPixel,
  planeTypeOf,
  type CarType,
  type FrameState,
  type LineDash,
  type LngLat,
  type PlaneType,
  type Timeline,
  type TrackPlan,
} from '@travel-route-animator/core';
import { carSizeFactor } from '../vehicles/carShapes';
import { ICON_SIZE_PX } from '../vehicles/icons';
import { planeSizeFactor } from '../vehicles/planeShapes';
import { vehicleLook, type ImageTimings } from './look';

// What the 3D layer draws in one frame: a plain function of the timeline and the frame state,
// like the flat features, so it can be tested without WebGL (ADR 0007).

export interface ArcLine {
  points: readonly LngLat[];
  altitudesM: readonly number[];
}

/** The arc still ahead, from the destination back to the plane, in its own look (ADR 0008). */
export interface AheadArc extends ArcLine {
  opacity: number;
  dash: LineDash;
}

export interface FlightArc {
  trackId: string;
  color: string;
  widthPx: number;
  dash: LineDash;
  glow: boolean;
  /** Flown so far, ending at the plane. */
  arc: ArcLine;
  /** Undefined when the track hides its route ahead. */
  ahead: AheadArc | undefined;
  /** Ground metres per reference pixel at this zoom, for dash lengths along the arc. */
  metersPerPx: number;
}

/** Which model stands for a vehicle in 3D. */
export type ModelKind = { kind: 'plane'; type: PlaneType } | { kind: 'car'; type: CarType };

export interface ModelDrawing {
  trackId: string;
  color: string;
  model: ModelKind;
  head: { lngLat: LngLat; altitudeM: number; bearingDeg: number; climbDeg: number };
  /**
   * A car: it stands on the terrain as the map draws it (ADR 0012), which only the map knows.
   * A plane's height already includes the ground below it.
   */
  onGround: boolean;
  /**
   * The model's length in metres: about as long on screen as the flat icon, a little more for
   * large types and less for small ones.
   */
  lengthM: number;
}

/**
 * An own image in place of a plane's model (ADR 0009): a card at the plane's point, lying
 * level and turning with the heading, or standing and facing the viewer.
 */
export interface CardDrawing {
  trackId: string;
  assetId: string;
  frame: number;
  upright: boolean;
  head: ModelDrawing['head'];
  /** The image's longer side in metres: as large as the flat image (64 px) on screen. */
  sizeM: number;
  /** Clockwise from north: the heading when it lies level, the camera's when it stands. */
  bearingDeg: number;
}

export interface Drawings3d {
  arcs: FlightArc[];
  models: ModelDrawing[];
  cards: CardDrawing[];
}

/** The 3D plane is a little longer than the flat icon; wings make it look thinner. */
const PLANE_SCALE = 1.25;
/** The flat car fills about 0.85 of its icon; the model matches it with a little extra. */
const CAR_SCALE = 0.95;

/**
 * The model a vehicle has in 3D; vehicles without one stay flat icons in every view. Only the
 * standard icon has a model: an own image or no icon replaces it (ADR 0009).
 */
export function modelOf(plan: TrackPlan): ModelKind | undefined {
  if (plan.style.icon.kind !== 'catalog') return undefined;
  if (plan.vehicle === 'plane') return { kind: 'plane', type: planeTypeOf(plan.variant) };
  if (plan.vehicle === 'car') return { kind: 'car', type: carTypeOf(plan.variant) };
  return undefined;
}

/**
 * Whether models are drawn in 3D at all: from the same tilt on as flights (ADR 0007). Looking
 * straight down, a model shows little more than its roof, and the flat icon reads better.
 */
export function drawsModels(state: FrameState): boolean {
  return state.flightStyle === 'arc-3d';
}

function sizeFactor(model: ModelKind): number {
  return model.kind === 'plane'
    ? PLANE_SCALE * planeSizeFactor(model.type)
    : CAR_SCALE * carSizeFactor(model.type);
}

export function drawings3d(
  timeline: Timeline,
  state: FrameState,
  timings: ImageTimings = new Map(),
): Drawings3d {
  if (!drawsModels(state)) return { arcs: [], models: [], cards: [] };
  const plans = new Map(timeline.tracks.map((plan) => [plan.trackId, plan]));
  const arcs: FlightArc[] = [];
  const models: ModelDrawing[] = [];
  const cards: CardDrawing[] = [];
  for (const track of state.tracks) {
    const plan = plans.get(track.trackId);
    if (!plan || !track.visible) continue;
    const { flight, head } = track;
    const metersPerPx = metersPerPixel(state.camera.zoom, head.lngLat[1]);
    const { style } = plan;
    if (flight) {
      arcs.push({
        trackId: track.trackId,
        color: style.lineColor,
        widthPx: style.lineWidthPx,
        dash: style.lineDash,
        glow: style.glow,
        arc: { points: track.revealed, altitudesM: flight.revealedAltitudesM },
        ahead:
          track.ahead && flight.aheadAltitudesM
            ? {
                points: track.ahead,
                altitudesM: flight.aheadAltitudesM,
                opacity: style.ahead.opacity,
                dash: style.ahead.dash,
              }
            : undefined,
        metersPerPx,
      });
    }
    const model = modelOf(plan);
    if (model) {
      models.push({
        trackId: track.trackId,
        color: style.lineColor,
        model,
        head: { ...head, climbDeg: flight?.climbDeg ?? 0 },
        onGround: !flight,
        lengthM: ICON_SIZE_PX * style.vehicleScale * sizeFactor(model) * metersPerPx,
      });
    }
    // A car's own image stands on the ground, where the flat layers draw it; a plane's flies.
    const look = vehicleLook(plan, track, timings);
    if (flight && look.kind === 'image' && look.image) {
      cards.push({
        trackId: track.trackId,
        ...look.image,
        upright: look.upright,
        head: { ...head, climbDeg: flight.climbDeg },
        sizeM: ICON_SIZE_PX * style.vehicleScale * metersPerPx,
        bearingDeg: look.upright ? state.camera.bearingDeg : head.bearingDeg,
      });
    }
  }
  return { arcs, models, cards };
}
