import type { OutputSettings, Project, Theme } from '@travel-route-animator/core';

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
  /**
   * Where the stage's images load from, by asset ID (ADR 0009): the server's URLs in the
   * editor, data: URLs in a render. The scene itself knows nothing of the server.
   */
  assetUrls?: Record<string, string>;
  /** Own themes the stage's style may name (ADR 0010); built-in ones need not be passed. */
  themes?: Record<string, Theme>;
  /** Our local server, where satellite tiles come from (the key stays there). */
  serverUrl?: string;
  /** Preview only: draw with fewer pixels (0.5 = half resolution), same picture otherwise. */
  previewScale?: number;
  /** Preview only: safe-area guides on top. Never set for an export. */
  guides?: boolean;
};
