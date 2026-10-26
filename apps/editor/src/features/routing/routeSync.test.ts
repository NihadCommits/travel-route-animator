import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  assembleComputedRoute,
  createProject,
  editWaypoint,
  isRouteStale,
  type ComputedRoute,
  type LngLat,
  type Project,
  type RouteRequest,
} from '@travel-route-animator/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { createEditorStore } from '@/state/editorStore';
import { startRouteSync } from './routeSync';

const DELAY = 800;

/** A car from Lisboa via Silves to Faro, its road route not computed yet. */
function carTrip(
  points: LngLat[] = [
    [-9.1393, 38.7223],
    [-8.4385, 37.1889],
    [-7.9304, 37.0194],
  ],
) {
  const group = addGroup(createProject('Trip'), 'Tag 4');
  const stage = addEtappe(group.project, group.id, 'Algarve');
  const car = addTrack(stage.project, stage.id, 'car');
  let project: Project = car.project;
  const ids: string[] = [];
  for (const [i, lngLat] of points.entries()) {
    const added = addWaypoint(project, car.id, { name: `P${i}`, lngLat });
    project = added.project;
    ids.push(added.id);
  }
  return { project, carId: car.id, ids };
}

/** What the server answers: straight legs, as if a router had found them. */
function routeFor(request: RouteRequest, provider = 'ors'): ComputedRoute {
  const legs = request.waypoints.slice(1).map((to, i) => ({
    line: [request.waypoints[i]!.lngLat, to.lngLat],
    distanceM: 1000,
    durationS: 60,
  }));
  return assembleComputedRoute(request, { provider, legs }, '2026-10-27T10:00:00.000Z');
}

function setup(points?: LngLat[]) {
  const trip = carTrip(points);
  const { store } = createEditorStore(trip.project, { save: () => Promise.resolve() });
  const computeRoute = vi.fn<
    (request: RouteRequest, signal: AbortSignal) => Promise<ComputedRoute>
  >((request) => Promise.resolve(routeFor(request, request.router ?? 'ors')));
  const stop = startRouteSync(store, { computeRoute, delayMs: DELAY });
  const car = () => store.getState().history.present.groups[0]!.etappen[0]!.tracks[0]!;
  const job = () => store.getState().routeJobs[trip.carId];
  const move = (index: number, lngLat: LngLat) =>
    store
      .getState()
      .apply((p) => editWaypoint(p, trip.carId, trip.ids[index]!, (w) => ({ ...w, lngLat })));
  return { ...trip, store, computeRoute, stop, car, job, move };
}

describe('road route sync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the server once the editor is open and stores the answer without an undo step', async () => {
    const { computeRoute, car, job, store } = setup();
    expect(job()?.state).toBe('waiting');
    expect(computeRoute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(computeRoute).toHaveBeenCalledTimes(1);
    // Only what the route depends on, no names or holds.
    expect(computeRoute.mock.calls[0]![0]).toEqual({
      waypoints: car().waypoints.map(({ id, lngLat, kind }) => ({ id, lngLat, kind })),
      routing: { mode: 'road' },
    });
    expect(isRouteStale(car())).toBe(false);
    expect(car().computed?.provider).toBe('ors');
    expect(job()).toBeUndefined();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('waits until quick edits settle and asks only for the last state', async () => {
    const { computeRoute, move, car } = setup();
    await vi.advanceTimersByTimeAsync(DELAY);
    move(1, [-8.5, 37.2]);
    await vi.advanceTimersByTimeAsync(300);
    move(1, [-8.55, 37.25]);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(computeRoute).toHaveBeenCalledTimes(2);
    expect(computeRoute.mock.calls[1]![0].waypoints[1]!.lngLat).toEqual([-8.55, 37.25]);
    expect(isRouteStale(car())).toBe(false);
  });

  it('cancels a request that a newer change overtook and ignores its answer', async () => {
    const { computeRoute, move, car } = setup();
    let answer: (route: ComputedRoute) => void = () => undefined;
    computeRoute.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          answer = () => resolve(routeFor(request));
        }),
    );
    await vi.advanceTimersByTimeAsync(DELAY);
    const firstSignal = computeRoute.mock.calls[0]![1];

    move(2, [-7.8, 37.05]);
    expect(firstSignal.aborted).toBe(true);
    answer(routeFor(computeRoute.mock.calls[0]![0]));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(computeRoute).toHaveBeenCalledTimes(2);
    expect(car().computed?.geometry.at(-1)).toEqual([-7.8, 37.05]);
  });

  it('asks nothing again after a failure until the user retries, also with OSRM', async () => {
    const { computeRoute, job, store, carId } = setup();
    computeRoute.mockRejectedValueOnce(
      new ApiError(429, { error: 'quota', message: 'openrouteservice quota is used up' }),
    );
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(job()).toMatchObject({ state: 'failed', failure: { error: 'quota' } });

    // Unrelated changes do not trigger another request against a rate-limited service.
    store.getState().select(carId);
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(computeRoute).toHaveBeenCalledTimes(1);

    store.getState().retryRoute(carId, 'osrm');
    await vi.advanceTimersByTimeAsync(0);
    expect(computeRoute).toHaveBeenCalledTimes(2);
    expect(computeRoute.mock.calls[1]![0].router).toBe('osrm');
    expect(
      store.getState().history.present.groups[0]!.etappen[0]!.tracks[0]!.computed?.provider,
    ).toBe('osrm');
  });

  it('tells a stopped local server apart from a router that is down', async () => {
    const { computeRoute, job } = setup();
    computeRoute.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(job()?.failure).toEqual({ error: 'server_down', message: 'Failed to fetch' });
  });

  it('needs no request after undo, when the earlier route still fits', async () => {
    const { computeRoute, move, store, car } = setup();
    await vi.advanceTimersByTimeAsync(DELAY);
    const first = car().computed;
    move(1, [-8.5, 37.2]);
    await vi.advanceTimersByTimeAsync(DELAY);
    store.getState().undo();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(car().computed).toBe(first);
    expect(computeRoute).toHaveBeenCalledTimes(2);
  });

  it('refuses more waypoints than openrouteservice takes, without asking', async () => {
    const many = Array.from({ length: 51 }, (_, i): LngLat => [-9 + i * 0.01, 38.7]);
    const { computeRoute, job } = setup(many);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(computeRoute).not.toHaveBeenCalled();
    expect(job()).toMatchObject({ state: 'failed', failure: { error: 'too_long' } });
  });

  it('stops waiting and cancels when the editor closes', async () => {
    const { computeRoute, stop } = setup();
    stop();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(computeRoute).not.toHaveBeenCalled();
  });
});
