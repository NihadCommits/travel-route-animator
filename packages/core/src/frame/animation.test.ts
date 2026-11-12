import { describe, expect, it } from 'vitest';
import { trip } from '../testing/trip';
import { compileTimeline, type Phase } from '../timeline/compileTimeline';
import { animationFrameAt, movingSecAt } from './animation';
import { computeFrameState } from './computeFrameState';

const phase = (kind: Phase['kind'], startSec: number, endSec: number): Phase => ({
  kind,
  startSec,
  endSec,
  fromM: 0,
  toM: 0,
});

describe('movingSecAt', () => {
  // Waits until 2 s, drives 3 s, holds 1 s at a stop, drives 2 s more and arrives at 8 s.
  const phases = [phase('move', 2, 5), phase('hold', 5, 6), phase('move', 6, 8)];

  it('counts only the time on the move', () => {
    expect([0, 2, 3.5, 5, 5.5, 6, 7, 8, 12].map((sec) => movingSecAt(phases, sec))).toEqual([
      0, 0, 1.5, 3, 3, 3, 4, 5, 5,
    ]);
  });

  it('follows the holds a stage plans at its stops', () => {
    const { project, etappeId } = trip({
      durationSec: 10,
      tracks: [
        {
          points: [
            ['A', [-9.0, 38.0], 1],
            ['B', [-8.9, 38.0], 2],
            ['C', [-8.7, 38.0]],
          ],
        },
      ],
    });
    const timeline = compileTimeline(project, etappeId);
    const moving = (frame: number) => computeFrameState(timeline, frame).tracks[0]!.movingSec;
    const hold = timeline.tracks[0]!.phases[2]!;
    const inHold = (sec: number) => Math.round((timeline.introSec + sec) * timeline.fps);
    expect(moving(inHold(0.5))).toBe(0);
    expect(moving(inHold(hold.startSec + 0.2))).toBeCloseTo(moving(inHold(hold.endSec - 0.2)), 9);
    expect(moving(timeline.durationInFrames - 1)).toBeCloseTo(7, 9);
  });
});

describe('animationFrameAt', () => {
  it('loops through the pictures by their own durations', () => {
    const durations = [100, 200, 100];
    expect(
      [0, 0.05, 0.1, 0.29, 0.3, 0.4, 0.45].map((sec) => animationFrameAt(durations, sec)),
    ).toEqual([0, 0, 1, 1, 2, 0, 0]);
  });

  it('plays very short pictures for 100 ms, as browsers do', () => {
    expect(animationFrameAt([0, 0, 0], 0.15)).toBe(1);
    expect(animationFrameAt([10, 20], 0.11)).toBe(1);
  });

  it('shows the first picture of a still image and before any time has passed', () => {
    expect(animationFrameAt([], 3)).toBe(0);
    expect(animationFrameAt([80], 3)).toBe(0);
    expect(animationFrameAt([80, 80], -1)).toBe(0);
  });
});
