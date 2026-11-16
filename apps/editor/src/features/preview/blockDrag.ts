import { useRef, type PointerEvent, type MouseEvent } from 'react';

// Dragging overlay blocks in the preview (M17). The scene draws its blocks without pointer
// events, so the map and the player stay as they are; the preview finds a block under the
// pointer by its box instead. While dragging, only the picture moves (CSS translate on the
// block); the project changes once, on release, as one undo step.

const BLOCK = '[data-widget-id]';
/** Below this many screen pixels a press is a click (play/pause), not a drag. */
const DRAG_THRESHOLD_PX = 3;

/** The topmost block under a point on screen, if any. */
export function blockAt(container: Element, x: number, y: number): HTMLElement | undefined {
  const blocks = [...container.querySelectorAll<HTMLElement>(BLOCK)];
  // Later blocks are drawn on top of earlier ones.
  return blocks.reverse().find((block) => {
    const rect = block.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
}

/**
 * Screen pixels per reference pixel: the blocks' layer is laid out in reference pixels and
 * scaled twice on the way to the screen, by the scene and by the player.
 */
export function screenScaleOf(block: HTMLElement): number {
  // The layer the scene marks; a block in a row sits a level deeper.
  const layer = block.closest<HTMLElement>('[data-overlay-layer]') ?? block.parentElement;
  if (!layer || layer.offsetWidth === 0) return 1;
  return layer.getBoundingClientRect().width / layer.offsetWidth;
}

/** Where a dropped block's box is in the blocks' layer, all in reference pixels. */
export interface DroppedBox {
  box: { left: number; top: number; width: number; height: number };
  layer: { width: number; height: number };
}

function droppedBoxOf(block: HTMLElement, scale: number): DroppedBox {
  const layer = block.closest<HTMLElement>('[data-overlay-layer]') ?? block.parentElement!;
  const at = layer.getBoundingClientRect();
  const rect = block.getBoundingClientRect();
  return {
    box: {
      left: (rect.left - at.left) / scale,
      top: (rect.top - at.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    },
    layer: { width: layer.offsetWidth, height: layer.offsetHeight },
  };
}

interface Drag {
  block: HTMLElement;
  widgetId: string;
  startX: number;
  startY: number;
  scale: number;
  moved: boolean;
}

/**
 * Pointer handlers for the element around the player. `onDrop` gets the block's ID, how far it
 * went in reference pixels (right and down on screen) and where its box ended up, for a block
 * that leaves a row and needs a place of its own.
 */
export function useBlockDrag(
  onDrop: (widgetId: string, deltaX: number, deltaY: number, dropped: DroppedBox) => void,
) {
  const drag = useRef<Drag | null>(null);
  /** Set after a drag, so the click that ends it does not also start or stop playing. */
  const swallowClick = useRef(false);

  const deltaOf = (current: Drag, event: PointerEvent) => [
    (event.clientX - current.startX) / current.scale,
    (event.clientY - current.startY) / current.scale,
  ];

  return {
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      const block = blockAt(event.currentTarget, event.clientX, event.clientY);
      const widgetId = block?.dataset.widgetId;
      if (!block || !widgetId) return;
      event.stopPropagation();
      try {
        // Keeps the moves coming when the pointer leaves the preview while dragging.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // The pointer is already gone (released in the meantime); the drag still works inside.
      }
      drag.current = {
        block,
        widgetId,
        startX: event.clientX,
        startY: event.clientY,
        scale: screenScaleOf(block),
        moved: false,
      };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current) {
        event.currentTarget.style.cursor = blockAt(
          event.currentTarget,
          event.clientX,
          event.clientY,
        )
          ? 'move'
          : '';
        return;
      }
      const moved =
        Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >=
        DRAG_THRESHOLD_PX;
      if (!current.moved && !moved) return;
      current.moved = true;
      const [x, y] = deltaOf(current, event);
      // `translate` adds to the block's own transform (anchor, scale) instead of replacing it.
      current.block.style.translate = `${x}px ${y}px`;
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      if (!current.moved) {
        current.block.style.translate = '';
        return;
      }
      swallowClick.current = true;
      const [x, y] = deltaOf(current, event);
      // Measured while the block still stands where it was dropped.
      current.block.style.translate = `${x}px ${y}px`;
      const dropped = droppedBoxOf(current.block, current.scale);
      current.block.style.translate = '';
      onDrop(current.widgetId, x!, y!, dropped);
    },
    onPointerCancel() {
      if (drag.current) drag.current.block.style.translate = '';
      drag.current = null;
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      event.stopPropagation();
    },
  };
}
