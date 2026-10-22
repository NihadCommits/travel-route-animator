import { createProject, type Project } from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { dropPositionFor, resolveDrop, type DropTarget } from './drop';

// Two groups: A with stages a1, a2, a3 (a1 has tracks t1, t2), B with b1, and an empty group C.
function project(): Project {
  const base = createProject('Trip');
  const etappe = (id: string, trackIds: string[] = []) => ({
    id,
    name: id,
    durationSec: 8,
    view: {
      mode: '2d' as const,
      pitchDeg: 0,
      bearingDeg: 0,
      camera: {
        mode: 'follow-all' as const,
        paddingPx: 80,
        lagSec: 0,
        startWithOverview: false,
        endWithOverview: false,
      },
      terrain: { enabled: false, exaggeration: 1 },
      buildings3d: false,
    },
    intro: { type: 'none' as const },
    outro: { type: 'none' as const },
    overlays: { labels: true, distanceCounter: false, timeCounter: false, attribution: true },
    tracks: trackIds.map((trackId) => ({
      id: trackId,
      vehicle: { type: 'car' as const, variant: 'car-default' },
      routing: { mode: 'road' as const },
      waypoints: [],
      timing: { startOffsetSec: 0, easing: 'linear' as const },
      style: {
        lineColor: '#E4572E',
        lineWidthPx: 6,
        lineDash: 'solid' as const,
        futureRoute: 'ghost' as const,
        glow: false,
        vehicleScale: 1,
      },
    })),
  });
  return {
    ...base,
    groups: [
      { id: 'A', name: 'A', etappen: [etappe('a1', ['t1', 't2']), etappe('a2'), etappe('a3')] },
      { id: 'B', name: 'B', etappen: [etappe('b1')] },
      { id: 'C', name: 'C', etappen: [] },
    ],
  };
}

function drop(dragged: string, target: DropTarget) {
  const p = project();
  const change = resolveDrop(p, dragged, target);
  return change && change(p);
}

const stagesOf = (p: Project | undefined, group: number) =>
  p?.groups[group]!.etappen.map((e) => e.id);

describe('dropPositionFor', () => {
  it('splits a row into an upper and a lower half', () => {
    expect(dropPositionFor('etappe', 'etappe', 0.2)).toBe('before');
    expect(dropPositionFor('etappe', 'etappe', 0.8)).toBe('after');
    expect(dropPositionFor('group', 'group', 0.4)).toBe('before');
  });

  it('puts a stage dropped on a group into that group', () => {
    expect(dropPositionFor('etappe', 'group', 0.1)).toBe('inside');
  });

  it('refuses drops that make no sense', () => {
    expect(dropPositionFor('group', 'etappe', 0.5)).toBeNull();
    expect(dropPositionFor('track', 'etappe', 0.5)).toBeNull();
    expect(dropPositionFor('etappe', 'track', 0.5)).toBeNull();
  });
});

describe('resolveDrop', () => {
  it('reorders stages within a group, downwards and upwards', () => {
    expect(stagesOf(drop('a1', { id: 'a3', position: 'after' }), 0)).toEqual(['a2', 'a3', 'a1']);
    expect(stagesOf(drop('a1', { id: 'a3', position: 'before' }), 0)).toEqual(['a2', 'a1', 'a3']);
    expect(stagesOf(drop('a3', { id: 'a1', position: 'before' }), 0)).toEqual(['a3', 'a1', 'a2']);
  });

  it('moves a stage next to a stage of another group', () => {
    const result = drop('a2', { id: 'b1', position: 'before' });
    expect(stagesOf(result, 0)).toEqual(['a1', 'a3']);
    expect(stagesOf(result, 1)).toEqual(['a2', 'b1']);
  });

  it('moves a stage into a group, also an empty one', () => {
    expect(stagesOf(drop('a1', { id: 'B', position: 'inside' }), 1)).toEqual(['b1', 'a1']);
    expect(stagesOf(drop('a1', { id: 'C', position: 'inside' }), 2)).toEqual(['a1']);
  });

  it('moves a stage to the end of its own group when dropped on that group', () => {
    expect(stagesOf(drop('a1', { id: 'A', position: 'inside' }), 0)).toEqual(['a2', 'a3', 'a1']);
  });

  it('reorders groups', () => {
    const result = drop('C', { id: 'A', position: 'before' });
    expect(result?.groups.map((g) => g.id)).toEqual(['C', 'A', 'B']);
  });

  it('reorders the vehicles of a stage', () => {
    const result = drop('t1', { id: 't2', position: 'after' });
    expect(result?.groups[0]!.etappen[0]!.tracks.map((t) => t.id)).toEqual(['t2', 't1']);
  });

  it('returns nothing for drops that change nothing', () => {
    const p = project();
    expect(resolveDrop(p, 'a1', { id: 'a1', position: 'after' })).toBeUndefined();
    expect(resolveDrop(p, 'a1', { id: 'a2', position: 'before' })).toBeUndefined();
    expect(resolveDrop(p, 'a3', { id: 'A', position: 'inside' })).toBeUndefined();
    expect(resolveDrop(p, 'A', { id: 'B', position: 'before' })).toBeUndefined();
    expect(resolveDrop(p, 't2', { id: 't1', position: 'after' })).toBeUndefined();
  });

  it('refuses drops the tree does not support', () => {
    const p = project();
    expect(resolveDrop(p, 'A', { id: 'a1', position: 'before' })).toBeUndefined();
    expect(resolveDrop(p, 'a1', { id: 't1', position: 'before' })).toBeUndefined();
    expect(resolveDrop(p, 'missing', { id: 'a1', position: 'before' })).toBeUndefined();
  });
});
