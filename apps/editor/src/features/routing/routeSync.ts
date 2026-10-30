import {
  computeRouteInputHash,
  needsRouter,
  MAX_ROUTE_WAYPOINTS,
  RouteFailureSchema,
  toRouteRequest,
  type ComputedRoute,
  type Id,
  type Project,
  type RouteRequest,
  type Track,
} from '@travel-route-animator/core';
import type { StoreApi } from 'zustand';
import { ApiError } from '@/lib/api';
import type { EditorState, RouteJob, RouteJobFailure } from '@/state/editorStore';

export interface RouteSyncOptions {
  computeRoute: (request: RouteRequest, signal: AbortSignal) => Promise<ComputedRoute>;
  /** Quiet time after the last change before asking: typing coordinates settles first. */
  delayMs?: number;
}

/** Tracks whose route comes from a router (road, cycling, walking, hiking) and has its points. */
function routedTracks(project: Project): Map<Id, Track> {
  const tracks = new Map<Id, Track>();
  for (const group of project.groups) {
    for (const etappe of group.etappen) {
      for (const track of etappe.tracks) {
        if (!needsRouter(track)) continue;
        tracks.set(track.id, track);
      }
    }
  }
  return tracks;
}

function failureOf(error: unknown): RouteJobFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ApiError) {
    const parsed = RouteFailureSchema.safeParse(error.body);
    // An answer, but not one about routing: treat it like an outage of the router.
    return parsed.success ? parsed.data : { error: 'unavailable', message };
  }
  // No answer at all: our own server is not running.
  return { error: 'server_down', message };
}

/**
 * Keeps road routes in step with the project: whenever a track's points or routing change, it
 * waits until the editing settles, asks the server once and stores the answer (without an undo
 * step, see applyComputedRoute). Fair use of the rate-limited routers (CLAUDE.md):
 *
 * - one request per track at a time; a newer change cancels the older request,
 * - after a failure nothing is asked again for the same points, only on "Erneut versuchen",
 * - unchanged routes (matching input hash) are never asked for.
 *
 * Planes, trains and ferries are not handled here; the store computes them with the edit.
 * Returns a function that stops everything.
 */
export function startRouteSync(
  store: StoreApi<EditorState>,
  { computeRoute, delayMs = 800 }: RouteSyncOptions,
): () => void {
  const timers = new Map<Id, ReturnType<typeof setTimeout>>();
  const running = new Map<Id, AbortController>();
  let syncing = false;

  function cancel(id: Id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    running.get(id)?.abort();
    running.delete(id);
  }

  function sync() {
    // Our own job updates below change the store too; they never need another pass.
    if (syncing) return;
    syncing = true;
    const startNow: Id[] = [];
    try {
      const { history, routeJobs, setRouteJobs } = store.getState();
      const tracks = routedTracks(history.present);
      const changes: Record<Id, RouteJob | null> = {};

      for (const id of Object.keys(routeJobs)) {
        const track = tracks.get(id);
        if (!track || track.computed?.inputHash === computeRouteInputHash(track)) {
          cancel(id);
          changes[id] = null;
        }
      }
      for (const [id, track] of tracks) {
        const inputHash = computeRouteInputHash(track);
        if (track.computed?.inputHash === inputHash) continue;
        const job = routeJobs[id];
        if (job?.inputHash !== inputHash) {
          cancel(id);
          changes[id] = { inputHash, router: 'ors', state: 'waiting' };
          timers.set(
            id,
            setTimeout(() => void run(id), delayMs),
          );
        } else if (job.state === 'waiting' && !timers.has(id) && !running.has(id)) {
          // Waiting without a timer of ours: the user asked again (retryRoute). No reason to wait.
          startNow.push(id);
        }
        // A failed job stays failed for these points: no retry loop against the router.
      }
      if (Object.keys(changes).length > 0) setRouteJobs(changes);
    } finally {
      syncing = false;
    }
    for (const id of startNow) void run(id);
  }

  async function run(id: Id) {
    timers.delete(id);
    const { history, routeJobs, setRouteJobs } = store.getState();
    const job = routeJobs[id];
    const track = routedTracks(history.present).get(id);
    if (!job || !track || computeRouteInputHash(track) !== job.inputHash) return;
    const settle = (next: RouteJob) => {
      if (store.getState().routeJobs[id]?.inputHash === job.inputHash) {
        store.getState().setRouteJobs({ [id]: next });
      }
    };

    if (track.waypoints.length > MAX_ROUTE_WAYPOINTS) {
      settle({
        ...job,
        state: 'failed',
        failure: { error: 'too_long', message: `More than ${MAX_ROUTE_WAYPOINTS} waypoints` },
      });
      return;
    }

    const controller = new AbortController();
    running.set(id, controller);
    setRouteJobs({ [id]: { inputHash: job.inputHash, router: job.router, state: 'computing' } });
    try {
      const route = await computeRoute(toRouteRequest(track, job.router), controller.signal);
      if (controller.signal.aborted) return;
      running.delete(id);
      // False when the points moved meanwhile; the next sync pass has asked for those already.
      store.getState().applyComputedRoute(id, route);
    } catch (error) {
      if (controller.signal.aborted) return;
      running.delete(id);
      settle({
        inputHash: job.inputHash,
        router: job.router,
        state: 'failed',
        failure: failureOf(error),
      });
    }
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (
      state.history.present !== previous.history.present ||
      state.routeJobs !== previous.routeJobs
    ) {
      sync();
    }
  });
  sync();

  return () => {
    unsubscribe();
    for (const id of new Set([...timers.keys(), ...running.keys()])) cancel(id);
  };
}
