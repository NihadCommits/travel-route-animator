import type { Easing } from '../model/enums';

// Cubic curves, the same family as CSS's ease-in/-out but symmetric and without a bezier
// solver: cheap, exact and identical on every machine, which the renderer relies on.
const CURVES: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - (1 - t) ** 3,
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Eased progress for a linear progress t in 0..1 (clamped). 0 → 0 and 1 → 1 for every curve. */
export function ease(easing: Easing, t: number): number {
  return CURVES[easing](clamp01(t));
}

/**
 * The linear progress at which the eased progress reaches `value`, i.e. when a vehicle passes
 * a point on its way. Bisection: the curves are monotonic, 40 steps are far below a frame.
 */
export function invertEase(easing: Easing, value: number): number {
  const target = clamp01(value);
  // The curves are flat at their ends, where bisection would stop a hair short of 0 or 1.
  if (target === 0 || target === 1) return target;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (CURVES[easing](middle) < target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}
