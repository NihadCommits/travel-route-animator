/** Rejects like fetch does when its signal fires, so callers can treat both the same way. */
function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError');
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type Throttle = <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;

/**
 * Runs tasks one after another, starting each at least `intervalMs` after the previous one.
 * Free services like Photon and OSRM ask for at most about one request per second.
 *
 * A task whose signal fires while it waits in the queue is dropped before it runs. That
 * matters for search-as-you-type: the browser cancels the request for "Sil" once "Silv" is
 * typed, and the outdated request never reaches the service.
 */
export function createThrottle(intervalMs: number): Throttle {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  return function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const result = queue.then(async () => {
      signal?.throwIfAborted();
      const wait = lastStart + intervalMs - Date.now();
      if (wait > 0) await delay(wait, signal);
      lastStart = Date.now();
      return task();
    });
    // The next task waits for this one either way, also when it failed or was dropped.
    queue = result.catch(() => undefined);
    return result;
  };
}
