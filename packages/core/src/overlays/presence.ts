import type { Widget } from '../model/overlays';

// When a block is on screen (M17), shared by the scene that draws it and the files for the
// edit (M18) that carry its values: both must agree on the frames a block is there.

/** How long a block takes to fade or slide in and out. */
export const TRANSITION_SEC = 0.4;

/** 0 to 1: how far a block is in, from its time window and transition. */
export function presenceOf(widget: Widget, sec: number): number {
  const from = widget.fromSec ?? Number.NEGATIVE_INFINITY;
  const to = widget.toSec ?? Number.POSITIVE_INFINITY;
  if (sec < from || sec > to) return 0;
  if (widget.transition === 'none') return 1;
  return Math.min(1, (sec - from) / TRANSITION_SEC, (to - sec) / TRANSITION_SEC);
}
