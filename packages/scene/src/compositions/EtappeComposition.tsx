import { compileTimeline, computeFrameState } from '@travel-route-animator/core';
import { useMemo, type FC } from 'react';
import { AbsoluteFill, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { Overlays } from '../overlays/Overlays';
import { SafeArea } from '../overlays/SafeArea';
import { MapFinish } from '../overlays/MapFinish';
import { mapLookOf } from '../stage/mapLook';
import { MapStage } from '../stage/MapStage';
import { stageImages } from '../vehicles/images';
import type { EtappeProps } from './etappeProps';

export type { EtappeProps } from './etappeProps';

/** The timeline of these props; the editor uses it to size the player the same way. */
export function timelineOf({ project, etappeId, output, previewScale }: EtappeProps) {
  return compileTimeline(project, etappeId, {
    ...(output && { output }),
    ...(previewScale !== undefined && { previewScale }),
  });
}

/** Length, frame rate and size come from the project, not from fixed numbers in Root.tsx. */
export const calculateEtappeMetadata: CalculateMetadataFunction<EtappeProps> = ({ props }) => {
  const { durationInFrames, fps, width, height } = timelineOf(props);
  return { durationInFrames, fps, width, height };
};

export const EtappeComposition: FC<EtappeProps> = (props) => {
  const { project, etappeId, output, previewScale, guides, assetUrls, themes, serverUrl } = props;
  const frame = useCurrentFrame();
  // Worked out once per props; every frame is then a pure function of it (Determinismus).
  const timeline = useMemo(
    () => timelineOf({ project, etappeId, output, previewScale }),
    [project, etappeId, output, previewScale],
  );
  const state = useMemo(() => computeFrameState(timeline, frame), [timeline, frame]);
  const look = useMemo(
    () => mapLookOf(timeline, { themes, serverUrl }),
    [timeline, themes, serverUrl],
  );
  const images = useMemo(
    () => stageImages(project, etappeId, assetUrls),
    [project, etappeId, assetUrls],
  );

  return (
    <AbsoluteFill style={{ backgroundColor: look.background }}>
      {/* A new style is a new map: a diff would drop our own sources and layers (ADR 0010). */}
      <MapStage key={look.key} timeline={timeline} state={state} images={images} look={look} />
      <MapFinish extras={look.extras} />
      <Overlays timeline={timeline} state={state} credits={look.credits} />
      {guides && <SafeArea timeline={timeline} />}
    </AbsoluteFill>
  );
};
