import {
  compileTimeline,
  computeFrameState,
  type OutputSettings,
  type Project,
} from '@travel-route-animator/core';
import { useMemo, type FC } from 'react';
import { AbsoluteFill, useCurrentFrame, type CalculateMetadataFunction } from 'remotion';
import { Overlays } from '../overlays/Overlays';
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
};

function timelineOf({ project, etappeId, output }: EtappeProps) {
  return compileTimeline(project, etappeId, output ? { output } : {});
}

/** Length, frame rate and size come from the project, not from fixed numbers in Root.tsx. */
export const calculateEtappeMetadata: CalculateMetadataFunction<EtappeProps> = ({ props }) => {
  const { durationInFrames, fps, width, height } = timelineOf(props);
  return { durationInFrames, fps, width, height };
};

export const EtappeComposition: FC<EtappeProps> = (props) => {
  const { project, etappeId, output } = props;
  const frame = useCurrentFrame();
  // Worked out once per props; every frame is then a pure function of it (Determinismus).
  const timeline = useMemo(
    () => timelineOf({ project, etappeId, output }),
    [project, etappeId, output],
  );
  const state = useMemo(() => computeFrameState(timeline, frame), [timeline, frame]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#dfe7ee' }}>
      <MapStage timeline={timeline} state={state} />
      <Overlays timeline={timeline} state={state} />
    </AbsoluteFill>
  );
};
