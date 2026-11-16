import type { Widget } from '@travel-route-animator/core';
import { de } from '@/i18n/de';

/** What the inspector calls a block: its kind, and its text or caption when it has one. */
export function blockName(widget: Widget): string {
  const kind = de.overlays.kinds[widget.kind];
  const own = widget.kind === 'text' ? widget.text : widget.label;
  return own ? `${kind}: ${own}` : kind;
}
