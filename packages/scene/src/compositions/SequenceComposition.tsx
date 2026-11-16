import { compileSequence, sequenceFrameAt } from '@travel-route-animator/core';
import { useMemo, type FC } from 'react';
import { AbsoluteFill, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { blackOf, EffectsOverlay } from '../overlays/EffectsOverlay';
import { MapFinish } from '../overlays/MapFinish';
import { Overlays } from '../overlays/Overlays';
import { SafeArea } from '../overlays/SafeArea';
import { mapLookOf } from '../stage/mapLook';
import { MapStage } from '../stage/MapStage';
import { stageImages, type StageImage } from '../vehicles/images';
import type { SequenceProps } from './etappeProps';

// Several stages as one video with one map (ADR 0011). The map is built once and only built
// anew where the map style changes; a dip to black hides that moment.

/** The sequence of these props; the editor sizes its player with it, like the render does. */
export function sequenceOf({ project, etappeIds, output, previewScale }: SequenceProps) {
  return compileSequence(project, etappeIds, {
    ...(output && { output }),
    ...(previewScale !== undefined && { previewScale }),
  });
}

export const calculateSequenceMetadata: CalculateMetadataFunction<SequenceProps> = ({ props }) => {
  const { durationInFrames, fps, width, height } = sequenceOf(props);
  return { durationInFrames, fps, width, height };
};

export const SequenceComposition: FC<SequenceProps> = (props) => {
  const {
    project,
    etappeIds,
    output,
    previewScale,
    guides,
    assetUrls,
    themes,
    overlayStyles,
    serverUrl,
    motionData,
  } = props;
  const frame = useCurrentFrame();
  const sequence = useMemo(
    () => sequenceOf({ project, etappeIds, output, previewScale }),
    [project, etappeIds, output, previewScale],
  );
  const looks = useMemo(
    () => sequence.parts.map((part) => mapLookOf(part.timeline, { themes, serverUrl })),
    [sequence, themes, serverUrl],
  );
  // Everything every stage needs, loaded before the first frame: no stage waits for its icons.
  const timelines = useMemo(() => sequence.parts.map((part) => part.timeline), [sequence]);
  const images = useMemo(() => {
    const byId = new Map<string, StageImage>();
    for (const id of etappeIds) {
      for (const image of stageImages(project, id, assetUrls)) byId.set(image.asset.id, image);
    }
    return [...byId.values()];
  }, [project, etappeIds, assetUrls]);

  const { partIndex, timeline, state, dip } = useMemo(
    () => sequenceFrameAt(sequence, frame),
    [sequence, frame],
  );
  const look = looks[partIndex]!;

  return (
    <AbsoluteFill
      style={
        // An overlay fades out instead of to black (ADR 0013).
        look.transparent
          ? { opacity: 1 - blackOf(state.effects, dip) }
          : { backgroundColor: look.background }
      }
    >
      <MapStage
        key={look.key}
        timeline={timeline}
        state={state}
        images={images}
        look={look}
        reportMotion={motionData ?? false}
        preload={timelines}
      />
      {!look.transparent && <MapFinish extras={look.extras} />}
      <Overlays
        timeline={timeline}
        state={state}
        credits={look.credits}
        ownStyles={overlayStyles}
      />
      <EffectsOverlay effects={state.effects} dip={dip} transparent={look.transparent} />
      {guides && <SafeArea timeline={timeline} />}
    </AbsoluteFill>
  );
};
