import { validateProject, type Project } from '@travel-route-animator/core';
import type { FC } from 'react';
import { Composition } from 'remotion';
import example from '../../../examples/portugal-2026/project.json';
import {
  calculateEtappeMetadata,
  EtappeComposition,
  type EtappeProps,
} from './compositions/EtappeComposition';

// Remotion Studio (pnpm studio) opens the example project; the render script and later the
// editor pass their own project as input props. Its road routes are missing until the server
// has computed them, so the Studio shows straight lines for cars until then.
const checked = validateProject(example);
if (!checked.success) throw new Error('examples/portugal-2026/project.json is not a valid project');
const exampleProject: Project = checked.data;

const defaultProps: EtappeProps = { project: exampleProject, etappeId: 'e_sbg_wien' };

export const RemotionRoot: FC = () => (
  <Composition
    id="Etappe"
    component={EtappeComposition}
    defaultProps={defaultProps}
    calculateMetadata={calculateEtappeMetadata}
    // Overwritten by calculateMetadata; Remotion wants them anyway.
    durationInFrames={1}
    fps={25}
    width={1920}
    height={1080}
  />
);
