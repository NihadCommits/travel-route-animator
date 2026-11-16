import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { blockAt, useBlockDrag } from './blockDrag';

// jsdom lays nothing out, so the boxes are set by hand: a layer of 1920 reference pixels shown
// 960 pixels wide (half size), with one block at 100–300 × 600–700 on screen.

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

function Preview({
  onDrop,
  onClick,
}: {
  onDrop: (id: string, x: number, y: number) => void;
  onClick: () => void;
}) {
  const drag = useBlockDrag(onDrop);
  return (
    <div data-testid="preview" {...drag} onClick={onClick}>
      <div data-testid="layer">
        <div data-widget-id="w_km">12,4 km</div>
      </div>
    </div>
  );
}

function setUp() {
  const onDrop = vi.fn();
  const onClick = vi.fn();
  render(<Preview onDrop={onDrop} onClick={onClick} />);
  const layer = screen.getByTestId('layer');
  Object.defineProperty(layer, 'offsetWidth', { value: 1920 });
  layer.getBoundingClientRect = () => rect(0, 0, 960, 540);
  screen.getByText('12,4 km').getBoundingClientRect = () => rect(100, 400, 200, 100);
  return { onDrop, onClick, preview: screen.getByTestId('preview') };
}

describe('dragging blocks in the preview', () => {
  it('finds the block under the pointer', () => {
    const { preview } = setUp();
    expect(blockAt(preview, 150, 450)?.dataset.widgetId).toBe('w_km');
    expect(blockAt(preview, 50, 450)).toBeUndefined();
  });

  it('moves a block in reference pixels and keeps the click from playing', () => {
    const { preview, onDrop, onClick } = setUp();
    fireEvent.pointerDown(preview, { button: 0, clientX: 150, clientY: 450, pointerId: 1 });
    fireEvent.pointerMove(preview, { clientX: 180, clientY: 420, pointerId: 1 });
    expect(screen.getByText('12,4 km').style.translate).toBe('60px -60px');
    fireEvent.pointerUp(preview, { clientX: 200, clientY: 410, pointerId: 1 });
    fireEvent.click(preview);

    // 50 and -40 screen pixels at half size are 100 and -80 reference pixels.
    expect(onDrop).toHaveBeenCalledWith('w_km', 100, -80);
    expect(screen.getByText('12,4 km').style.translate).toBe('');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves a click on a block and on the map to the player', () => {
    const { preview, onDrop, onClick } = setUp();
    fireEvent.pointerDown(preview, { button: 0, clientX: 150, clientY: 450, pointerId: 1 });
    fireEvent.pointerUp(preview, { clientX: 151, clientY: 450, pointerId: 1 });
    fireEvent.click(preview);
    fireEvent.pointerDown(preview, { button: 0, clientX: 600, clientY: 100, pointerId: 1 });
    fireEvent.click(preview);
    expect(onDrop).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
