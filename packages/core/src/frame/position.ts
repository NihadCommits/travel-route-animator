import { pointAt } from '../geo/along';
import type { LngLat } from '../geo/lngLat';
import type { TrackPlan } from '../timeline/compileTimeline';
import { ease } from '../timeline/easing';

/**
 * How far the vehicle has come at `sec` (seconds from the start of the main part). Before its
 * start it waits at the first point, after its end it stands at the last one.
 */
export function distanceAt(plan: TrackPlan, sec: number): number {
  const { phases, line } = plan;
  if (sec <= plan.startSec) return 0;
  for (const phase of phases) {
    if (sec < phase.endSec) {
      if (phase.kind === 'hold' || sec < phase.startSec) return phase.fromM;
      const share = (sec - phase.startSec) / (phase.endSec - phase.startSec);
      return phase.fromM + (phase.toM - phase.fromM) * ease(plan.easing, share);
    }
  }
  return line.lengthM;
}

export function positionAt(plan: TrackPlan, sec: number): LngLat {
  return pointAt(plan.line, distanceAt(plan, sec));
}
