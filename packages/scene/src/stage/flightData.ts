import {
  metersPerPixel,
  planeTypeOf,
  type FrameState,
  type LngLat,
  type PlaneType,
  type Timeline,
  type TrackStyle,
} from '@travel-route-animator/core';
import { ICON_SIZE_PX } from '../vehicles/icons';
import { planeSizeFactor } from '../vehicles/planeShapes';

// What the 3D layer draws in one frame: a plain function of the timeline and the frame state,
// like the flat features, so it can be tested without WebGL (ADR 0007).

export interface ArcLine {
  points: readonly LngLat[];
  altitudesM: readonly number[];
}

export interface FlightDrawing {
  trackId: string;
  color: string;
  widthPx: number;
  dash: TrackStyle['lineDash'];
  glow: boolean;
  /** Flown so far, ending at the plane. */
  arc: ArcLine;
  /** The whole flight, faint, when the track shows its route ahead. */
  ghost: ArcLine | undefined;
  head: { lngLat: LngLat; altitudeM: number; bearingDeg: number; climbDeg: number };
  planeType: PlaneType;
  /**
   * The model's length in metres: about as long on screen as the flat icon, a little more for
   * large aircraft and less for small ones.
   */
  modelLengthM: number;
  /** Ground metres per reference pixel at this zoom, for dash lengths along the arc. */
  metersPerPx: number;
}

/** The 3D plane is a little longer than the flat icon; wings make it look thinner. */
const MODEL_SCALE = 1.25;

export function flightDrawings(timeline: Timeline, state: FrameState): FlightDrawing[] {
  if (state.flightStyle !== 'arc-3d') return [];
  const plans = new Map(timeline.tracks.map((plan) => [plan.trackId, plan]));
  return state.tracks.flatMap((track) => {
    const plan = plans.get(track.trackId);
    const { flight, head } = track;
    if (!plan || !flight || !track.visible) return [];
    const metersPerPx = metersPerPixel(state.camera.zoom, head.lngLat[1]);
    const planeType = planeTypeOf(plan.variant);
    return [
      {
        trackId: track.trackId,
        color: plan.style.lineColor,
        widthPx: plan.style.lineWidthPx,
        dash: plan.style.lineDash,
        glow: plan.style.glow,
        arc: { points: track.revealed, altitudesM: flight.revealedAltitudesM },
        ghost:
          track.ghost && flight.ghostAltitudesM
            ? { points: track.ghost, altitudesM: flight.ghostAltitudesM }
            : undefined,
        head: { ...head, climbDeg: flight.climbDeg },
        planeType,
        modelLengthM:
          ICON_SIZE_PX *
          plan.style.vehicleScale *
          MODEL_SCALE *
          planeSizeFactor(planeType) *
          metersPerPx,
        metersPerPx,
      },
    ];
  });
}
