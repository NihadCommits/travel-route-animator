import { describe, expect, it } from 'vitest';
import { fromMercator, mercatorScale, toMercator } from './mercator';
import { unwrapLongitudes, wrapLongitude } from './unwrap';

describe('unwrapLongitudes', () => {
  it('continues over the date line instead of jumping back', () => {
    expect(
      unwrapLongitudes([
        [139.8, 35.5],
        [179, 45],
        [-179, 46],
        [-118.4, 33.9],
      ]),
    ).toEqual([
      [139.8, 35.5],
      [179, 45],
      [181, 46],
      [241.6, 33.9],
    ]);
  });

  it('works westwards as well', () => {
    expect(
      unwrapLongitudes([
        [-170, 0],
        [175, 0],
      ]),
    ).toEqual([
      [-170, 0],
      [-185, 0],
    ]);
  });

  it('leaves ordinary lines alone', () => {
    const line: [number, number][] = [
      [16.4, 48.2],
      [-8.6, 41.2],
    ];
    expect(unwrapLongitudes(line)).toEqual(line);
    expect(unwrapLongitudes([])).toEqual([]);
  });
});

describe('wrapLongitude', () => {
  it('brings longitudes back into −180..180', () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(541.5)).toBe(-178.5);
    expect(wrapLongitude(16.4)).toBe(16.4);
  });

  it('keeps both ends of the range', () => {
    expect(wrapLongitude(180)).toBe(180);
    expect(wrapLongitude(-180)).toBe(-180);
    expect(wrapLongitude(540)).toBe(180);
  });
});

describe('Web Mercator', () => {
  it('converts there and back', () => {
    const [lng, lat] = fromMercator(toMercator([16.3725, 48.2084]));
    expect(lng).toBeCloseTo(16.3725, 9);
    expect(lat).toBeCloseTo(48.2084, 9);
  });

  it('puts the origin at 0/0 and stays finite at the poles', () => {
    const [x, y] = toMercator([0, 0]);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(0, 6);
    expect(Number.isFinite(toMercator([0, 90])[1])).toBe(true);
  });

  it('stretches by 1 / cos(latitude)', () => {
    expect(mercatorScale(0)).toBe(1);
    expect(mercatorScale(60)).toBeCloseTo(0.5, 12);
  });
});
