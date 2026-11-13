import { boundsOf } from '../geo/bounds';
import { fromMercator, toMercator } from '../geo/mercator';
import type { TransitionSettings } from '../model/style';
import type { Project } from '../model/project';
import type { Id } from '../model/primitives';
import { resolveTransition } from '../resolve/resolve';
import { fitBounds, type CameraState } from '../frame/camera';
import { computeFrameState, type FrameState } from '../frame/computeFrameState';
import { ease } from './easing';
import { compileTimeline, type CompileOptions, type Timeline } from './compileTimeline';

// Several stages as one video (ADR 0011): their timelines one after the other, with the
// transition of the next stage's group in between. Every frame is a plain function of the
// sequence and the frame number, like a single stage's.

export interface SequencePart {
  etappeId: Id;
  timeline: Timeline;
  /** First frame of the sequence that belongs to this stage. */
  startFrame: number;
}

/** The time between two stages; a cut has none. */
export interface SequenceGap {
  type: TransitionSettings['type'];
  /** The stage before; the one after is `from + 1`. */
  from: number;
  startFrame: number;
  durationInFrames: number;
  /** The map style changes here, so the map is built anew: hidden by a short dip. */
  styleChanges: boolean;
}

export interface Sequence {
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  parts: SequencePart[];
  gaps: SequenceGap[];
}

export function compileSequence(
  project: Project,
  etappeIds: readonly Id[],
  options: CompileOptions = {},
): Sequence {
  if (etappeIds.length === 0) throw new Error('A sequence needs at least one stage');
  const timelines = etappeIds.map((id) => compileTimeline(project, id, options));
  const { fps, width, height } = timelines[0]!;
  const parts: SequencePart[] = [];
  const gaps: SequenceGap[] = [];
  let cursor = 0;
  timelines.forEach((timeline, i) => {
    parts.push({ etappeId: etappeIds[i]!, timeline, startFrame: cursor });
    cursor += timeline.durationInFrames;
    const next = timelines[i + 1];
    if (!next) return;
    const transition = resolveTransition(project, etappeIds[i + 1]!).value;
    const frames = transition.type === 'cut' ? 0 : Math.round(transition.durationSec * fps);
    if (frames > 0) {
      gaps.push({
        type: transition.type,
        from: i,
        startFrame: cursor,
        durationInFrames: frames,
        styleChanges: timeline.mapStyleKey !== next.mapStyleKey,
      });
    }
    cursor += frames;
  });
  return { fps, width, height, durationInFrames: cursor, parts, gaps };
}

export interface SequenceFrame {
  partIndex: number;
  timeline: Timeline;
  state: FrameState;
  /** How dark the picture is drawn over: 0 clear, 1 black (fades and style changes). */
  dip: number;
}

/** Share of a fly-over during which a style change dips the picture, around its middle. */
const STYLE_DIP_SHARE = 0.3;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The shorter way round from one bearing to another. */
function lerpBearing(a: number, b: number, t: number): number {
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  return a + delta * t;
}

/**
 * The camera on its way from the end of one stage to the start of the next. The centre moves
 * in Mercator space, as the map does; far apart, the zoom drops in the middle until both
 * points fit into the picture, then comes back in (a rough van Wijk flight).
 */
export function flyCamera(
  from: CameraState,
  to: CameraState,
  t: number,
  viewport: { width: number; height: number },
): CameraState {
  const [ax, ay] = toMercator(from.center);
  const [bx, by] = toMercator(to.center);
  const bounds = boundsOf([from.center, to.center])!;
  const both = fitBounds(bounds, viewport, Math.min(viewport.width, viewport.height) * 0.15).zoom;
  // Halfway the zoom is the average of the two, or lower if that is needed to see both points.
  const average = (from.zoom + to.zoom) / 2;
  const dropAtMiddle = Math.max(0, average - both);
  return {
    center: fromMercator([lerp(ax, bx, t), lerp(ay, by, t)]),
    zoom: lerp(from.zoom, to.zoom, t) - dropAtMiddle * Math.sin(Math.PI * t),
    pitchDeg: lerp(from.pitchDeg, to.pitchDeg, t),
    bearingDeg: lerpBearing(from.bearingDeg, to.bearingDeg, t),
    centerAltitudeM: lerp(from.centerAltitudeM, to.centerAltitudeM, t),
  };
}

function gapFrame(sequence: Sequence, gap: SequenceGap, frame: number): SequenceFrame {
  const before = sequence.parts[gap.from]!;
  const after = sequence.parts[gap.from + 1]!;
  const end = computeFrameState(before.timeline, before.timeline.durationInFrames - 1);
  const start = computeFrameState(after.timeline, 0);
  // Centred on the frame, so the halves are as long as each other.
  const t = (frame - gap.startFrame + 0.5) / gap.durationInFrames;
  const second = t >= 0.5;
  const shown = second
    ? { partIndex: gap.from + 1, timeline: after.timeline, state: start }
    : { partIndex: gap.from, timeline: before.timeline, state: end };

  if (gap.type === 'fade') {
    return { ...shown, dip: 1 - Math.abs(2 * t - 1) };
  }
  // camera-fly: on the globe if either stage is one; at high zoom it looks like the flat map.
  const eased = ease('ease-in-out', t);
  const projection =
    end.projection === 'globe' || start.projection === 'globe' ? 'globe' : 'mercator';
  const fromMiddle = Math.abs(t - 0.5) / (STYLE_DIP_SHARE / 2);
  return {
    ...shown,
    state: {
      ...shown.state,
      camera: flyCamera(end.camera, start.camera, eased, before.timeline.viewport),
      projection,
    },
    dip: gap.styleChanges ? Math.max(0, 1 - fromMiddle) : 0,
  };
}

export function sequenceFrameAt(sequence: Sequence, frame: number): SequenceFrame {
  const gap = sequence.gaps.find(
    (g) => frame >= g.startFrame && frame < g.startFrame + g.durationInFrames,
  );
  if (gap) return gapFrame(sequence, gap, frame);
  // The last part that has started; frames past the end show the end.
  let index = 0;
  sequence.parts.forEach((part, i) => {
    if (frame >= part.startFrame) index = i;
  });
  const part = sequence.parts[index]!;
  const local = Math.min(frame - part.startFrame, part.timeline.durationInFrames - 1);
  return {
    partIndex: index,
    timeline: part.timeline,
    state: computeFrameState(part.timeline, Math.max(0, local)),
    dip: 0,
  };
}
