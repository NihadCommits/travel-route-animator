import { describe, expect, it } from 'vitest';
import type { LngLat } from '../geo/lngLat';
import { trip, type TripOptions } from '../testing/trip';
import { compileTimeline } from '../timeline/compileTimeline';
import {
  blendCamera,
  cameraAt,
  fitBounds,
  metersPerPixel,
  OVERLAY_BAND_PX,
  overviewCamera,
  type CameraState,
  type Viewport,
} from './camera';
import { positionAt } from './position';

const viewport: Viewport = { width: 1920, height: 1080 };

/** Where a point lands on screen for a camera, with MapLibre's 512-pixel world (no tilt). */
function screenPoint([lng, lat]: LngLat, camera: CameraState, view = viewport): [number, number] {
  const x = (l: number) => (l + 180) / 360;
  const y = (p: number) => {
    const phi = (p * Math.PI) / 180;
    return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
  };
  const world = 512 * 2 ** camera.zoom;
  return [
    (x(lng) - x(camera.center[0])) * world + view.width / 2,
    (y(lat) - y(camera.center[1])) * world + view.height / 2,
  ];
}

function timelineOf(options: TripOptions) {
  const { project, etappeId } = trip({ output: { fps: 25 }, ...options });
  return compileTimeline(project, etappeId);
}

describe('fitBounds', () => {
  it('fits a box with the padding free on the tighter side', () => {
    const bounds = { west: -9.2, south: 37.0, east: -7.9, north: 38.8 };
    const camera = { ...fitBounds(bounds, viewport, 80), pitchDeg: 0, bearingDeg: 0 };
    const [x0, y0] = screenPoint([bounds.west, bounds.north], camera);
    const [x1, y1] = screenPoint([bounds.east, bounds.south], camera);
    // Taller than wide: top and bottom touch the padding, left and right have room to spare.
    expect(y0).toBeCloseTo(80, 6);
    expect(y1).toBeCloseTo(1000, 6);
    expect(x0).toBeGreaterThan(80);
    expect(x1).toBeLessThan(1840);
    expect((x0 + x1) / 2).toBeCloseTo(960, 6);
  });

  it('centres the box in the free area when one side needs more room', () => {
    const bounds = { west: -9.2, south: 37.0, east: -7.9, north: 38.8 };
    const padding = { top: 210, right: 80, bottom: 80, left: 80 };
    const camera = { ...fitBounds(bounds, viewport, padding), pitchDeg: 0, bearingDeg: 0 };
    const [, top] = screenPoint([bounds.west, bounds.north], camera);
    const [, bottom] = screenPoint([bounds.east, bounds.south], camera);
    expect(top).toBeCloseTo(210, 6);
    expect(bottom).toBeCloseTo(1000, 6);
  });

  it('zooms in as far as allowed on a single point', () => {
    const point = { west: -8.6, south: 41.1, east: -8.6, north: 41.1 };
    const { center, zoom } = fitBounds(point, viewport, 80, 12);
    expect(zoom).toBe(12);
    expect(center[0]).toBeCloseTo(-8.6, 9);
    expect(center[1]).toBeCloseTo(41.1, 9);
  });

  it('measures metres per pixel like MapLibre', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.5, 0);
    expect(metersPerPixel(1, 60)).toBeCloseTo(78_271.5 / 4, 0);
  });
});

describe('blendCamera', () => {
  it('turns the short way round', () => {
    const a = { center: [0, 0] as LngLat, zoom: 4, pitchDeg: 0, bearingDeg: 350 };
    const b = { center: [10, 10] as LngLat, zoom: 8, pitchDeg: 40, bearingDeg: 10 };
    expect(blendCamera(a, b, 0.5)).toEqual({
      center: [5, 5],
      zoom: 6,
      pitchDeg: 20,
      bearingDeg: 360,
    });
  });
});

describe('camera modes', () => {
  const route: [string, LngLat][] = [
    ['Lisboa', [-9.14, 38.72]],
    ['Faro', [-7.93, 37.02]],
  ];

  it('follows a vehicle, trailing it by lagSec', () => {
    const timeline = timelineOf({
      durationSec: 10,
      tracks: [{ points: route }],
      camera: { mode: 'follow', lagSec: 0.5, zoom: 11, startWithOverview: false },
    });
    const camera = cameraAt(timeline, 5);
    expect(camera.zoom).toBe(11);
    expect(camera.center).toEqual(positionAt(timeline.tracks[0]!, 4.5));
    // Before the start the trailing camera waits at the start, never behind it.
    expect(cameraAt(timeline, 0).center).toEqual(route[0]![1]);
  });

  it('picks a follow zoom a bit closer than the overview when none is set', () => {
    const timeline = timelineOf({
      tracks: [{ points: route }],
      camera: { mode: 'follow', startWithOverview: false },
    });
    expect(cameraAt(timeline, 1).zoom).toBeCloseTo(overviewCamera(timeline).zoom + 1.5, 6);
  });

  it('keeps all vehicles in the picture with follow-all', () => {
    const timeline = timelineOf({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['Porto', [-8.61, 41.15]],
            ['Lisboa', [-9.14, 38.72]],
          ],
        },
        {
          points: [
            ['Porto', [-8.61, 41.15]],
            ['Faro', [-7.93, 37.02]],
          ],
        },
        {
          points: [
            ['Porto', [-8.61, 41.15]],
            ['Madrid', [-3.7, 40.42]],
          ],
        },
      ],
      camera: { mode: 'follow-all', lagSec: 0, paddingPx: 80, startWithOverview: false },
    });
    for (let sec = 0; sec <= 10; sec += 0.5) {
      const camera = cameraAt(timeline, sec);
      for (const plan of timeline.tracks) {
        const [x, y] = screenPoint(positionAt(plan, sec), camera);
        expect(x).toBeGreaterThanOrEqual(80 - 1e-6);
        expect(x).toBeLessThanOrEqual(1840 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(80 - 1e-6);
        expect(y).toBeLessThanOrEqual(1000 + 1e-6);
      }
    }
    // With a title on top, the vehicles stay below its band.
    const titled = timelineOf({
      durationSec: 10,
      tracks: timeline.tracks.map((plan) => ({
        points: [
          ['Start', plan.line.points[0]!],
          ['Ziel', plan.line.points.at(-1)!],
        ],
      })),
      camera: { mode: 'follow-all', lagSec: 0, paddingPx: 80, startWithOverview: false },
      etappe: {
        overlays: {
          labels: true,
          distanceCounter: false,
          timeCounter: false,
          attribution: true,
          title: 'Wohin morgen?',
        },
      },
    });
    for (const plan of titled.tracks) {
      const [, y] = screenPoint(positionAt(plan, 10), cameraAt(titled, 10));
      expect(y).toBeGreaterThanOrEqual(80 + OVERLAY_BAND_PX - 1e-6);
    }

    // All three wait together in Porto: close, but not endlessly close.
    expect(cameraAt(timeline, 0).zoom).toBeCloseTo(overviewCamera(timeline).zoom + 2, 6);
  });

  it('shows the whole stage with overview and holds a fixed static camera', () => {
    const overview = timelineOf({
      tracks: [{ points: route }],
      camera: { mode: 'overview', startWithOverview: false },
    });
    expect(cameraAt(overview, 1)).toEqual(cameraAt(overview, 7));
    expect(cameraAt(overview, 1)).toEqual(overviewCamera(overview));

    const fixed = { center: [-8, 39] as LngLat, zoom: 7, pitchDeg: 30, bearingDeg: 15 };
    const still = timelineOf({
      tracks: [{ points: route }],
      camera: { mode: 'static', staticCamera: fixed },
    });
    expect(cameraAt(still, 3)).toEqual(fixed);
  });

  it('starts with the overview and settles on the vehicle, and ends on the overview if asked', () => {
    const timeline = timelineOf({
      durationSec: 10,
      tracks: [{ points: route }],
      camera: {
        mode: 'follow',
        zoom: 11,
        lagSec: 0,
        startWithOverview: true,
        endWithOverview: true,
      },
    });
    expect(cameraAt(timeline, 0)).toEqual(overviewCamera(timeline));
    expect(cameraAt(timeline, 1.5).zoom).toBe(11);
    expect(cameraAt(timeline, 10)).toEqual(overviewCamera(timeline));
    const halfway = cameraAt(timeline, 0.75).zoom;
    expect(halfway).toBeGreaterThan(overviewCamera(timeline).zoom);
    expect(halfway).toBeLessThan(11);
  });

  it('moves from the overview to the start during an "overview-to-start" intro', () => {
    const timeline = timelineOf({
      tracks: [{ points: route }],
      camera: { mode: 'follow', zoom: 11, startWithOverview: false },
      etappe: { intro: { type: 'overview-to-start', durationSec: 2 } },
    });
    expect(cameraAt(timeline, -2)).toEqual(overviewCamera(timeline));
    expect(cameraAt(timeline, -0.0001).zoom).toBeCloseTo(11, 3);
  });

  it('uses the tilt and rotation of the stage view', () => {
    const { project, etappeId } = trip({ tracks: [{ points: route }] });
    const etappe = project.groups[0]!.etappen[0]!;
    etappe.view = { ...etappe.view, mode: '3d-tilted', pitchDeg: 55, bearingDeg: -20 };
    const camera = cameraAt(compileTimeline(project, etappeId), 3);
    expect([camera.pitchDeg, camera.bearingDeg]).toEqual([55, -20]);
  });
});
