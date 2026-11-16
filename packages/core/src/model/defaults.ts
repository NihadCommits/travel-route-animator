import type { ViewMode } from './enums';
import type { CameraSettings, OverlaySettings, ViewSettings } from './etappe';
import type { OutputSettings } from './output';
import type { ProjectDefaults } from './project';
import type { MapStyleRef, TransitionSettings } from './style';
import type { FlightOptions, TrackStyle } from './track';

// Functions instead of shared constants: every new project, stage or track gets its own
// objects, so editing one can never leak into another.

export const DEFAULT_ETAPPE_DURATION_SEC = 8;

/** Well distinguishable on light and dark maps; new tracks take the next colour. */
export const TRACK_COLORS = ['#E4572E', '#2E86AB', '#F2A541', '#76B041', '#9B5DE5', '#00B8A9'];

export function trackColor(index: number): string {
  const size = TRACK_COLORS.length;
  return TRACK_COLORS[((index % size) + size) % size]!;
}

export function defaultMapStyle(): MapStyleRef {
  return { base: 'vector' };
}

export function defaultOutput(): OutputSettings {
  // 25 fps matches PAL-region editing projects; it can be changed per project.
  return {
    aspect: '16:9',
    resolution: '1080p',
    fps: 25,
    codec: 'h264',
    transparentOverlay: false,
    safeAreaGuides: false,
  };
}

export function defaultTransition(): TransitionSettings {
  return { type: 'camera-fly', durationSec: 1.5 };
}

export function defaultProjectSettings(): ProjectDefaults {
  return { mapStyle: defaultMapStyle(), output: defaultOutput(), transition: defaultTransition() };
}

export function defaultOverlays(): OverlaySettings {
  return {
    labels: true,
    distanceCounter: false,
    timeCounter: false,
    attribution: true,
    attributionCorner: 'bottom-right',
    elevationProfile: false,
    elevationCounter: false,
    speedCounter: false,
    heartRateCounter: false,
    clockCounter: false,
  };
}

/** How faint the route ahead starts out; also what file format 1 called "ghost". */
export const AHEAD_OPACITY = 0.35;

export function defaultTrackStyle(colorIndex = 0): TrackStyle {
  return {
    lineColor: trackColor(colorIndex),
    lineWidthPx: 6,
    lineDash: 'solid',
    // Faint and in the same dash as the driven line: the look of version 1's "ghost".
    ahead: { opacity: AHEAD_OPACITY, dash: 'solid' },
    glow: false,
    vehicleScale: 1,
    icon: { kind: 'catalog' },
  };
}

export function defaultFlightOptions(): FlightOptions {
  // 0.15 of the distance read well in the M8 spike (Wien → Porto: about 300 km at the top).
  return { arcHeightFactor: 0.15, showGroundShadow: true, takeoffLandingCamera: true };
}

/**
 * Typical tilt per view; a 2d view must stay at 0. The globe is tilted so that a flight's arc
 * shows its height (ADR 0007); looking straight down it would be a flat line.
 */
const PITCH_BY_VIEW: Record<ViewMode, number> = { '2d': 0, '3d-tilted': 55, globe: 40 };

export function defaultPitch(mode: ViewMode): number {
  return PITCH_BY_VIEW[mode];
}

export function defaultView(mode: ViewMode, camera: CameraSettings): ViewSettings {
  return {
    mode,
    pitchDeg: PITCH_BY_VIEW[mode],
    bearingDeg: 0,
    camera,
    terrain: { enabled: false, exaggeration: 1 },
    buildings3d: false,
  };
}
