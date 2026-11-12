import { describe, expect, it } from 'vitest';
import { carTypeOf } from './carTypes';
import { planeTypeOf } from './planeTypes';

describe('model types of a vehicle variant', () => {
  it('keeps a known body or aircraft type', () => {
    expect(carTypeOf('car-camper')).toBe('car-camper');
    expect(planeTypeOf('plane-a380')).toBe('plane-a380');
  });

  it('falls back to the default for anything else, another vehicle type included', () => {
    expect(carTypeOf('car-limo')).toBe('car-default');
    expect(carTypeOf('plane-a320')).toBe('car-default');
    expect(planeTypeOf('car-suv')).toBe('plane-default');
  });
});
