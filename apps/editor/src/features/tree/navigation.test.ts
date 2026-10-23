import { addEtappe, addGroup, addTrack, createProject } from '@travel-route-animator/core';
import { describe, expect, it } from 'vitest';
import { navigate, visibleRows, type VisibleRow } from './navigation';

// Group A with stage a1 (one car) and an empty stage a2, then an empty group B.
function project() {
  let p = createProject('Trip');
  const a = addGroup(p, 'A');
  const a1 = addEtappe(a.project, a.id, 'a1');
  const car = addTrack(a1.project, a1.id, 'car');
  const a2 = addEtappe(car.project, a.id, 'a2');
  const b = addGroup(a2.project, 'B');
  p = b.project;
  return { p, ids: { a: a.id, a1: a1.id, car: car.id, a2: a2.id, b: b.id } };
}

describe('visibleRows', () => {
  it('lists the rows in display order and skips children of collapsed items', () => {
    const { p, ids } = project();
    expect(visibleRows(p, new Set()).map((row) => row.id)).toEqual([
      ids.a,
      ids.a1,
      ids.car,
      ids.a2,
      ids.b,
    ]);
    expect(visibleRows(p, new Set([ids.a1])).map((row) => row.id)).toEqual([
      ids.a,
      ids.a1,
      ids.a2,
      ids.b,
    ]);
    expect(visibleRows(p, new Set([ids.a])).map((row) => row.id)).toEqual([ids.a, ids.b]);
  });
});

describe('navigate', () => {
  const { p, ids } = project();
  const rows: VisibleRow[] = visibleRows(p, new Set());

  it('steps up and down through the visible rows and stops at the ends', () => {
    expect(navigate(rows, ids.a1, 'ArrowDown')).toEqual({ focus: ids.car });
    expect(navigate(rows, ids.a2, 'ArrowUp')).toEqual({ focus: ids.car });
    expect(navigate(rows, ids.b, 'ArrowDown')).toBeNull();
    expect(navigate(rows, ids.a, 'ArrowUp')).toBeNull();
  });

  it('jumps to the first and the last row', () => {
    expect(navigate(rows, ids.car, 'Home')).toEqual({ focus: ids.a });
    expect(navigate(rows, ids.car, 'End')).toEqual({ focus: ids.b });
  });

  it('opens a closed item first and steps into it on the next press', () => {
    const closed = visibleRows(p, new Set([ids.a1]));
    expect(navigate(closed, ids.a1, 'ArrowRight')).toEqual({ toggle: ids.a1, open: true });
    expect(navigate(rows, ids.a1, 'ArrowRight')).toEqual({ focus: ids.car });
  });

  it('does nothing on the right arrow for leaves and empty open items', () => {
    expect(navigate(rows, ids.car, 'ArrowRight')).toBeNull();
    expect(navigate(rows, ids.a2, 'ArrowRight')).toBeNull();
  });

  it('closes an open item first and steps out to the parent otherwise', () => {
    expect(navigate(rows, ids.a1, 'ArrowLeft')).toEqual({ toggle: ids.a1, open: false });
    expect(navigate(rows, ids.car, 'ArrowLeft')).toEqual({ focus: ids.a1 });
    const closed = visibleRows(p, new Set([ids.a1]));
    expect(navigate(closed, ids.a1, 'ArrowLeft')).toEqual({ focus: ids.a });
    expect(navigate(visibleRows(p, new Set([ids.a])), ids.a, 'ArrowLeft')).toBeNull();
  });

  it('ignores rows that are not shown', () => {
    expect(navigate(visibleRows(p, new Set([ids.a])), ids.car, 'ArrowDown')).toBeNull();
  });
});
