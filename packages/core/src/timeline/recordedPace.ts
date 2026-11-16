import type { Recording } from '../model/track';
import { STANDING_SPEED_MS } from '../recording/recording';
import type { Phase } from './compileTimeline';

// "Echtes Tempo" (M16, ADR 0017): an imported track moves like the trip did, slower uphill,
// faster downhill, standing where it stood, squeezed into the track's time. Each step of the
// recording becomes a phase of its own, linear inside; the rest of the engine (distanceAt,
// arrivals, GIF frames) works on phases already and needs nothing new.

/** With skipPauses, standing still for longer than this is left out. Shorter waits stay. */
export const SKIPPED_PAUSE_SEC = 60;

/** A stop's hold, already scaled to fit the track's time (planPhases). */
export interface Hold {
  atM: number;
  sec: number;
}

/**
 * The phases of a recorded trip between `startSec` and `startSec + drivingSec + holds`.
 * Undefined if nothing is left to drive (a recording that never moves).
 */
export function planRecordedPhases(
  recording: Recording,
  holds: readonly Hold[],
  startSec: number,
  drivingSec: number,
  skipPauses: boolean,
): Phase[] | undefined {
  const { atM, stepSec } = recording;
  const steps = atM.length - 1;
  const standing = (i: number) => (atM[i + 1]! - atM[i]!) / stepSec < STANDING_SPEED_MS;

  // How much real time each step counts for: its seconds, or none in a long pause.
  const weight = Array.from({ length: steps }, () => stepSec);
  if (skipPauses) {
    let i = 0;
    while (i < steps) {
      if (!standing(i)) {
        i++;
        continue;
      }
      let j = i;
      while (j < steps && standing(j)) j++;
      if ((j - i) * stepSec > SKIPPED_PAUSE_SEC) weight.fill(0, i, j);
      i = j;
    }
  }
  const total = weight.reduce((sum, w) => sum + w, 0);
  if (total <= 0 || atM.at(-1)! <= atM[0]!) return undefined;
  const scale = drivingSec / total;

  const phases: Phase[] = [];
  let time = startSec;
  /** A phase from `fromM` to `toM` lasting `sec`, playing the recording from `recFrom` to `recTo`. */
  const push = (
    fromM: number,
    toM: number,
    sec: number,
    recFrom: number,
    recTo: number,
    kind?: Phase['kind'],
  ) => {
    if (sec <= 0) return;
    const phaseKind = kind ?? (toM > fromM ? 'move' : 'hold');
    const last = phases.at(-1);
    // Standing still over several steps is one hold, as long as the recording runs on with it.
    if (
      phaseKind === 'hold' &&
      last?.kind === 'hold' &&
      last.toM === fromM &&
      last.recordedSec?.to === recFrom
    ) {
      last.endSec += sec;
      last.recordedSec.to = recTo;
    } else {
      phases.push({
        kind: phaseKind,
        startSec: time,
        endSec: time + sec,
        fromM,
        toM,
        recordedSec: { from: recFrom, to: recTo },
      });
    }
    time += sec;
  };

  let next = 0;
  // Holds at the very start come first.
  while (next < holds.length && holds[next]!.atM <= atM[0]!) {
    push(atM[0]!, atM[0]!, holds[next]!.sec, 0, 0, 'hold');
    next++;
  }
  for (let i = 0; i < steps; i++) {
    const [from, to] = [atM[i]!, atM[i + 1]!];
    const sec = weight[i]! * scale;
    // Seconds into the recording at `m` metres within this step; a standing step starts at its start.
    const recAt = (m: number) => (i + (to > from ? (m - from) / (to - from) : 0)) * stepSec;
    let at = from;
    // A stop inside this step: drive to it, hold, drive on.
    while (next < holds.length && holds[next]!.atM > from && holds[next]!.atM <= to) {
      const hold = holds[next]!;
      push(at, hold.atM, (sec * (hold.atM - at)) / (to - from), recAt(at), recAt(hold.atM));
      push(hold.atM, hold.atM, hold.sec, recAt(hold.atM), recAt(hold.atM), 'hold');
      at = hold.atM;
      next++;
    }
    push(at, to, to > from ? (sec * (to - at)) / (to - from) : sec, recAt(at), (i + 1) * stepSec);
  }
  // Holds past the end of the recording: at the last stop.
  const endRec = steps * stepSec;
  for (; next < holds.length; next++) {
    push(atM.at(-1)!, atM.at(-1)!, holds[next]!.sec, endRec, endRec, 'hold');
  }
  return phases;
}

/**
 * Seconds into the recording at `sec` of the stage, when the track moves at its recorded pace;
 * undefined otherwise. Before the start it is the recording's start, after the end its end.
 */
export function recordedSecAt(phases: readonly Phase[], sec: number): number | undefined {
  const first = phases[0];
  if (!first?.recordedSec) return undefined;
  if (sec <= first.startSec) return first.recordedSec.from;
  for (const phase of phases) {
    if (sec < phase.endSec) {
      const { from, to } = phase.recordedSec!;
      if (sec < phase.startSec) return from;
      return from + ((to - from) * (sec - phase.startSec)) / (phase.endSec - phase.startSec);
    }
  }
  return phases.at(-1)!.recordedSec!.to;
}
