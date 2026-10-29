import {
  computeRouteInputHash,
  editTrack,
  locateItem,
  refreshLocalRoutes,
  validateProject,
  type Added,
  type ComputedRoute,
  type Id,
  type LngLat,
  type Project,
  type RouteFailure,
  type RouterId,
  type ValidationIssue,
} from '@travel-route-animator/core';
import { createContext, useContext } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { createAutosave, type Autosave, type SaveStatus } from './autosave';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from './history';
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

/** The middle of the editor: the map to edit on, or the preview of the stage (M6). */
export type Workspace = 'edit' | 'preview';

/** How the preview plays. UI state like the map's, not part of the project. */
export interface PreviewSettings {
  /** Half draws a quarter of the pixels: enough to judge timing and framing, and smoother. */
  quality: 'half' | 'full';
  loop: boolean;
}

/** The visible part of the map, so the place search can prefer it. */
export interface MapView {
  center: LngLat;
  zoom: number;
}

/** Why a route job failed: what the server said, or that our own server did not answer. */
export type RouteJobFailure = RouteFailure | { error: 'server_down'; message: string };

/**
 * A road route on its way from the server, or why it could not be computed. Belongs to one
 * input hash: once the points change, a new job replaces it (see features/routing/routeSync).
 */
export interface RouteJob {
  inputHash: string;
  router: RouterId;
  state: 'waiting' | 'computing' | 'failed';
  failure?: RouteJobFailure;
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
  /** Road routes being computed or failed, by track. Not saved, not in the undo history. */
  routeJobs: Readonly<Record<Id, RouteJob>>;
  workspace: Workspace;
  preview: PreviewSettings;
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
  setWorkspace: (workspace: Workspace) => void;
  setPreview: (settings: Partial<PreviewSettings>) => void;
  retrySave: () => Promise<void>;
  /** Sets or (null) removes the route jobs of several tracks at once. */
  setRouteJobs: (jobs: Record<Id, RouteJob | null>) => void;
  /**
   * Stores a route from the server in its track, without an undo step, if it still fits the
   * track's points. Returns false for an outdated answer (the user moved a point meanwhile).
   */
  applyComputedRoute: (trackId: Id, route: ComputedRoute) => boolean;
  /** Asks again for a failed route, with the same or the other router. */
  retryRoute: (trackId: Id, router: RouterId) => void;
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
    function update(edited: History<Project>, select?: Id | null) {
      const current = get();
      if (edited === current.history) return;
      const history = withLocalRoutes(edited);
      const wanted = select === undefined ? current.selectedId : select;
      set({ history, selectedId: existingOrNull(history.present, wanted) });
      // Undo and redo are changes too: the server should always hold what the user sees.
      autosave.schedule(history.present);
    }

    return {
      // Routes missing in the file (older project, edited by hand) are there from the start.
      // Not saved until the next edit: opening a project should not write it.
      history: withLocalRoutes(createHistory(project)),
      // The project may have changed elsewhere since the last visit; keep only what still exists.
      selectedId: existingOrNull(project, ui?.selectedId ?? null),
      collapsed: new Set(ui?.collapsed.filter((id) => locateItem(project, id))),
      selectedWaypointId: null,
      mapTool: 'select',
      mapView: null,
      mapFocus: null,
      routeJobs: {},
      workspace: 'edit',
      preview: { quality: 'half', loop: true },
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
      setWorkspace: (workspace) => set({ workspace }),
      setPreview: (settings) => set({ preview: { ...get().preview, ...settings } }),
      retrySave: () => autosave.flush(),
      setRouteJobs(changes) {
        const routeJobs = { ...get().routeJobs };
        for (const [trackId, job] of Object.entries(changes)) {
          if (job) routeJobs[trackId] = job;
          else delete routeJobs[trackId];
        }
        set({ routeJobs });
      },
      applyComputedRoute(trackId, route) {
        const { history } = get();
        const location = locateItem(history.present, trackId);
        if (location?.kind !== 'track') return false;
        const { groupIndex, etappeIndex, trackIndex } = location;
        const track = history.present.groups[groupIndex]!.etappen[etappeIndex]!.tracks[trackIndex]!;
        if (computeRouteInputHash(track) !== route.inputHash) return false;
        update(
          replacePresent(
            history,
            editTrack(history.present, trackId, (t) => ({ ...t, computed: route })),
          ),
        );
        return true;
      },
      retryRoute(trackId, router) {
        const job = get().routeJobs[trackId];
        if (!job) return;
        get().setRouteJobs({ [trackId]: { inputHash: job.inputHash, router, state: 'waiting' } });
      },
    };
  });

  return { store, autosave };
}

/**
 * Planes, trains, ferries and straight lines get their route right with the edit, in the same
 * undo step, so the map never shows a stale line for them. Road routes need the server and
 * follow asynchronously (M4b).
 */
function withLocalRoutes(history: History<Project>): History<Project> {
  return replacePresent(history, refreshLocalRoutes(history.present, new Date().toISOString()));
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

/** The stage the selection belongs to (the stage itself or a track's), for preview and timeline. */
export function selectEtappeId(state: EditorState): Id | null {
  const project = state.history.present;
  const location = state.selectedId === null ? undefined : locateItem(project, state.selectedId);
  if (location?.kind !== 'etappe' && location?.kind !== 'track') return null;
  return project.groups[location.groupIndex]!.etappen[location.etappeIndex]!.id;
}
