import { editTrack, type Track, type TrackTiming } from '@travel-route-animator/core';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useEditor } from '@/state/editorStore';
import { dragTiming, sameTiming, type BarSpan, type DragHandle } from './scale';

/** Every drag gets its own undo key, so two drags in a row stay two undo steps. */
let dragCount = 0;

export interface BarDragInput {
  track: Track;
  span: BarSpan;
  mainSec: number;
  fps: number;
  /** The whole video, intro and outro included: the lane's width stands for this. */
  totalSec: number;
}

/**
 * Dragging a timeline bar or one of its ends, and nudging it with the arrow keys. Every mouse
 * move goes into the store at once, so the preview follows while dragging, but all moves of
 * one drag merge into one undo step (coalesceKey with no time limit).
 */
export function useBarDrag({ track, span, mainSec, fps, totalSec }: BarDragInput) {
  const applyIfValid = useEditor((state) => state.applyIfValid);
  const select = useEditor((state) => state.select);

  const write = (timing: TrackTiming, coalesceKey?: string) =>
    applyIfValid(
      (project) => editTrack(project, track.id, (t) => ({ ...t, timing })),
      coalesceKey === undefined ? {} : { coalesceKey, coalesceWindowMs: Infinity },
    );

  function onPointerDown(event: PointerEvent<HTMLElement>, handle: DragHandle) {
    if (event.button !== 0) return;
    // The ends sit inside the bar; without this the bar would start a move as well.
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget;
    // preventDefault keeps the browser from selecting text, but also from focusing the bar;
    // with the focus there, the arrow keys nudge the bar that was just clicked.
    target.closest<HTMLElement>('[role="slider"]')?.focus();
    const lane = target.closest('[data-timeline-lane]');
    const width = lane?.getBoundingClientRect().width ?? 0;
    select(track.id);
    if (width <= 0) return;

    const { pointerId, clientX: originX } = event;
    const secPerPx = totalSec / width;
    const key = `timeline-drag:${(dragCount += 1)}`;
    let last = track.timing;
    target.setPointerCapture(pointerId);

    const onMove = (move: globalThis.PointerEvent) => {
      const timing = dragTiming(track.timing, span, handle, (move.clientX - originX) * secPerPx, {
        mainSec,
        fps,
        toFrames: move.shiftKey,
      });
      if (sameTiming(timing, last)) return;
      last = timing;
      write(timing, key);
    };
    const onEnd = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onEnd);
      target.removeEventListener('pointercancel', onEnd);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onEnd);
    target.addEventListener('pointercancel', onEnd);
  }

  /** Arrow keys move the bar by a tenth of a second, a second with Shift; one undo step each. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    const step = (event.shiftKey ? 1 : 0.1) * (event.key === 'ArrowLeft' ? -1 : 1);
    select(track.id);
    const timing = dragTiming(track.timing, span, 'move', step, { mainSec, fps, toFrames: false });
    if (!sameTiming(timing, track.timing)) write(timing);
  }

  return { onPointerDown, onKeyDown };
}
