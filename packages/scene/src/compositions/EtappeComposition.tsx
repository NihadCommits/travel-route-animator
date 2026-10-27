import {
  compileTimeline,
  computeFrameState,
  type OutputSettings,
  type Project,
} from '@travel-route-animator/core';
import { useMemo, type FC } from 'react';
import { AbsoluteFill, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { Overlays } from '../overlays/Overlays';
import { SafeArea } from '../overlays/SafeArea';
import { MapStage } from '../stage/MapStage';

/**
 * The props of a stage video: the whole project (inheritance needs it) and which stage. The
 * same props drive the editor's preview (M6) and the export, so both show the same thing.
 */
export type EtappeProps = {
  project: Project;
  etappeId: string;
  /** Overrides from the render dialog, e.g. a 9:16 version of the same stage. */
  output?: Partial<OutputSettings>;
  /** Preview only: draw with fewer pixels (0.5 = half resolution), same picture otherwise. */
  previewScale?: number;
  /** Preview only: safe-area guides on top. Never set for an export. */
  guides?: boolean;
};

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
  const { project, etappeId, output, previewScale, guides } = props;
  const frame = useCurrentFrame();
  // Worked out once per props; every frame is then a pure function of it (Determinismus).
  const timeline = useMemo(
    () => timelineOf({ project, etappeId, output, previewScale }),
    [project, etappeId, output, previewScale],
  );
  const state = useMemo(() => computeFrameState(timeline, frame), [timeline, frame]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#dfe7ee' }}>
      <MapStage timeline={timeline} state={state} />
      <Overlays timeline={timeline} state={state} />
      {guides && <SafeArea timeline={timeline} />}
    </AbsoluteFill>
  );
};
