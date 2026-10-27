import type { LngLat } from '../geo/lngLat';
import type { VehicleType } from '../model/enums';
import type { CameraSettings, Etappe } from '../model/etappe';
import { createEtappe, createProject, createTrack, createWaypoint } from '../model/factories';
import type { OutputSettings } from '../model/output';
import type { Project } from '../model/project';
import type { RoutingSettings, Track, TrackStyle, TrackTiming } from '../model/track';

// Small trips for the timeline and frame tests. Tracks drive straight lines by default, which
// core computes itself, so no router and no stored route is needed.

export interface TripTrack {
  vehicle?: VehicleType;
  /** Name, position and optional hold in seconds. A name starting with "~" is a shape point. */
  points: [name: string, lngLat: LngLat, holdSec?: number][];
  routing?: RoutingSettings;
  timing?: Partial<TrackTiming>;
  style?: Partial<TrackStyle>;
}

export interface TripOptions {
  durationSec?: number;
  tracks: TripTrack[];
  camera?: Partial<CameraSettings>;
  etappe?: Partial<Pick<Etappe, 'intro' | 'outro' | 'overlays'>>;
  output?: Partial<OutputSettings>;
}

let counter = 0;
const ctx = {
  createId: (prefix: string) => `${prefix}_${++counter}`,
  now: () => '2026-10-27T10:00:00.000Z',
};

function track(input: TripTrack, index: number): Track {
  const waypoints = input.points.map(([name, lngLat, holdSec = 0]) => {
    const shape = name.startsWith('~');
    return {
      ...createWaypoint({ name: shape ? '' : name, lngLat, kind: shape ? 'shape' : 'stop' }, ctx),
      holdSec,
    };
  });
  const base = createTrack(
    { vehicleType: input.vehicle ?? 'car', waypoints, colorIndex: index },
    ctx,
  );
  return {
    ...base,
    routing: input.routing ?? { mode: 'straight' },
    timing: { ...base.timing, ...input.timing },
    style: { ...base.style, ...input.style },
  };
}

/** A project with one group and one stage holding the given tracks. */
export function trip(options: TripOptions): {
  project: Project;
  etappeId: string;
  trackIds: string[];
} {
  const tracks = options.tracks.map(track);
  const etappe = createEtappe(
    {
      name: 'Test',
      tracks,
      ...(options.durationSec !== undefined && { durationSec: options.durationSec }),
    },
    ctx,
  );
  const withSettings: Etappe = {
    ...etappe,
    ...options.etappe,
    view: { ...etappe.view, camera: { ...etappe.view.camera, ...options.camera } },
  };
  const project = createProject('Trip', ctx);
  return {
    project: {
      ...project,
      defaults: { ...project.defaults, output: { ...project.defaults.output, ...options.output } },
      groups: [{ id: 'g_1', name: 'Group', etappen: [withSettings] }],
    },
    etappeId: withSettings.id,
    trackIds: tracks.map((t) => t.id),
  };
}
