import {
  toElevationRequest,
  tracksAwaitingElevation,
  type ElevationRequest,
  type Id,
  type Project,
  type RouteElevation,
  type Track,
} from '@travel-route-animator/core';
import type { StoreApi } from 'zustand';
import { routeKeyOf, type EditorState, type ElevationJob } from '@/state/editorStore';

export interface ElevationSyncOptions {
  sampleElevation: (request: ElevationRequest, signal: AbortSignal) => Promise<RouteElevation>;
}

/** Every track of the project that needs heights and has a fresh route without them. */
function awaitingTracks(project: Project): Map<Id, Track> {
  const tracks = new Map<Id, Track>();
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      for (const track of tracksAwaitingElevation(etappe)) tracks.set(track.id, track);
    }
  }
  return tracks;
}

/**
 * Keeps heights in step with the routes (ADR 0012): once a stage shows its height profile or
 * stands on 3D terrain, the routes that need heights get them from the server and keep them in
 * the project (without an undo step, see applyElevation).
 *
 * - One request at a time: the tiles behind it are a free service.
 * - A failed route is not asked again until it changes; no retry loop.
 * - A route that changes while its heights load cancels the request.
 *
 * Returns a function that stops everything.
 */
export function startElevationSync(
  store: StoreApi<EditorState>,
  { sampleElevation }: ElevationSyncOptions,
): () => void {
  let running: { trackId: Id; routeKey: string; controller: AbortController } | undefined;
  let syncing = false;

  function sync() {
    if (syncing) return;
    syncing = true;
    try {
      const { history, elevationJobs, setElevationJobs } = store.getState();
      const tracks = awaitingTracks(history.present);
      const changes: Record<Id, ElevationJob | null> = {};
      // Jobs for routes that changed or need no heights any more are over.
      for (const [id, job] of Object.entries(elevationJobs)) {
        const track = tracks.get(id);
        if (!track?.computed || routeKeyOf(track.computed) !== job.routeKey) changes[id] = null;
      }
      if (running && changes[running.trackId] === null) {
        running.controller.abort();
        running = undefined;
      }
      if (Object.keys(changes).length > 0) setElevationJobs(changes);
      if (running) return;

      const current = store.getState().elevationJobs;
      const next = [...tracks.values()].find((track) => !current[track.id]);
      if (next) void run(next);
    } finally {
      syncing = false;
    }
  }

  async function run(track: Track) {
    const request = toElevationRequest(track);
    if (!request || !track.computed) return;
    const routeKey = routeKeyOf(track.computed);
    const controller = new AbortController();
    running = { trackId: track.id, routeKey, controller };
    store.getState().setElevationJobs({ [track.id]: { routeKey, state: 'loading' } });
    try {
      const elevation = await sampleElevation(request, controller.signal);
      if (controller.signal.aborted) return;
      running = undefined;
      // Stored, the track no longer awaits heights and its job is cleared on the next pass.
      if (!store.getState().applyElevation(track.id, routeKey, elevation)) sync();
    } catch {
      if (controller.signal.aborted) return;
      running = undefined;
      store.getState().setElevationJobs({ [track.id]: { routeKey, state: 'failed' } });
    }
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.history.present !== previous.history.present ||
      state.elevationJobs !== previous.elevationJobs
    ) {
      sync();
    }
  });
  sync();

  return () => {
    unsubscribe();
    if (!running) return;
    running.controller.abort();
    // Not loading any more: a sync started after this one (React's strict mode starts every
    // effect twice) must ask again instead of waiting for an answer that never comes.
    store.getState().setElevationJobs({ [running.trackId]: null });
    running = undefined;
  };
}
