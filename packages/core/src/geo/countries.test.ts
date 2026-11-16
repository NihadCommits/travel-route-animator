import { describe, expect, it } from 'vitest';
import { countryAt, indexCountries, type Topology } from './countries';

// A tiny topology in world-atlas's form: a square "Austria" (ISO 040) with a square hole, its
// neighbour "Germany" (276) sharing the western edge, Kosovo without a number, and a place with
// neither a number nor a flag. One unit is one degree.
const topology: Topology = {
  transform: { scale: [1, 1], translate: [10, 46] },
  arcs: [
    // 0: the shared border, from (13, 46) north to (13, 50).
    [
      [3, 0],
      [0, 4],
    ],
    // 1: the rest of Austria, from (13, 50) east, south and back west to (13, 46).
    [
      [3, 4],
      [4, 0],
      [0, -4],
      [-4, 0],
    ],
    // 2: the rest of Germany, from (13, 50) west, south and east to (13, 46).
    [
      [3, 4],
      [-3, 0],
      [0, -4],
      [3, 0],
    ],
    // 3: a hole in Austria, (15, 47) – (16, 48).
    [
      [5, 1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ],
    // 4: Kosovo, (20, 42) – (21, 43).
    [
      [10, -4],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ],
  ],
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: '040', arcs: [[0, 1], [3]] },
        { type: 'MultiPolygon', id: '276', arcs: [[[2, ~0]]] },
        { type: 'Polygon', properties: { name: 'Kosovo' }, arcs: [[4]] },
        { type: 'Polygon', properties: { name: 'N. Cyprus' }, arcs: [[4]] },
      ],
    },
  },
};

describe('countries', () => {
  const index = indexCountries(topology);

  it('decodes the shared arcs into countries with flags', () => {
    expect(index.countries.map((country) => [country.code, country.bbox])).toEqual([
      ['at', [13, 46, 17, 50]],
      ['de', [10, 46, 13, 50]],
      ['xk', [20, 42, 21, 43]],
    ]);
  });

  it('finds the country of a point, leaves out holes and the sea', () => {
    expect(countryAt(index, [14, 47])).toBe('at');
    expect(countryAt(index, [11.5, 48])).toBe('de');
    expect(countryAt(index, [15.5, 47.5])).toBeUndefined();
    expect(countryAt(index, [20.5, 42.5])).toBe('xk');
    expect(countryAt(index, [0, 0])).toBeUndefined();
  });

  it('counts a point just off a coast for the nearest country', () => {
    // 0.1° east of Austria at 48° N is about 7 km; a whole degree is too far.
    expect(countryAt(index, [17.1, 48])).toBe('at');
    expect(countryAt(index, [18, 48])).toBeUndefined();
    expect(countryAt(index, [18, 48], 100)).toBe('at');
  });
});
