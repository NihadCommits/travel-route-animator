import { describe, expect, it } from 'vitest';
import { VEHICLE_TYPES } from './enums';
import { isRoutingAllowed, recommendViewMode, VEHICLE_CATALOG } from './vehicles';

describe('VEHICLE_CATALOG', () => {
  it('has an entry for every vehicle type', () => {
    expect(Object.keys(VEHICLE_CATALOG).sort()).toEqual([...VEHICLE_TYPES].sort());
  });

  it("allows each vehicle's default routing mode", () => {
    for (const type of VEHICLE_TYPES) {
      expect(isRoutingAllowed(type, VEHICLE_CATALOG[type].defaultRouting)).toBe(true);
    }
  });
});

describe('isRoutingAllowed', () => {
  it('lets planes fly only along great circles', () => {
    expect(isRoutingAllowed('plane', 'great-circle')).toBe(true);
    expect(isRoutingAllowed('plane', 'road')).toBe(false);
  });

  it('does not route cars over cycling paths or trains over roads', () => {
    expect(isRoutingAllowed('car', 'cycling')).toBe(false);
    expect(isRoutingAllowed('train', 'road')).toBe(false);
  });
});

describe('recommendViewMode', () => {
  it('suggests the globe as soon as a plane is part of the stage', () => {
    expect(recommendViewMode(['car', 'plane'])).toBe('globe');
  });

  it("follows the first vehicle's recommendation otherwise", () => {
    expect(recommendViewMode(['train', 'car'])).toBe('2d');
    expect(recommendViewMode(['car'])).toBe('3d-tilted');
  });

  it('falls back to 2d for a stage without vehicles', () => {
    expect(recommendViewMode([])).toBe('2d');
  });
});
