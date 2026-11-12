import { describe, expect, it } from 'vitest';
import type { Project } from '../model/project';
import { computeFrameState } from '../frame/computeFrameState';
import { sampleProject } from '../testing/sampleProject';
import { compileSequence, flyCamera, sequenceFrameAt } from './sequence';

// The sample: a train (Salzburg – Vienna, flat map) and a flight (Vienna – Porto, satellite)
// in one group; the project's transition is a 1.5 s camera fly, the other group fades.

function withTransition(type: 'cut' | 'camera-fly' | 'fade', durationSec = 1.5): Project {
  const project = sampleProject();
  return { ...project, defaults: { ...project.defaults, transition: { type, durationSec } } };
}

const STAGES = ['e_train', 'e_flight'];

describe('compileSequence', () => {
  it('puts the stages one after the other with the transition in between', () => {
    const sequence = compileSequence(sampleProject(), STAGES);
    const [train, flight] = sequence.parts;
    expect(train!.startFrame).toBe(0);
    expect(sequence.gaps).toEqual([
      {
        type: 'camera-fly',
        from: 0,
        startFrame: train!.timeline.durationInFrames,
        durationInFrames: 38,
        // Flat vector map, then satellite: the map is built anew in the middle.
        styleChanges: true,
      },
    ]);
    expect(flight!.startFrame).toBe(train!.timeline.durationInFrames + 38);
    expect(sequence.durationInFrames).toBe(flight!.startFrame + flight!.timeline.durationInFrames);
    expect(sequence.fps).toBe(25);
  });

  it('leaves no time between stages for a cut, and refuses an empty sequence', () => {
    const sequence = compileSequence(withTransition('cut'), STAGES);
    expect(sequence.gaps).toEqual([]);
    expect(sequence.parts[1]!.startFrame).toBe(sequence.parts[0]!.timeline.durationInFrames);
    expect(() => compileSequence(sampleProject(), [])).toThrow(/at least one stage/);
  });
});

describe('sequenceFrameAt', () => {
  it('plays each stage from its own first frame', () => {
    const sequence = compileSequence(withTransition('cut'), STAGES);
    const [train, flight] = sequence.parts;
    expect(sequenceFrameAt(sequence, 10)).toMatchObject({ partIndex: 0, dip: 0 });
    const first = sequenceFrameAt(sequence, flight!.startFrame);
    expect(first.partIndex).toBe(1);
    expect(first.state).toEqual(computeFrameState(flight!.timeline, 0));
    // Past the end, the end stays.
    expect(sequenceFrameAt(sequence, 1e6).state.frame).toBe(flight!.timeline.durationInFrames - 1);
    expect(sequenceFrameAt(sequence, train!.timeline.durationInFrames - 1).partIndex).toBe(0);
  });

  it('fades through black and changes stage in the dark middle', () => {
    const sequence = compileSequence(withTransition('fade', 1), STAGES);
    const gap = sequence.gaps[0]!;
    const at = (i: number) => sequenceFrameAt(sequence, gap.startFrame + i);
    expect(at(0)).toMatchObject({ partIndex: 0 });
    expect(at(0).dip).toBeLessThan(0.1);
    expect(at(12).dip).toBeGreaterThan(0.9);
    expect(at(13).partIndex).toBe(1);
    expect(at(24).dip).toBeLessThan(0.1);
  });

  it('flies the camera from the end of one stage to the start of the next', () => {
    const sequence = compileSequence(sampleProject(), STAGES);
    const gap = sequence.gaps[0]!;
    const [train, flight] = sequence.parts;
    const end = computeFrameState(train!.timeline, train!.timeline.durationInFrames - 1).camera;
    const start = computeFrameState(flight!.timeline, 0).camera;
    const first = sequenceFrameAt(sequence, gap.startFrame);
    const middle = sequenceFrameAt(sequence, gap.startFrame + 19);
    const last = sequenceFrameAt(sequence, gap.startFrame + gap.durationInFrames - 1);

    expect(first.state.camera.center[0]).toBeCloseTo(end.center[0], 1);
    expect(last.state.camera.center[0]).toBeCloseTo(start.center[0], 1);
    // Vienna's station and airport are close: no extra zoom-out on the way.
    expect(middle.state.camera.zoom).toBeLessThanOrEqual(Math.max(end.zoom, start.zoom));
    expect(middle.state.camera.zoom).toBeGreaterThanOrEqual(Math.min(end.zoom, start.zoom));
    expect(first.state.projection).toBe('mercator');
    // The style changes in the middle, under a short dip.
    expect(middle.dip).toBeGreaterThan(0.8);
    expect(first.dip).toBe(0);
  });
});

describe('the way to a globe', () => {
  it('flies on the globe when one of the two stages is one', () => {
    const project = sampleProject();
    const flight = project.groups[0]!.etappen[1]!;
    flight.view = { ...flight.view, mode: 'globe', pitchDeg: 40 };
    const sequence = compileSequence(project, STAGES);
    expect(sequenceFrameAt(sequence, sequence.gaps[0]!.startFrame).state.projection).toBe('globe');
  });
});

describe('flyCamera', () => {
  const vienna = {
    center: [16.37, 48.21] as const,
    zoom: 11,
    pitchDeg: 0,
    bearingDeg: 350,
    centerAltitudeM: 0,
  };
  const porto = {
    center: [-8.61, 41.15] as const,
    zoom: 9,
    pitchDeg: 40,
    bearingDeg: 10,
    centerAltitudeM: 0,
  };
  const viewport = { width: 1920, height: 1080 };

  it('starts and ends at the two cameras and turns the short way', () => {
    const a = { ...vienna, center: [...vienna.center] as [number, number] };
    const b = { ...porto, center: [...porto.center] as [number, number] };
    expect(flyCamera(a, b, 0, viewport)).toMatchObject({ zoom: 11, pitchDeg: 0, bearingDeg: 350 });
    const end = flyCamera(a, b, 1, viewport);
    expect(end.center[0]).toBeCloseTo(-8.61, 6);
    expect(end.center[1]).toBeCloseTo(41.15, 6);
    expect(end.zoom).toBeCloseTo(9, 6);
    // From 350° to 10° is 20° clockwise, not 340° back.
    expect(flyCamera(a, b, 0.5, viewport).bearingDeg).toBeCloseTo(360, 6);
    // Far apart, the middle shows both cities.
    expect(flyCamera(a, b, 0.5, viewport).zoom).toBeLessThan(6);
  });
});
