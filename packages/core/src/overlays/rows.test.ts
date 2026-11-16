import { describe, expect, it } from 'vitest';
import { addEtappe, addGroup } from '../edit/operations';
import { createProject } from '../model/factories';
import type { Widget } from '../model/overlays';
import { validateProject } from '../model/validation';
import { addWidget, editWidget, placeOutOfRow, removeWidget } from './edit';
import { offsetsAt, rowFrom, rowsOf } from './rows';

const w = (id: string, extra: Partial<Widget> = {}): Widget => ({
  id,
  kind: 'distance',
  anchor: 'bottom-left',
  dx: 48,
  dy: 44,
  scale: 1,
  transition: 'none',
  ...extra,
});

describe('rows of blocks', () => {
  it('chains blocks behind their leader, in the order of the stage', () => {
    const widgets = [
      w('km'),
      w('clock', { after: 'time' }),
      w('time', { after: 'km' }),
      w('title', { anchor: 'top-left' }),
      w('speed', { after: 'km' }),
    ];
    expect(rowsOf(widgets).map((row) => row.map((widget) => widget.id))).toEqual([
      ['km', 'time', 'clock', 'speed'],
      ['title'],
    ]);
    expect([...rowFrom(widgets, 'time')]).toEqual(['time', 'clock']);
  });

  it('lets a block whose leader is gone or that stands in a loop start its own row', () => {
    const widgets = [w('a', { after: 'b' }), w('b', { after: 'a' }), w('c', { after: 'gone' })];
    expect(rowsOf(widgets).map((row) => row.map((widget) => widget.id))).toEqual([
      ['a'],
      ['b'],
      ['c'],
    ]);
  });

  it('keeps the row together when a block in it is removed', () => {
    const group = addGroup(createProject('Trip'), 'Tag 1');
    const stage = addEtappe(group.project, group.id, 'Radtour');
    const km = addWidget(stage.project, stage.id, 'distance');
    const time = addWidget(km.project, stage.id, 'travelTime');
    const clock = addWidget(time.project, stage.id, 'clock');
    let project = editWidget(clock.project, time.id, (x) => ({ ...x, after: km.id }));
    project = editWidget(project, clock.id, (x) => ({ ...x, after: time.id }));
    expect(validateProject(project).success).toBe(true);

    // Without the kilometres, the time takes their place and the clock stays right of it.
    const widgets = removeWidget(project, km.id).groups[0]!.etappen[0]!.overlays.widgets;
    expect(widgets.map((x) => [x.id, x.after, x.dy])).toEqual([
      [time.id, undefined, 44],
      [clock.id, time.id, 228],
    ]);
    // Without the time in the middle, the clock moves up to the kilometres.
    const middle = removeWidget(project, time.id).groups[0]!.etappen[0]!.overlays.widgets;
    expect(middle.map((x) => [x.id, x.after])).toEqual([
      [km.id, undefined],
      [clock.id, km.id],
    ]);
  });

  it('gives a block that leaves its row a place a step in from the row', () => {
    const widgets = [w('km', { dy: 80 }), w('time', { after: 'km' })];
    expect(placeOutOfRow(widgets, 'time')).toEqual({ anchor: 'bottom-left', dx: 48, dy: 172 });
    expect(placeOutOfRow(widgets, 'gone')).toBeUndefined();
  });

  it('finds the offsets that keep a box where it is, from any anchor', () => {
    const layer = { width: 1920, height: 1080 };
    const box = { left: 300, top: 900, width: 200, height: 76 };
    expect(offsetsAt('bottom-left', box, layer)).toEqual({ dx: 300, dy: 104 });
    expect(offsetsAt('top-right', box, layer)).toEqual({ dx: 1420, dy: 900 });
    expect(offsetsAt('center', box, layer)).toEqual({ dx: -560, dy: 398 });
  });
});
