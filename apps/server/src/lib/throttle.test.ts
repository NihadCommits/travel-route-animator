import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createThrottle } from './throttle';

describe('createThrottle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts tasks at least one interval apart, in order', async () => {
    const run = createThrottle(1000);
    const started: number[] = [];
    const task = (name: number) => () => {
      started.push(name);
      return Promise.resolve(name);
    };

    const first = run(task(1));
    const second = run(task(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1]);
    await vi.advanceTimersByTimeAsync(999);
    expect(started).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toEqual([1, 2]);
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
  });

  it('drops a waiting task whose request was cancelled, without delaying the next one', async () => {
    const run = createThrottle(1000);
    const task = vi.fn(() => Promise.resolve('done'));
    const controller = new AbortController();

    void run(task);
    const cancelled = run(task, controller.signal);
    const assertion = expect(cancelled).rejects.toThrow(/aborted/);
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(1);

    const next = run(task);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(next).resolves.toBe('done');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('keeps going after a task failed', async () => {
    const run = createThrottle(10);
    await expect(run(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    const next = run(() => Promise.resolve('up'));
    await vi.advanceTimersByTimeAsync(10);
    await expect(next).resolves.toBe('up');
  });
});
