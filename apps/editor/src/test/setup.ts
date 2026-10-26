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
