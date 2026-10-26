import {
  locateItem,
  validateProject,
  type Added,
  type Id,
  type LngLat,
  type Project,
  type ValidationIssue,
} from '@travel-route-animator/core';
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { createAutosave, type Autosave, type SaveStatus } from './autosave';
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from './history';
import type { ProjectUiState } from './uiState';

export interface ApplyOptions {
  /** Merges quick edits of the same thing into one undo step (see history.ts). */
  coalesceKey?: string;
  /** How close together such edits must be; see CommitOptions in history.ts. */
  coalesceWindowMs?: number;
  /** Item to select afterwards; `null` clears the selection. Default: keep it. */
  select?: Id | null;
}

/** What a click on the map does: pick and drag points, or set a new point. */
export type MapTool = 'select' | 'add-point';

/** The visible part of the map, so the place search can prefer it. */
export interface MapView {
  center: LngLat;
  zoom: number;
}

export interface EditorState {
  history: History<Project>;
  selectedId: Id | null;
  // UI state of the edit map. None of it is part of the undo history or the project file.
  /** A waypoint of the selected track, highlighted on the map and in the list. */
  selectedWaypointId: Id | null;
  mapTool: MapTool;
  mapView: MapView | null;
  /** Asks the map to show a point; `seq` changes on every request, also for the same point. */
  mapFocus: { lngLat: LngLat; seq: number } | null;
  /** Tree items the user closed; everything else is shown open. Not part of the undo history. */
  collapsed: ReadonlySet<Id>;
  saveStatus: SaveStatus;

  /** Applies an edit (a pure function from core/edit) as one undoable step. */
  apply: (change: (project: Project) => Project, options?: ApplyOptions) => void;
  /**
   * Like apply, but only if the project stays storable (ADR 0004). Returns what is wrong
   * otherwise and leaves the project as it was.
   */
  applyIfValid: (
    change: (project: Project) => Project,
    options?: ApplyOptions,
  ) => ValidationIssue[];
  /** Applies an edit that creates an item and selects the new item. */
  add: (change: (project: Project) => Added) => Id;
  undo: () => void;
  redo: () => void;
  select: (id: Id | null) => void;
  setExpanded: (id: Id, open: boolean) => void;
  selectWaypoint: (id: Id | null) => void;
  setMapTool: (tool: MapTool) => void;
  setMapView: (view: MapView) => void;
  showOnMap: (lngLat: LngLat) => void;
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
      selectedWaypointId: null,
      mapTool: 'select',
      mapView: null,
      mapFocus: null,
      saveStatus: { state: 'saved' },

      apply(change, { coalesceKey, coalesceWindowMs, select } = {}) {
        const { history } = get();
        const options = {
          ...(coalesceKey !== undefined && { coalesceKey }),
          ...(coalesceWindowMs !== undefined && { coalesceWindowMs }),
        };
        update(commit(history, change(history.present), options), select);
      },
      applyIfValid(change, options) {
        const next = change(get().history.present);
        const result = validateProject(next);
        if (!result.success) return result.issues;
        // Commit the edited object itself, not Zod's parsed copy: unchanged groups, stages and
        // tracks keep their identity, which is what keeps re-renders and undo cheap.
        get().apply(() => next, options);
        return [];
      },
      add(change) {
        const { history } = get();
        const added = change(history.present);
        update(commit(history, added.project), added.id);
        return added.id;
      },
      undo: () => update(undo(get().history)),
      redo: () => update(redo(get().history)),
      select(id) {
        const selectedId = existingOrNull(get().history.present, id);
        if (selectedId === get().selectedId) return;
        // Points and the "set a point" tool belong to the track that was selected.
        set({ selectedId, selectedWaypointId: null, mapTool: 'select' });
      },
      setExpanded(id, open) {
        const { collapsed } = get();
        if (collapsed.has(id) !== open) return;
        const next = new Set(collapsed);
        if (open) next.delete(id);
        else next.add(id);
        set({ collapsed: next });
      },
      selectWaypoint: (selectedWaypointId) => set({ selectedWaypointId }),
      setMapTool: (mapTool) => set({ mapTool }),
      setMapView: (mapView) => set({ mapView }),
      showOnMap: (lngLat) => set({ mapFocus: { lngLat, seq: (get().mapFocus?.seq ?? 0) + 1 } }),
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
  return useStore(useEditorStore(), selector);
}

/**
 * The store itself, for code outside React's render cycle that must read the latest state,
 * e.g. map event handlers registered once.
 */
export function useEditorStore(): StoreApi<EditorState> {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error('useEditor must be used inside the editor screen');
  return store;
}

export const selectProject = (state: EditorState) => state.history.present;
export const selectCanUndo = (state: EditorState) => canUndo(state.history);
export const selectCanRedo = (state: EditorState) => canRedo(state.history);
