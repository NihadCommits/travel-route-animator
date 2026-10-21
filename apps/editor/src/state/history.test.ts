import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, commit, createHistory, HISTORY_LIMIT, redo, undo } from './history';

describe('history', () => {
  it('steps back and forth through edits', () => {
    let history = createHistory('a');
    history = commit(history, 'b', { now: 0 });
    history = commit(history, 'c', { now: 10_000 });

    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    expect(canUndo(history)).toBe(false);

    history = redo(history);
    history = redo(history);
    expect(history.present).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('drops the redo steps once something new is edited', () => {
    let history = commit(commit(createHistory(1), 2), 3);
    history = undo(undo(history));
    history = commit(history, 10);
    expect(history.present).toBe(10);
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe(1);
  });

  it('ignores a commit that changes nothing', () => {
    const history = createHistory({ x: 1 });
    expect(commit(history, history.present)).toBe(history);
  });

  it('merges quick edits of the same field into one step', () => {
    let history = createHistory('');
    for (const [index, text] of ['L', 'Li', 'Lis', 'Lissabon'].entries()) {
      history = commit(history, text, { coalesceKey: 'name:e1', now: index * 200 });
    }
    expect(history.present).toBe('Lissabon');
    expect(history.past).toEqual(['']);
  });

  it('starts a new step after a pause or when another field is edited', () => {
    let history = createHistory('a');
    history = commit(history, 'ab', { coalesceKey: 'name', now: 0 });
    history = commit(history, 'abc', { coalesceKey: 'name', now: 5000 });
    history = commit(history, 'abcd', { coalesceKey: 'label', now: 5100 });
    expect(history.past).toEqual(['a', 'ab', 'abc']);
  });

  it('never merges edits without a key', () => {
    let history = createHistory(0);
    history = commit(history, 1, { now: 0 });
    history = commit(history, 2, { now: 1 });
    expect(history.past).toEqual([0, 1]);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    let history = createHistory(0);
    for (let value = 1; value <= HISTORY_LIMIT + 20; value++) {
      history = commit(history, value);
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(20);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const history = createHistory('x');
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});
