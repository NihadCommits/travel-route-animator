import { locateItem, type Added, type Id, type Project } from '@travel-route-animator/core';
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { createAutosave, type Autosave, type SaveStatus } from './autosave';
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history';
import type { ProjectUiState } from './uiState';

export interface ApplyOptions {
  /** Merges quick edits of the same thing into one undo step (see history.ts). */
  coalesceKey?: string;
  /** Item to select afterwards; `null` clears the selection. Default: keep it. */
  select?: Id | null;
}

export interface EditorState {
  history: History<Project>;
  selectedId: Id | null;
  /** Tree items the user closed; everything else is shown open. Not part of the undo history. */
  collapsed: ReadonlySet<Id>;
  saveStatus: SaveStatus;

  /** Applies an edit (a pure function from core/edit) as one undoable step. */
  apply: (change: (project: Project) => Project, options?: ApplyOptions) => void;
  /** Applies an edit that creates an item and selects the new item. */
  add: (change: (project: Project) => Added) => Id;
  undo: () => void;
  redo: () => void;
  select: (id: Id | null) => void;
  setExpanded: (id: Id, open: boolean) => void;
  retrySave: () => Promise<void>;
}

export interface EditorStoreOptions {
  save: (project: Project) => Promise<unknown>;
  autosaveDelayMs?: number;
  /** Selection and closed tree items from the last visit (see uiState.ts). */
  ui?: ProjectUiState | undefined;
}

export interface EditorStore {
  store: StoreApi<EditorState>;
  autosave: Autosave<Project>;
}

/** One store per open project; the editor screen creates it after loading the project. */
export function createEditorStore(
  project: Project,
  { save, autosaveDelayMs, ui }: EditorStoreOptions,
): EditorStore {
  const autosave = createAutosave<Project>({
    save,
    // Only called after a change, i.e. once the store below exists.
    onStatus: (saveStatus) => store.setState({ saveStatus }),
    ...(autosaveDelayMs !== undefined && { delayMs: autosaveDelayMs }),
  });

  const store = createStore<EditorState>()((set, get) => {
    function update(history: History<Project>, select?: Id | null) {
      const current = get();
      if (history === current.history) return;
      const wanted = select === undefined ? current.selectedId : select;
      set({ history, selectedId: existingOrNull(history.present, wanted) });
      // Undo and redo are changes too: the server should always hold what the user sees.
      autosave.schedule(history.present);
    }

    return {
      history: createHistory(project),
      // The project may have changed elsewhere since the last visit; keep only what still exists.
      selectedId: existingOrNull(project, ui?.selectedId ?? null),
      collapsed: new Set(ui?.collapsed.filter((id) => locateItem(project, id))),
      saveStatus: { state: 'saved' },

      apply(change, { coalesceKey, select } = {}) {
        const { history } = get();
        update(
          commit(history, change(history.present), coalesceKey ? { coalesceKey } : {}),
          select,
        );
      },
      add(change) {
        const { history } = get();
        const added = change(history.present);
        update(commit(history, added.project), added.id);
        return added.id;
      },
      undo: () => update(undo(get().history)),
      redo: () => update(redo(get().history)),
      select: (id) => set({ selectedId: existingOrNull(get().history.present, id) }),
      setExpanded(id, open) {
        const { collapsed } = get();
        if (collapsed.has(id) !== open) return;
        const next = new Set(collapsed);
        if (open) next.delete(id);
        else next.add(id);
        set({ collapsed: next });
      },
      retrySave: () => autosave.flush(),
    };
  });

  return { store, autosave };
}

/** A selection must point at something that exists; after undoing an "add" it may not. */
function existingOrNull(project: Project, id: Id | null): Id | null {
  return id !== null && locateItem(project, id) ? id : null;
}

// ---------- React access ----------

export const EditorStoreContext = createContext<StoreApi<EditorState> | null>(null);

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditor must be used inside the editor screen');
  return useStore(store, selector);
}

export const selectProject = (state: EditorState) => state.history.present;
export const selectCanUndo = (state: EditorState) => canUndo(state.history);
export const selectCanRedo = (state: EditorState) => canRedo(state.history);
