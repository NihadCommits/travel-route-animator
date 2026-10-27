// Adds DOM matchers such as toBeInTheDocument() and cleans up rendered components after each test.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no layout engine and therefore no ResizeObserver; the resizable panels need one.
// The panels never get a size in tests, which is fine for testing what they contain.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// Nor does it scroll; the tree scrolls the selected row into view.
Element.prototype.scrollIntoView = function scrollIntoView() {};

// Nor capture pointers, which the timeline does while dragging. Tests send the moves to the
// dragged element itself, so remembering the capture is enough.
const captured = new WeakMap<Element, Set<number>>();
Element.prototype.setPointerCapture = function setPointerCapture(pointerId: number) {
  captured.set(this, (captured.get(this) ?? new Set()).add(pointerId));
};
Element.prototype.releasePointerCapture = function releasePointerCapture(pointerId: number) {
  captured.get(this)?.delete(pointerId);
};
Element.prototype.hasPointerCapture = function hasPointerCapture(pointerId: number) {
  return captured.get(this)?.has(pointerId) ?? false;
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom has no WebGL, so MapLibre cannot draw. Replacing the module keeps tests from loading
// it at all; the map then shows its "not available" text, as it would without WebGL.
vi.mock('@/features/map/maplibre', () => ({
  createEditMap: () => {
    throw new Error('No WebGL in jsdom');
  },
}));

// The preview's player needs WebGL as well. The stand-in keeps the rest of the preview pane
// (stage choice, loading) testable and says which stage it would play.
vi.mock('@/features/preview/PreviewPlayer', () => ({
  PreviewPlayer: ({ etappeId }: { etappeId: string }) => `Vorschau-Player für ${etappeId}`,
}));
