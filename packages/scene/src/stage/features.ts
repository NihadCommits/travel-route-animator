import {
  FAKE_LIFT,
  liftedPoint,
  type FrameState,
  type LineDash,
  type LngLat,
  type Timeline,
  type TrackFrame,
  type TrackPlan,
} from '@travel-route-animator/core';
import { iconId, ROTATES } from '../vehicles/icons';
import { drawsModels, modelOf } from './data3d';

// What the map draws in one frame, as GeoJSON: plain functions of the timeline and the frame
// state, so they can be tested without WebGL and are the same for preview and export.

type Feature<G, P> = { type: 'Feature'; geometry: G; properties: P };
type Collection<F> = { type: 'FeatureCollection'; features: F[] };
type Line = { type: 'LineString'; coordinates: LngLat[] };
type Point = { type: 'Point'; coordinates: LngLat };

export interface LineProps {
  color: string;
  width: number;
  dash: LineDash;
  opacity: number;
  glow: boolean;
}

export interface VehicleProps {
  icon: string;
  bearing: number;
  size: number;
}

export interface StopProps {
  text: string;
  color: string;
  opacity: number;
}

export interface ShadowIconProps {
  bearing: number;
  size: number;
}

export interface SceneFeatures {
  /** Flights: the flown line on the ground and the plane's shadow (ADR 0007). */
  shadows: Collection<Feature<Line, Record<string, never>>>;
  shadowIcons: Collection<Feature<Point, ShadowIconProps>>;
  /** The route still ahead of each vehicle, in its own opacity and dash (ADR 0008). */
  ahead: Collection<Feature<Line, LineProps>>;
  routes: Collection<Feature<Line, LineProps>>;
  vehicles: Collection<Feature<Point, VehicleProps>>;
  stops: Collection<Feature<Point, StopProps>>;
}

const collection = <F>(features: F[]): Collection<F> => ({ type: 'FeatureCollection', features });

function lineProps(plan: TrackPlan): LineProps {
  const { style } = plan;
  return {
    color: style.lineColor,
    width: style.lineWidthPx,
    dash: style.lineDash,
    opacity: 1,
    glow: style.glow,
  };
}

/** Same colour and width as the driven line; glow and casing stay with the driven line. */
function aheadProps(plan: TrackPlan): LineProps {
  const { style } = plan;
  return {
    color: style.lineColor,
    width: style.lineWidthPx,
    dash: style.ahead.dash,
    opacity: style.ahead.opacity,
    glow: false,
  };
}

/** Fake 3D: the icon grows by this share at the top of the arc, as if it came closer. */
const FAKE_GROW = 0.6;
/** The shadow shrinks by this share at the top, like a real one gets fainter and smaller. */
const SHADOW_SHRINK = 0.25;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Fake 3D (ADR 0007): every point moves towards the top of the picture by its share of the
 * height, so the flat line bends up like an arc seen from an angle.
 */
function lifted(points: readonly LngLat[], altitudesM: readonly number[], up: number): LngLat[] {
  return points.map((point, i) => liftedPoint(point, (altitudesM[i] ?? 0) * FAKE_LIFT, up));
}

/**
 * The direction of the lifted line at the plane: its way over the ground plus the climb,
 * which the lift turns into a move towards the top of the picture.
 */
function liftedBearing(track: TrackFrame, up: number): number {
  const ground = toRad(track.head.bearingDeg);
  const rise = Math.tan(toRad(track.flight?.climbDeg ?? 0)) * FAKE_LIFT;
  const east = Math.sin(ground) + rise * Math.sin(toRad(up));
  const north = Math.cos(ground) + rise * Math.cos(toRad(up));
  return (Math.atan2(east, north) * 180) / Math.PI;
}

export function sceneFeatures(timeline: Timeline, state: FrameState): SceneFeatures {
  const plans = new Map(timeline.tracks.map((plan) => [plan.trackId, plan]));
  const visible = state.tracks.filter((track) => track.visible && plans.has(track.trackId));
  // Flights in a tilted view are drawn by the 3D layer; everything else by the flat layers.
  const flat = visible.filter((track) => !track.flight || state.flightStyle === 'fake-3d');
  // Planes and cars with a model stand in the 3D layer, too; their lines stay here.
  const icons = drawsModels(state)
    ? flat.filter((track) => !modelOf(plans.get(track.trackId)!))
    : flat;
  const flights = visible.filter((track) => track.flight?.showShadow);
  const up = state.camera.bearingDeg;

  return {
    shadows: collection(
      flights.map((track) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: track.revealed },
        properties: {},
      })),
    ),
    shadowIcons: collection(
      flights.map((track) => {
        const { flight, head } = track;
        const height = flight && flight.peakM > 0 ? head.altitudeM / flight.peakM : 0;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: head.lngLat },
          properties: {
            bearing: head.bearingDeg,
            size: plans.get(track.trackId)!.style.vehicleScale * (1 - SHADOW_SHRINK * height),
          },
        };
      }),
    ),
    ahead: collection(
      flat.flatMap((track) =>
        track.ahead
          ? [
              {
                type: 'Feature' as const,
                geometry: {
                  type: 'LineString' as const,
                  coordinates: track.flight?.aheadAltitudesM
                    ? lifted(track.ahead, track.flight.aheadAltitudesM, up)
                    : track.ahead,
                },
                properties: aheadProps(plans.get(track.trackId)!),
              },
            ]
          : [],
      ),
    ),
    routes: collection(
      flat.map((track) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: track.flight
            ? lifted(track.revealed, track.flight.revealedAltitudesM, up)
            : track.revealed,
        },
        properties: lineProps(plans.get(track.trackId)!),
      })),
    ),
    vehicles: collection(
      icons.map((track) => {
        const plan = plans.get(track.trackId)!;
        const { flight, head } = track;
        const height = flight && flight.peakM > 0 ? head.altitudeM / flight.peakM : 0;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: flight
              ? liftedPoint(head.lngLat, head.altitudeM * FAKE_LIFT, up)
              : head.lngLat,
          },
          properties: {
            icon: iconId(plan.vehicle, plan.style.lineColor),
            bearing: !ROTATES[plan.vehicle]
              ? 0
              : flight
                ? liftedBearing(track, up)
                : head.bearingDeg,
            // Icons are added at their full size; icon-size scales them by the track setting.
            size: plan.style.vehicleScale * (1 + FAKE_GROW * height),
          },
        };
      }),
    ),
    stops: collection(
      state.labels.map((label) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: label.lngLat },
        properties: {
          text: label.text,
          color: plans.get(label.trackId)?.style.lineColor ?? '#333333',
          opacity: label.opacity,
        },
      })),
    ),
  };
}
