import { describe, expect, it } from 'vitest';
import { addEtappe, addGroup } from '../edit/operations';
import { createProject } from '../model/factories';
import { validateProject } from '../model/validation';
import {
  addWidget,
  editWidget,
  etappeOfWidget,
  movedOffsets,
  placeForNewWidget,
  removeWidget,
} from './edit';

let counter = 0;
const ctx = {
  createId: (prefix: string) => `${prefix}_${++counter}`,
  now: () => '2026-11-16T00:00:00.000Z',
};

function stage() {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const etappe = addEtappe(group.project, group.id, 'Radtour');
  return { project: etappe.project, etappeId: etappe.id };
}

describe('overlay blocks', () => {
  it('adds blocks on their side, each above the one before, and keeps the project valid', () => {
    const { project, etappeId } = stage();
    const km = addWidget(project, etappeId, 'distance', ctx);
    const time = addWidget(km.project, etappeId, 'travelTime', ctx);
    const title = addWidget(time.project, etappeId, 'text', ctx);
    const widgets = title.project.groups[0]!.etappen[0]!.overlays.widgets;
    expect(widgets.map((w) => [w.kind, w.anchor, w.dx, w.dy])).toEqual([
      ['distance', 'bottom-left', 48, 44],
      ['travelTime', 'bottom-left', 48, 136],
      ['text', 'top-left', 48, 44],
    ]);
    expect(widgets[2]!.text).toBe('Text');
    expect(validateProject(title.project).success).toBe(true);
    expect(() => addWidget(project, 'nope', 'distance', ctx)).toThrow();
  });

  it('changes and removes a block wherever it is', () => {
    const { project, etappeId } = stage();
    const added = addWidget(project, etappeId, 'speed', ctx);
    expect(etappeOfWidget(added.project, added.id)).toBe(etappeId);
    const edited = editWidget(added.project, added.id, (w) => ({ ...w, unit: 'imperial' }));
    expect(edited.groups[0]!.etappen[0]!.overlays.widgets[0]!.unit).toBe('imperial');
    expect(editWidget(edited, 'nope', (w) => w)).toBe(edited);
    const removed = removeWidget(edited, added.id);
    expect(removed.groups[0]!.etappen[0]!.overlays.widgets).toEqual([]);
    expect(removeWidget(removed, added.id)).toBe(removed);
  });

  it('turns a drag on screen into offsets from the anchor', () => {
    expect(movedOffsets({ anchor: 'bottom-left', dx: 48, dy: 44 }, 10, -20)).toEqual({
      dx: 58,
      dy: 64,
    });
    expect(movedOffsets({ anchor: 'top-right', dx: 48, dy: 44 }, 10, 20)).toEqual({
      dx: 38,
      dy: 64,
    });
    expect(movedOffsets({ anchor: 'center', dx: 0, dy: 0 }, -15.4, 7.6)).toEqual({
      dx: -15,
      dy: 8,
    });
    expect(placeForNewWidget([], 'flag')).toEqual({ anchor: 'top-left', dx: 48, dy: 44 });
  });
});
