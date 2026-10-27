import type { FrameState, LngLat, Timeline, TrackPlan } from '@travel-route-animator/core';
import { iconId, ROTATES } from '../vehicles/icons';

// What the map draws in one frame, as GeoJSON: plain functions of the timeline and the frame
// state, so they can be tested without WebGL and are the same for preview and export.

type Feature<G, P> = { type: 'Feature'; geometry: G; properties: P };
type Collection<F> = { type: 'FeatureCollection'; features: F[] };
type Line = { type: 'LineString'; coordinates: LngLat[] };
type Point = { type: 'Point'; coordinates: LngLat };

export interface LineProps {
  color: string;
  width: number;
  dash: 'solid' | 'dashed' | 'dotted';
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

export interface SceneFeatures {
  ghosts: Collection<Feature<Line, LineProps>>;
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
    glow: style.glow,
  };
}

export function sceneFeatures(timeline: Timeline, state: FrameState): SceneFeatures {
  const plans = new Map(timeline.tracks.map((plan) => [plan.trackId, plan]));
  const visible = state.tracks.filter((track) => track.visible && plans.has(track.trackId));

  return {
    ghosts: collection(
      visible.flatMap((track) =>
        track.ghost
          ? [
              {
                type: 'Feature' as const,
                geometry: { type: 'LineString' as const, coordinates: [...track.ghost] },
                properties: lineProps(plans.get(track.trackId)!),
              },
            ]
          : [],
      ),
    ),
    routes: collection(
      visible.map((track) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: track.revealed },
        properties: lineProps(plans.get(track.trackId)!),
      })),
    ),
    vehicles: collection(
      visible.map((track) => {
        const plan = plans.get(track.trackId)!;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: track.head.lngLat },
          properties: {
            icon: iconId(plan.vehicle, plan.style.lineColor),
            bearing: ROTATES[plan.vehicle] ? track.head.bearingDeg : 0,
            // Icons are added at their full size; icon-size scales them by the track setting.
            size: plan.style.vehicleScale,
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
