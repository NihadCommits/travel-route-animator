import type { VideoInfo } from '@travel-route-animator/core';
import type { StageProps } from '@travel-route-animator/scene/render';

export interface StageRenderJob {
  /** What prepare() returned: Remotion's bundle of the scene. */
  serveUrl: string;
  props: StageProps;
  outputLocation: string;
  signal: AbortSignal;
  onProgress: (progress: number, remainingMs: number) => void;
}

/**
 * What the render queue needs from Remotion. index.ts passes the real one
 * (remotionRenderer.ts); tests pass a fake, so they never bundle, open a browser or encode.
 */
export interface StageRenderer {
  /** Bundles the scene if there is no current bundle; called before every job. */
  prepare: (onProgress?: (percent: number) => void) => Promise<string>;
  /** Renders and checks the video. Leaves no file behind when it fails or is aborted. */
  render: (job: StageRenderJob) => Promise<VideoInfo>;
}

export class RenderingUnavailableError extends Error {
  override name = 'RenderingUnavailableError';
}

/** Without a configured renderer (tests that do not render) a job fails at once. */
export const noRenderer: StageRenderer = {
  prepare: () => Promise.reject(new RenderingUnavailableError('No renderer is configured')),
  render: () => Promise.reject(new RenderingUnavailableError('No renderer is configured')),
};
