import { describe, expect, it } from 'vitest';
import type { IntroSettings, OutroSettings } from '../model/etappe';
import { trip } from '../testing/trip';
import { compileTimeline } from '../timeline/compileTimeline';
import { ARRIVAL_ZOOM, cameraAt, DIVE_OUT_ZOOM, sectionEffects } from './camera';
import { positionAt } from './position';

// A car along the 38th parallel for 8 s, then the outro or before it the intro under test.
const A: [number, number] = [-9.0, 38.0];
const C: [number, number] = [-8.7, 38.0];

function stage(sections: { intro?: IntroSettings; outro?: OutroSettings }) {
  const { project, etappeId } = trip({
    durationSec: 8,
    tracks: [
      {
        points: [
          ['A', A],
          ['C', C],
        ],
      },
    ],
    etappe: sections,
  });
  return compileTimeline(project, etappeId);
}

const DIVE: OutroSettings = {
  type: 'dive-in',
  durationSec: 2,
  targetZoom: 18,
  switchToSatellite: true,
  effect: 'fade-white',
  exportEndFrame: true,
};

describe('dive-in', () => {
  it('ends straight above the destination at the target zoom', () => {
    const timeline = stage({ outro: DIVE });
    const end = cameraAt(timeline, 10);
    const destination = positionAt(timeline.tracks[0]!, 8);
    expect(end.zoom).toBeCloseTo(18, 6);
    expect(end.pitchDeg).toBeCloseTo(0, 6);
    expect(end.center[0]).toBeCloseTo(destination[0], 6);
    expect(end.center[1]).toBeCloseTo(destination[1], 6);
    // It speeds up: the second half covers more zoom than the first.
    const start = cameraAt(timeline, 8).zoom;
    const middle = cameraAt(timeline, 9).zoom;
    expect(18 - middle).toBeGreaterThan(middle - start);
  });

  it('brings its effect up towards the last frame', () => {
    const timeline = stage({ outro: DIVE });
    expect(sectionEffects(timeline, 8)).toEqual({ blur: 0, flash: 0, fade: 0, satelliteMix: 0 });
    expect(sectionEffects(timeline, 9).flash).toBe(0);
    expect(sectionEffects(timeline, 10)).toEqual({ blur: 0, flash: 1, fade: 0, satelliteMix: 1 });
    expect(sectionEffects(timeline, 9.5).satelliteMix).toBeGreaterThan(0.5);
    const blur = stage({ outro: { ...DIVE, effect: 'blur', switchToSatellite: false } });
    expect(sectionEffects(blur, 10)).toMatchObject({ blur: 14, satelliteMix: 0 });
    expect(sectionEffects(stage({ outro: { ...DIVE, effect: 'fade-black' } }), 10).fade).toBe(1);
    expect(sectionEffects(stage({ outro: { ...DIVE, effect: 'flash' } }), 9.8).flash).toBeLessThan(
      0.5,
    );
  });
});

describe('3D arrival', () => {
  it('comes close, tilts and circles the destination', () => {
    const outro: OutroSettings = { type: 'arrival-3d', durationSec: 4, pitchDeg: 60, orbitDeg: 90 };
    const timeline = stage({ outro });
    const before = cameraAt(timeline, 8);
    const end = cameraAt(timeline, 12);
    const destination = positionAt(timeline.tracks[0]!, 8);
    expect(end.pitchDeg).toBeCloseTo(60, 6);
    expect(end.zoom).toBeGreaterThanOrEqual(ARRIVAL_ZOOM);
    expect(end.bearingDeg).toBeCloseTo(before.bearingDeg + 90, 6);
    expect(end.center[0]).toBeCloseTo(destination[0], 6);
    // Halfway the approach is done and the orbit is still turning.
    expect(cameraAt(timeline, 10).pitchDeg).toBeCloseTo(60, 6);
    expect(cameraAt(timeline, 10).bearingDeg).toBeCloseTo(before.bearingDeg + 45, 6);
  });
});

describe('dive-out', () => {
  it('starts straight above the start and settles into the stage', () => {
    const timeline = stage({ intro: { type: 'dive-out', durationSec: 2 } });
    const first = cameraAt(timeline, -2);
    expect(first.zoom).toBeCloseTo(DIVE_OUT_ZOOM, 6);
    expect(first.pitchDeg).toBe(0);
    expect(first.center[0]).toBeCloseTo(A[0], 6);
    const settled = cameraAt(timeline, 0);
    expect(cameraAt(timeline, -1e-9).zoom).toBeCloseTo(settled.zoom, 3);
    // Fast at first: the first half covers most of the way out.
    const middle = cameraAt(timeline, -1).zoom;
    expect(DIVE_OUT_ZOOM - middle).toBeGreaterThan(middle - settled.zoom);
  });
});
