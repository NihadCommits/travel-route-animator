/**
 * Undo/redo as a stack of earlier states. This only works because every edit produces a new,
 * immutable project object (see core/edit/operations.ts): going back is just "show the
 * previous object again", and unchanged parts are shared between entries, so 100 steps of a
 * large project cost little memory.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Key and time of the last commit, to merge rapid edits of the same thing into one step. */
  lastKey?: string;
  lastAt?: number;
}

export const HISTORY_LIMIT = 100;

/** Edits with the same key closer together than this count as one undo step (e.g. typing). */
export const COALESCE_MS = 1000;

export interface CommitOptions {
  /** Same key + short gap = same undo step. Typing "Lissabon" should not take 8 undos. */
  coalesceKey?: string;
  /**
   * How short the gap must be, default COALESCE_MS. A follow-up that arrives late but belongs
   * to the last step (the name for a point set on the map) passes Infinity: it merges as long
   * as nothing else was committed in between.
   */
  coalesceWindowMs?: number;
  now?: number;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function commit<T>(history: History<T>, next: T, options: CommitOptions = {}): History<T> {
  if (Object.is(next, history.present)) return history;
  const { coalesceKey, coalesceWindowMs = COALESCE_MS, now = Date.now() } = options;

  const continuesLastEdit =
    coalesceKey !== undefined &&
    coalesceKey === history.lastKey &&
    history.lastAt !== undefined &&
    now - history.lastAt < coalesceWindowMs;

  if (continuesLastEdit) {
    return { ...history, present: next, future: [], lastAt: now };
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    ...(coalesceKey !== undefined && { lastKey: coalesceKey }),
    lastAt: now,
  };
}

/**
 * Swaps the present without an undo step of its own, for data derived from it (a computed
 * route): it belongs to the edit the user made. Undo then returns to the previous state with
 * the route that fitted it, and a following edit still merges with the last one as before.
 */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history;
  return { ...history, present: next };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

export const canUndo = (history: History<unknown>) => history.past.length > 0;
export const canRedo = (history: History<unknown>) => history.future.length > 0;
