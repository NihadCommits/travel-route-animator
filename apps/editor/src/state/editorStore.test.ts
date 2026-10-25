import {
  addGroup,
  createProject,
  removeItem,
  renameItem,
  type Project,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore } from './editorStore';

function setup() {
  const saved: Project[] = [];
  const save = vi.fn((project: Project) => {
    saved.push(project);
    return Promise.resolve();
  });
  const { store } = createEditorStore(createProject('Trip'), { save, autosaveDelayMs: 100 });
  return { store, save, saved, state: () => store.getState() };
}

describe('editor store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('applies edits and undoes and redoes them', () => {
    const { state } = setup();
    state().add((p) => addGroup(p, 'Outbound'));
    state().add((p) => addGroup(p, 'Day 4'));
    expect(state().history.present.groups.map((g) => g.name)).toEqual(['Outbound', 'Day 4']);

    state().undo();
    expect(state().history.present.groups.map((g) => g.name)).toEqual(['Outbound']);
    state().redo();
    expect(state().history.present.groups).toHaveLength(2);
  });

  it('selects a newly added item', () => {
    const { state } = setup();
    const id = state().add((p) => addGroup(p, 'Outbound'));
    expect(state().selectedId).toBe(id);
  });

  it('clears the selection when the selected item disappears', () => {
    const { state } = setup();
    const id = state().add((p) => addGroup(p, 'Outbound'));
    state().apply((p) => removeItem(p, id));
    expect(state().selectedId).toBeNull();

    state().undo();
    expect(state().history.present.groups).toHaveLength(1);
    state().select(id);
    expect(state().selectedId).toBe(id);
    state().undo();
    expect(state().selectedId).toBeNull();
  });

  it('starts with the remembered selection and closed items, as far as they still exist', () => {
    const { project, id } = addGroup(createProject('Trip'), 'Hinreise');
    const { store } = createEditorStore(project, {
      save: () => Promise.resolve(),
      ui: { selectedId: id, collapsed: [id, 'g_deleted'] },
    });
    expect(store.getState().selectedId).toBe(id);
    expect([...store.getState().collapsed]).toEqual([id]);

    const { store: stale } = createEditorStore(project, {
      save: () => Promise.resolve(),
      ui: { selectedId: 'g_deleted', collapsed: [] },
    });
    expect(stale.getState().selectedId).toBeNull();
  });

  it('opens and closes tree items without an undo step', () => {
    const { state } = setup();
    const id = state().add((p) => addGroup(p, 'Outbound'));
    state().setExpanded(id, false);
    expect(state().collapsed.has(id)).toBe(true);
    const closed = state().collapsed;
    state().setExpanded(id, false);
    expect(state().collapsed).toBe(closed);

    state().setExpanded(id, true);
    expect(state().collapsed.has(id)).toBe(false);
    state().undo();
    expect(state().history.present.groups).toHaveLength(0);
  });

  it('applies a change only if the project stays storable', () => {
    const { state } = setup();
    const before = state().history;

    const issues = state().applyIfValid((p) => renameItem(p, p.id, '  '));
    expect(issues.map((issue) => issue.path)).toEqual(['name']);
    expect(state().history).toBe(before);

    expect(state().applyIfValid((p) => renameItem(p, p.id, 'Portugal'))).toEqual([]);
    expect(state().history.present.name).toBe('Portugal');
    state().undo();
    expect(state().history.present.name).toBe('Trip');
  });

  it('forgets the chosen waypoint and the map tool when another item is selected', () => {
    const { state } = setup();
    const first = state().add((p) => addGroup(p, 'Outbound'));
    const second = state().add((p) => addGroup(p, 'Return'));
    state().select(first);
    state().selectWaypoint('w_1');
    state().setMapTool('add-point');

    state().select(first);
    expect(state()).toMatchObject({ selectedWaypointId: 'w_1', mapTool: 'add-point' });
    state().select(second);
    expect(state()).toMatchObject({ selectedWaypointId: null, mapTool: 'select' });
  });

  it('asks the map to show a point again, also the same one', () => {
    const { state } = setup();
    state().showOnMap([16.37, 48.21]);
    const first = state().mapFocus;
    state().showOnMap([16.37, 48.21]);
    expect(state().mapFocus).toEqual({ lngLat: [16.37, 48.21], seq: (first?.seq ?? 0) + 1 });
    expect(state().history.past).toHaveLength(0);
  });

  it('refuses to select something that does not exist', () => {
    const { state } = setup();
    state().select('g_unknown');
    expect(state().selectedId).toBeNull();
  });

  it('treats quick renames of the same item as one undo step', () => {
    const { state } = setup();
    const id = state().add((p) => addGroup(p, ''));
    for (const name of ['T', 'Ta', 'Tag', 'Tag 4']) {
      state().apply((p) => renameItem(p, id, name), { coalesceKey: `name:${id}` });
    }
    state().undo();
    expect(state().history.present.groups[0]!.name).toBe('');
  });

  it('saves the latest state automatically, including after undo', async () => {
    const { state, save, saved } = setup();
    state().add((p) => addGroup(p, 'Outbound'));
    state().add((p) => addGroup(p, 'Day 4'));
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved.at(-1)!.groups).toHaveLength(2);
    expect(state().saveStatus).toEqual({ state: 'saved' });

    state().undo();
    expect(state().saveStatus).toEqual({ state: 'pending' });
    await vi.advanceTimersByTimeAsync(100);
    expect(saved.at(-1)!.groups).toHaveLength(1);
  });

  it('does not save when nothing changed', async () => {
    const { state, save } = setup();
    state().undo();
    state().apply((p) => p);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });
});
