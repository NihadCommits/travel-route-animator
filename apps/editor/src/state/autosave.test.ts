import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave, type SaveStatus } from './autosave';

/** A save function whose requests the test resolves or rejects by hand. */
function controllableSave() {
  const requests: { value: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        requests.push({ value, resolve, reject });
      }),
  );
  return { save, requests };
}

describe('createAutosave', () => {
  let statuses: SaveStatus['state'][];
  const onStatus = (status: SaveStatus) => statuses.push(status.state);

  beforeEach(() => {
    vi.useFakeTimers();
    statuses = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves once, after a quiet period, with the latest value', async () => {
    const { save, requests } = controllableSave();
    const autosave = createAutosave({ save, onStatus, delayMs: 800 });

    autosave.schedule('a');
    await vi.advanceTimersByTimeAsync(500);
    autosave.schedule('ab');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(requests[0]!.value).toBe('ab');

    requests[0]!.resolve();
    await vi.runAllTimersAsync();
    expect(statuses.at(-1)).toBe('saved');
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it('never runs two saves at once and sends the newest value afterwards', async () => {
    const { save, requests } = controllableSave();
    const autosave = createAutosave({ save, onStatus, delayMs: 100 });

    autosave.schedule('v1');
    await vi.advanceTimersByTimeAsync(100);
    autosave.schedule('v2');
    autosave.schedule('v3');
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);

    requests[0]!.resolve();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(2);
    expect(requests[1]!.value).toBe('v3');

    requests[1]!.resolve();
    await vi.runAllTimersAsync();
    expect(statuses.at(-1)).toBe('saved');
  });

  it('reports an error, keeps the change and saves it on retry', async () => {
    const { save, requests } = controllableSave();
    const errors: string[] = [];
    const autosave = createAutosave({
      save,
      onStatus: (status) => status.state === 'error' && errors.push(status.message),
      delayMs: 100,
    });

    autosave.schedule('important');
    await vi.advanceTimersByTimeAsync(100);
    requests[0]!.reject(new Error('Server not reachable'));
    await vi.runAllTimersAsync();
    expect(errors).toEqual(['Server not reachable']);
    expect(autosave.hasUnsavedChanges()).toBe(true);

    const retry = autosave.flush();
    await vi.runAllTimersAsync();
    expect(requests[1]!.value).toBe('important');
    requests[1]!.resolve();
    await retry;
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it('prefers a newer change over the failed value', async () => {
    const { save, requests } = controllableSave();
    const autosave = createAutosave({ save, onStatus, delayMs: 100 });

    autosave.schedule('old');
    await vi.advanceTimersByTimeAsync(100);
    autosave.schedule('new');
    requests[0]!.reject(new Error('boom'));
    await vi.runAllTimersAsync();

    // The newer change was already waiting, so it is saved without a manual retry.
    expect(requests).toHaveLength(2);
    expect(requests[1]!.value).toBe('new');
    requests[1]!.resolve();
    await vi.runAllTimersAsync();
    expect(statuses.at(-1)).toBe('saved');
  });

  it('can save right away', async () => {
    const { save, requests } = controllableSave();
    const autosave = createAutosave({ save, onStatus, delayMs: 10_000 });
    autosave.schedule('now');
    const flushed = autosave.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledWith('now');
    requests[0]!.resolve();
    await flushed;
  });
});
