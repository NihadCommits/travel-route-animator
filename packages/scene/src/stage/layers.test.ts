import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { addSceneLayers } from './layers';

// The scene's own layers only meet MapLibre in a browser, so a wrong expression or property
// would surface as a broken render. Here they go through MapLibre's own style validator.

/** Records what the scene adds, the way a loaded map would hold it. */
function recordedStyle(): StyleSpecification {
  const style: StyleSpecification = { version: 8, sources: {}, layers: [] };
  const map = {
    addSource: (id: string, source: StyleSpecification['sources'][string]) => {
      style.sources[id] = source;
    },
    addLayer: (layer: StyleSpecification['layers'][number]) => {
      style.layers.push(layer);
    },
  };
  addSceneLayers(map as unknown as MapLibreMap);
  return style;
}

describe('addSceneLayers', () => {
  it('adds only layers MapLibre accepts', () => {
    const style = recordedStyle();
    expect(style.layers.length).toBeGreaterThan(10);
    expect(validateStyleMin(style).map((error) => error.message)).toEqual([]);
  });

  it('gives every layer its own ID and a source of ours', () => {
    const { layers, sources } = recordedStyle();
    const ids = layers.map((layer) => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const layer of layers) {
      expect(layer.id).toMatch(/^tra-/);
      expect(sources).toHaveProperty('source' in layer ? String(layer.source) : '');
    }
  });

  it('draws the pins above routes and vehicles', () => {
    const ids = recordedStyle().layers.map((layer) => layer.id);
    const firstPin = ids.findIndex((id) => id.startsWith('tra-pin'));
    const lastOther = ids.findLastIndex((id) => !id.startsWith('tra-pin'));
    expect(firstPin).toBeGreaterThan(lastOther);
  });
});
