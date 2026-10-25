import {
  Accessibility,
  defaultPreset,
  PointerActivationConstraints,
  PointerSensor,
} from '@dnd-kit/dom';
import type { DragDropEventHandlers } from '@dnd-kit/react';

// Shared set-up for the sortable lists in the editor (project tree, waypoints). What we
// learned in M2: let dnd-kit move the item, but find the drop target ourselves.

// Start dragging only after the pointer has moved a few pixels. The default would also start
// after holding still for 200 ms, which turns a slow click on a row into a drag.
export const DND_SENSORS = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 6 })],
  }),
];

// dnd-kit's accessibility plugin would turn every row into a focusable role="button" with
// instructions for keyboard dragging. That breaks the lists' own keyboard handling (the tree's
// single tab stop and arrow keys, the inputs in a waypoint row), and there is no keyboard
// dragging here.
export const DND_PLUGINS = defaultPreset.plugins.filter((plugin) => plugin !== Accessibility);

export type DragOperation = Parameters<
  NonNullable<DragDropEventHandlers['onDragMove']>
>[0]['operation'];

export interface RowUnderPointer {
  id: string;
  element: HTMLElement;
  /** Pointer position within the row: 0 at the top, 1 at the bottom. */
  relativeY: number;
}

/**
 * The row under the pointer, marked by `attribute` (e.g. "data-tree-id"), other than the one
 * being dragged. Found by hit-testing ourselves: dnd-kit computes its collisions a frame later,
 * so at the moment of release its target can still be the row from the previous position. For
 * the same reason the position comes from the native pointer event when there is one; dnd-kit
 * updates its own only once per animation frame.
 */
export function rowUnderPointer(
  { source, position }: DragOperation,
  nativeEvent: Event | undefined,
  attribute: string,
): RowUnderPointer | null {
  if (!source) return null;
  const { x, y } =
    nativeEvent instanceof MouseEvent
      ? { x: nativeEvent.clientX, y: nativeEvent.clientY }
      : position.current;
  // The dragged row itself moves along under the pointer; look at what lies beneath it.
  for (const element of document.elementsFromPoint(x, y)) {
    const row = element.closest<HTMLElement>(`[${attribute}]`);
    const id = row?.getAttribute(attribute);
    if (!row || id == null || id === String(source.id)) continue;
    const rect = row.getBoundingClientRect();
    return { id, element: row, relativeY: rect.height > 0 ? (y - rect.top) / rect.height : 0.5 };
  }
  return null;
}
