import type { LngLat } from '@travel-route-animator/core';

/**
 * Hard-coded Westbahn stops for the M0 spike, Salzburg Hbf to Wien Hbf.
 * Straight segments between stations are good enough to prove the render pipeline;
 * real routing arrives in M4.
 */
export const SALZBURG_TO_VIENNA: LngLat[] = [
  [13.0458, 47.8131], // Salzburg Hbf
  [14.2913, 48.2904], // Linz Hbf
  [15.6241, 48.2079], // St. Pölten Hbf
  [16.3755, 48.1851], // Wien Hbf
];
