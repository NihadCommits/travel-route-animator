import { validateProject, type Project } from '@travel-route-animator/core';
import type { FC } from 'react';
import { Composition } from 'remotion';
import example from '../../../examples/portugal-2026/project.json';
import {
  CAR_TYPES_COMPOSITION_ID,
  CAR_TYPES_SIZE,
  CarTypesComposition,
} from './compositions/CarTypes';
import { calculateEtappeMetadata, EtappeComposition } from './compositions/EtappeComposition';
import {
  ETAPPE_COMPOSITION_ID,
  SEQUENCE_COMPOSITION_ID,
  type EtappeProps,
  type SequenceProps,
} from './compositions/etappeProps';
import { calculateSequenceMetadata, SequenceComposition } from './compositions/SequenceComposition';
import {
  PLANE_TYPES_COMPOSITION_ID,
  PLANE_TYPES_SIZE,
  PlaneTypesComposition,
} from './compositions/PlaneTypes';

// Remotion Studio (pnpm studio) opens the example project; the render script and later the
// editor pass their own project as input props. Its road routes are missing until the server
// has computed them, so the Studio shows straight lines for cars until then.
const checked = validateProject(example);
if (!checked.success) throw new Error('examples/portugal-2026/project.json is not a valid project');
const exampleProject: Project = checked.data;

const defaultProps: EtappeProps = { project: exampleProject, etappeId: 'e_sbg_wien' };
// The example's outward journey: train, flight, taxi as one video.
const sequenceProps: SequenceProps = {
  project: exampleProject,
  etappeIds: exampleProject.groups[0]!.etappen.map((etappe) => etappe.id),
};

export const RemotionRoot: FC = () => (
  <>
    <Composition
      id={ETAPPE_COMPOSITION_ID}
      component={EtappeComposition}
      defaultProps={defaultProps}
      calculateMetadata={calculateEtappeMetadata}
      // Overwritten by calculateMetadata; Remotion wants them anyway.
      durationInFrames={1}
      fps={25}
      width={1920}
      height={1080}
    />
    <Composition
      id={SEQUENCE_COMPOSITION_ID}
      component={SequenceComposition}
      defaultProps={sequenceProps}
      calculateMetadata={calculateSequenceMetadata}
      durationInFrames={1}
      fps={25}
      width={1920}
      height={1080}
    />
    <Composition
      id={PLANE_TYPES_COMPOSITION_ID}
      component={PlaneTypesComposition}
      durationInFrames={1}
      fps={25}
      {...PLANE_TYPES_SIZE}
    />
    <Composition
      id={CAR_TYPES_COMPOSITION_ID}
      component={CarTypesComposition}
      durationInFrames={1}
      fps={25}
      {...CAR_TYPES_SIZE}
    />
  </>
);
