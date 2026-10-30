import type { OutputSettings, Project } from '@travel-route-animator/core';

// Kept apart from EtappeComposition.tsx on purpose: the Node-side render code (render/) and
// through it the server import these types, and they are type-checked without JSX and DOM.

/** The id the stage composition is registered under (Root.tsx) and rendered by. */
export const ETAPPE_COMPOSITION_ID = 'Etappe';

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
