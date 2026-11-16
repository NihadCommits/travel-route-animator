import type { Anchor, Widget } from '../model/overlays';

// Rows of blocks (M17): a block can stand right of another one (`after`), and the scene lays
// such a chain out as one row with a fixed gap, the way the counters always stood. A block that
// grows (12.345 km) then pushes its neighbour along instead of covering it.

/** The gap between blocks in a row, in reference pixels. */
export const ROW_GAP = 16;

/** Whether a block really stands in a row: its leader exists and the chain ends somewhere. */
function followsAnother(widget: Widget, byId: ReadonlyMap<string, Widget>): boolean {
  if (widget.after === undefined || !byId.has(widget.after)) return false;
  const seen = new Set([widget.id]);
  let at = byId.get(widget.after)!;
  for (;;) {
    // A loop has no first block; its blocks stand on their own places instead.
    if (seen.has(at.id)) return false;
    seen.add(at.id);
    if (at.after === undefined || !byId.has(at.after)) return true;
    at = byId.get(at.after)!;
  }
}

/**
 * The blocks of a stage as rows, each starting with a block that has a place of its own and
 * followed by the blocks right of it, in the stage's order. A block whose leader is gone, or
 * that stands in a loop, starts a row of its own.
 */
export function rowsOf(widgets: readonly Widget[]): Widget[][] {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const following = new Set(
    widgets.filter((widget) => followsAnother(widget, byId)).map((widget) => widget.id),
  );
  const behind = (leader: Widget): Widget[] =>
    widgets
      .filter((widget) => following.has(widget.id) && widget.after === leader.id)
      .flatMap((widget) => [widget, ...behind(widget)]);
  return widgets
    .filter((widget) => !following.has(widget.id))
    .map((root) => [root, ...behind(root)]);
}

/** The block itself and every block standing right of it, directly or further along. */
export function rowFrom(widgets: readonly Widget[], widgetId: string): Set<string> {
  const ids = new Set([widgetId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const widget of widgets) {
      if (widget.after !== undefined && ids.has(widget.after) && !ids.has(widget.id)) {
        ids.add(widget.id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * The offsets that put a block's box where it is now, measured from an anchor: the inverse of
 * the scene's placement. Used when a block leaves its row and keeps its place on screen.
 */
export function offsetsAt(
  anchor: Anchor,
  box: { left: number; top: number; width: number; height: number },
  layer: { width: number; height: number },
): Pick<Widget, 'dx' | 'dy'> {
  const dx = anchor.endsWith('left')
    ? box.left
    : anchor.endsWith('right')
      ? layer.width - box.left - box.width
      : box.left + box.width / 2 - layer.width / 2;
  const dy = anchor.startsWith('top')
    ? box.top
    : anchor.startsWith('bottom')
      ? layer.height - box.top - box.height
      : box.top + box.height / 2 - layer.height / 2;
  return { dx: Math.round(dx), dy: Math.round(dy) };
}
