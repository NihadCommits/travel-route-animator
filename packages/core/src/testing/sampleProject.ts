import type { Etappe } from '../model/etappe';
import type { Project } from '../model/project';
import type { Track, Waypoint } from '../model/track';

// Hand-written so the schema tests do not depend on the factories they are testing.
// Every call returns a fresh object that tests may mutate freely.

function stop(id: string, name: string, lngLat: [number, number]): Waypoint {
  return { id, lngLat, name, kind: 'stop', source: 'manual', holdSec: 0, showLabel: true };
}

function track(id: string, overrides: Partial<Track> & Pick<Track, 'vehicle' | 'routing'>): Track {
  return {
    id,
    waypoints: [],
    timing: { startOffsetSec: 0, easing: 'ease-in-out' },
    style: {
      lineColor: '#E4572E',
      lineWidthPx: 6,
      lineDash: 'solid',
      ahead: { opacity: 0.35, dash: 'solid' },
      glow: false,
      vehicleScale: 1,
      icon: { kind: 'catalog' },
    },
    ...overrides,
  };
}

function etappe(
  id: string,
  name: string,
  tracks: Track[],
  overrides: Partial<Etappe> = {},
): Etappe {
  return {
    id,
    name,
    durationSec: 8,
    view: {
      mode: '2d',
      pitchDeg: 0,
      bearingDeg: 0,
      camera: {
        mode: 'follow-all',
        paddingPx: 80,
        lagSec: 0.4,
        startWithOverview: true,
        endWithOverview: false,
      },
      terrain: { enabled: false, exaggeration: 1 },
      buildings3d: false,
    },
    intro: { type: 'none' },
    outro: { type: 'none' },
    overlays: {
      labels: true,
      distanceCounter: false,
      timeCounter: false,
      attribution: true,
      attributionCorner: 'bottom-right',
      elevationProfile: false,
      elevationCounter: false,
    },
    tracks,
    pins: [],
    ...overrides,
  };
}

export function sampleProject(): Project {
  return {
    schemaVersion: 7,
    id: 'p_sample',
    name: 'Sample trip',
    createdAt: '2026-10-21T08:00:00.000Z',
    updatedAt: '2026-10-21T08:00:00.000Z',
    defaults: {
      mapStyle: { base: 'vector' },
      output: {
        aspect: '16:9',
        resolution: '1080p',
        fps: 25,
        codec: 'h264',
        transparentOverlay: false,
        safeAreaGuides: false,
      },
      transition: { type: 'camera-fly', durationSec: 1.5 },
    },
    groups: [
      {
        id: 'g_outbound',
        name: 'Outbound',
        etappen: [
          etappe('e_train', 'Salzburg – Vienna', [
            track('t_train', {
              vehicle: { type: 'train', variant: 'train-default' },
              routing: { mode: 'smooth' },
              waypoints: [
                stop('w_sbg', 'Salzburg Hbf', [13.0458, 47.8131]),
                {
                  ...stop('w_linz', 'Linz', [14.2913, 48.2904]),
                  kind: 'shape',
                  showLabel: false,
                },
                stop('w_vie_hbf', 'Wien Hbf', [16.3755, 48.1851]),
              ],
            }),
          ]),
          etappe(
            'e_flight',
            'Vienna – Porto',
            [
              track('t_plane', {
                vehicle: { type: 'plane', variant: 'plane-default' },
                routing: { mode: 'great-circle' },
                waypoints: [
                  { ...stop('w_vie', 'VIE', [16.5697, 48.1103]), airportCode: 'VIE' },
                  { ...stop('w_opo', 'OPO', [-8.6814, 41.2481]), airportCode: 'OPO' },
                ],
                flight: {
                  arcHeightFactor: 0.15,
                  showGroundShadow: true,
                  takeoffLandingCamera: true,
                },
              }),
            ],
            {
              durationSec: 10,
              mapStyle: { base: 'satellite' },
            },
          ),
        ],
      },
      {
        id: 'g_day4',
        name: 'Day 4',
        mapStyle: { base: 'vector', themeId: 'night' },
        transition: { type: 'fade', durationSec: 0.5 },
        etappen: [
          etappe('e_options', 'Where to tomorrow?', [
            track('t_a', {
              label: 'Option A',
              vehicle: { type: 'car', variant: 'car-default' },
              routing: { mode: 'road', avoid: ['tolls'] },
              waypoints: [
                stop('w_a1', 'Porto', [-8.6291, 41.1579]),
                stop('w_a2', 'Lisboa', [-9.1393, 38.7223]),
              ],
              timing: { startOffsetSec: 0, durationSec: 6, easing: 'ease-in-out' },
            }),
            track('t_b', {
              label: 'Option B',
              vehicle: { type: 'car', variant: 'car-default' },
              routing: { mode: 'road' },
              waypoints: [
                stop('w_b1', 'Porto', [-8.6291, 41.1579]),
                stop('w_b2', 'Faro', [-7.9304, 37.0194]),
              ],
              timing: { startOffsetSec: 1, durationSec: 7, easing: 'linear' },
            }),
          ]),
        ],
      },
    ],
    assets: [],
  };
}

/** Deep copy without structuredClone, which core's runtime-neutral typings do not include. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
