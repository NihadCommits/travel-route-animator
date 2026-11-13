import {
  addEtappe,
  addGroup,
  addTrack,
  addWaypoint,
  createProject,
  editEtappe,
  editWaypoint,
  type ElevationRequest,
  type Project,
  type RouteElevation,
} from '@travel-route-animator/core';
import { describe, expect, it, vi } from 'vitest';
import { createEditorStore } from '@/state/editorStore';
import { startElevationSync } from './elevationSync';

/** A train from Salzburg to Linz; its route is computed locally, right with the edit. */
function trainTrip(showProfile: boolean) {
  const group = addGroup(createProject('Trip'), 'Tag 1');
  const stage = addEtappe(group.project, group.id, 'Westbahn');
  const train = addTrack(stage.project, stage.id, 'train');
  let project: Project = train.project;
  const ids: string[] = [];
  for (const [name, lngLat] of [
    ['Salzburg', [13.0456, 47.8131]],
    ['Linz', [14.2911, 48.2903]],
  ] as const) {
    const added = addWaypoint(project, train.id, { name, lngLat: [...lngLat] });
    project = added.project;
    ids.push(added.id);
  }
  if (showProfile) {
    project = editEtappe(project, stage.id, (e) => ({
      ...e,
      overlays: { ...e.overlays, elevationProfile: true },
    }));
  }
  return { project, trainId: train.id, stageId: stage.id, ids };
}

const heights: RouteElevation = { source: 'dem', stepM: 60, elevationsM: [424, 266] };

/** Resolves when the test says so, like a slow server. */
function deferred() {
  let resolve!: (value: RouteElevation) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<RouteElevation>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(showProfile = true) {
  const trip = trainTrip(showProfile);
  const { store } = createEditorStore(trip.project, { save: () => Promise.resolve() });
  const answers: ReturnType<typeof deferred>[] = [];
  const sampleElevation = vi.fn<
    (request: ElevationRequest, signal: AbortSignal) => Promise<RouteElevation>
  >(() => {
    const answer = deferred();
    answers.push(answer);
    return answer.promise;
  });
  const stop = startElevationSync(store, { sampleElevation });
  const train = () => store.getState().history.present.groups[0]!.etappen[0]!.tracks[0]!;
  const job = () => store.getState().elevationJobs[trip.trainId];
  return { ...trip, store, sampleElevation, answers, stop, train, job };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

describe('elevation sync', () => {
  it('asks for the heights of the profile track and stores them without an undo step', async () => {
    const { sampleElevation, answers, train, job, store, stop } = setup();
    expect(sampleElevation).toHaveBeenCalledTimes(1);
    const [request] = sampleElevation.mock.calls[0]!;
    expect(request.line).toEqual(train().computed!.geometry);
    expect(job()?.state).toBe('loading');

    answers[0]!.resolve(heights);
    await settle();
    expect(train().computed!.elevation).toEqual(heights);
    expect(job()).toBeUndefined();
    // Not an edit of the user's: undo has nothing to take back.
    expect(store.getState().history.past).toHaveLength(0);
    expect(sampleElevation).toHaveBeenCalledTimes(1);
    stop();
  });

  it('asks for nothing while the stage shows no heights', () => {
    const { sampleElevation, job, stop } = setup(false);
    expect(sampleElevation).not.toHaveBeenCalled();
    expect(job()).toBeUndefined();
    stop();
  });

  it('drops an answer for a route that changed meanwhile and asks for the new one', async () => {
    const { sampleElevation, answers, train, store, trainId, ids, stop } = setup();
    store
      .getState()
      .apply((p) => editWaypoint(p, trainId, ids[1]!, (w) => ({ ...w, lngLat: [14.3, 48.3] })));
    const firstSignal = sampleElevation.mock.calls[0]![1];
    expect(firstSignal.aborted).toBe(true);
    expect(sampleElevation).toHaveBeenCalledTimes(2);

    answers[0]!.resolve(heights);
    await settle();
    expect(train().computed!.elevation).toBeUndefined();
    answers[1]!.resolve(heights);
    await settle();
    expect(train().computed!.elevation).toEqual(heights);
    stop();
  });

  it('asks again when it is stopped and started anew, as React does in strict mode', async () => {
    const { sampleElevation, answers, store, train, stop } = setup();
    stop();
    expect(sampleElevation.mock.calls[0]![1].aborted).toBe(true);
    const restart = startElevationSync(store, { sampleElevation });
    expect(sampleElevation).toHaveBeenCalledTimes(2);
    answers[1]!.resolve(heights);
    await settle();
    expect(train().computed!.elevation).toEqual(heights);
    restart();
  });

  it('does not ask again for a route whose heights failed', async () => {
    const { sampleElevation, answers, job, store, stageId, stop } = setup();
    answers[0]!.reject(new Error('502'));
    await settle();
    expect(job()?.state).toBe('failed');
    // Another edit of the stage leaves the route as it is: no new request.
    store.getState().apply((p) => editEtappe(p, stageId, (e) => ({ ...e, name: 'Westbahn neu' })));
    await settle();
    expect(sampleElevation).toHaveBeenCalledTimes(1);
    stop();
  });
});
