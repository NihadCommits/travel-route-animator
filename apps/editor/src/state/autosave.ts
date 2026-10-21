export type SaveStatus =
  | { state: 'saved' }
  | { state: 'pending' }
  | { state: 'saving' }
  | { state: 'error'; message: string };

export interface AutosaveOptions<T> {
  save: (value: T) => Promise<unknown>;
  onStatus: (status: SaveStatus) => void;
  /** Quiet time after the last change before saving. */
  delayMs?: number;
}

export const AUTOSAVE_DELAY_MS = 800;

/**
 * Saves the latest value some time after the last change. Only one request is in flight at a
 * time; changes made meanwhile are saved right after it with the newest value, so responses
 * can never arrive out of order and overwrite newer work with older.
 */
export function createAutosave<T>({
  save,
  onStatus,
  delayMs = AUTOSAVE_DELAY_MS,
}: AutosaveOptions<T>) {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;

  async function run(): Promise<void> {
    timer = undefined;
    if (inFlight || !pending) return;
    const { value } = pending;
    pending = undefined;
    onStatus({ state: 'saving' });

    inFlight = save(value).then(
      () => {
        inFlight = undefined;
        if (pending) {
          onStatus({ state: 'pending' });
          return run();
        }
        onStatus({ state: 'saved' });
      },
      (error: unknown) => {
        inFlight = undefined;
        // Keep the newest unsaved value so "retry" and the next change pick it up.
        pending ??= { value };
        onStatus({
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return inFlight;
  }

  return {
    schedule(value: T) {
      pending = { value };
      onStatus({ state: inFlight ? 'saving' : 'pending' });
      clearTimeout(timer);
      timer = setTimeout(() => void run(), delayMs);
    },
    /** Saves immediately, e.g. for "retry" or before leaving the editor. */
    async flush() {
      clearTimeout(timer);
      await inFlight;
      await run();
    },
    hasUnsavedChanges: () => pending !== undefined || inFlight !== undefined,
    dispose() {
      clearTimeout(timer);
    },
  };
}

export type Autosave<T> = ReturnType<typeof createAutosave<T>>;
