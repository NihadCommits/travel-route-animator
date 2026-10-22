import type { Id } from '@travel-route-animator/core';
import type { StoreApi } from 'zustand';
import type { EditorState } from './editorStore';

// localStorage access that never throws. The storage can be missing or blocked (private
// windows, blocked site data); the editor then just starts without the remembered state.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered this time; nothing the user needs to know about.
  }
}

/**
 * Storage for react-resizable-panels' useDefaultLayout. It parses what it reads without a
 * guard, so a broken entry (left over or edited by hand) is hidden from it.
 */
export const layoutStorage = {
  getItem(key: string): string | null {
    const raw = readStorage(key);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === 'object' && value !== null ? raw : null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    writeStorage(key, value);
  },
};

/** What the editor remembers per project between visits, in this browser only. */
export interface ProjectUiState {
  selectedId: Id | null;
  /** Tree items the user closed. */
  collapsed: Id[];
}

const uiStateKey = (projectId: Id) => `travel-route-animator:ui:${projectId}`;

export function loadUiState(projectId: Id): ProjectUiState | undefined {
  const raw = readStorage(uiStateKey(projectId));
  if (raw === null) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return isUiState(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveUiState(projectId: Id, state: ProjectUiState): void {
  writeStorage(uiStateKey(projectId), JSON.stringify(state));
}

/** Writes the selection and the closed tree items whenever they change. Returns the unsubscribe. */
export function rememberUiState(store: StoreApi<EditorState>, projectId: Id): () => void {
  return store.subscribe((state, previous) => {
    if (state.selectedId === previous.selectedId && state.collapsed === previous.collapsed) return;
    saveUiState(projectId, { selectedId: state.selectedId, collapsed: [...state.collapsed] });
  });
}

function isUiState(value: unknown): value is ProjectUiState {
  if (typeof value !== 'object' || value === null) return false;
  const { selectedId, collapsed } = value as Record<string, unknown>;
  return (
    (selectedId === null || typeof selectedId === 'string') &&
    Array.isArray(collapsed) &&
    collapsed.every((id) => typeof id === 'string')
  );
}
