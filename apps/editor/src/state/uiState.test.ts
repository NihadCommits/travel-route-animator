import { addGroup, createProject, renameItem } from '@travel-route-animator/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorStore } from './editorStore';
import { layoutStorage, loadUiState, rememberUiState, saveUiState } from './uiState';

const KEY = 'travel-route-animator:ui:p_1';

afterEach(() => vi.restoreAllMocks());

describe('loadUiState / saveUiState', () => {
  it('reads back what was saved', () => {
    saveUiState('p_1', { selectedId: 'g_1', collapsed: ['e_1'] });
    expect(loadUiState('p_1')).toEqual({ selectedId: 'g_1', collapsed: ['e_1'] });
    expect(loadUiState('p_2')).toBeUndefined();
  });

  it('ignores entries that are broken or have the wrong shape', () => {
    for (const raw of [
      '{',
      'null',
      '[]',
      '{"selectedId":1,"collapsed":[]}',
      '{"selectedId":null}',
    ]) {
      localStorage.setItem(KEY, raw);
      expect(loadUiState('p_1')).toBeUndefined();
    }
  });

  it('carries on when the browser blocks the storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveUiState('p_1', { selectedId: null, collapsed: [] })).not.toThrow();
    expect(loadUiState('p_1')).toBeUndefined();
    expect(layoutStorage.getItem('layout')).toBeNull();
  });
});

describe('layoutStorage', () => {
  it('hands over stored layouts and hides broken ones', () => {
    layoutStorage.setItem('layout', '{"tree":20,"center":60}');
    expect(layoutStorage.getItem('layout')).toBe('{"tree":20,"center":60}');
    for (const raw of ['{', 'null', '5']) {
      localStorage.setItem('layout', raw);
      expect(layoutStorage.getItem('layout')).toBeNull();
    }
  });
});

describe('rememberUiState', () => {
  it('writes when the selection or the closed items change, not on every edit', () => {
    const { project, id } = addGroup(createProject('Trip'), 'Hinreise');
    const { store } = createEditorStore(project, { save: () => Promise.resolve() });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const stop = rememberUiState(store, project.id);
    const key = `travel-route-animator:ui:${project.id}`;

    store.getState().select(id);
    store.getState().setExpanded(id, false);
    expect(JSON.parse(localStorage.getItem(key) ?? '')).toEqual({
      selectedId: id,
      collapsed: [id],
    });
    expect(setItem).toHaveBeenCalledTimes(2);

    store.getState().apply((p) => renameItem(p, id, 'Rückreise'));
    expect(setItem).toHaveBeenCalledTimes(2);

    stop();
    store.getState().select(null);
    expect(setItem).toHaveBeenCalledTimes(2);
  });
});
