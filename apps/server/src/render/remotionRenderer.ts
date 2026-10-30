import {
  bundleScene,
  bundleSourcesStamp,
  makeCancelSignal,
  renderEtappe,
  type OpenGlRenderer,
} from '@travel-route-animator/scene/render';
import type { StageRenderer } from './renderer';

export interface RemotionRendererOptions {
  gl: OpenGlRenderer;
  log: (message: string) => void;
  /**
   * A bundle made while packaging the Windows app. With it the server never bundles: the
   * app ships neither webpack nor the scene's sources (Remotion: bundle at package time).
   */
  prebuiltServeUrl?: string;
  /** The app's own Chrome Headless Shell and compositor, outside its archive. */
  browserExecutable?: string;
  binariesDirectory?: string;
}

/**
 * The real renderer: Remotion with the scene from packages/scene. It bundles once and keeps
 * the bundle, and bundles again before a job if a source file changed since (so a render
 * during development shows the current code). Only the server's start-up imports this file;
 * tests and the rest of the server never load Remotion.
 */
export function createRemotionRenderer({
  gl,
  log,
  prebuiltServeUrl,
  browserExecutable,
  binariesDirectory,
}: RemotionRendererOptions): StageRenderer {
  let bundled: { serveUrl: string; stamp: number } | undefined;
  let bundling: Promise<string> | undefined;

  async function prepare(onProgress?: (percent: number) => void): Promise<string> {
    if (prebuiltServeUrl) return prebuiltServeUrl;
    const stamp = await bundleSourcesStamp();
    if (bundled && bundled.stamp >= stamp) return bundled.serveUrl;
    // A job and the warm-up at start-up may ask at the same time; they share one bundle.
    bundling ??= (async () => {
      log(bundled ? 'The scene changed, bundling it again …' : 'Bundling the scene …');
      const startedAt = performance.now();
      try {
        const serveUrl = await bundleScene(onProgress ? { onProgress } : {});
        bundled = { serveUrl, stamp };
        log(`Scene bundled in ${((performance.now() - startedAt) / 1000).toFixed(1)} s`);
        return serveUrl;
      } finally {
        bundling = undefined;
      }
    })();
    return bundling;
  }

  return {
    prepare,
    async render({ serveUrl, props, outputLocation, signal, onProgress }) {
      // Remotion has its own cancel signal; an abort before the render starts still counts.
      const { cancelSignal, cancel } = makeCancelSignal();
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, { once: true });
      const { width, height, fps, durationSec } = await renderEtappe({
        serveUrl,
        props,
        outputLocation,
        gl,
        cancelSignal,
        ...(browserExecutable && { browserExecutable }),
        ...(binariesDirectory && { binariesDirectory }),
        onProgress: ({ progress, remainingMs }) => onProgress(progress, remainingMs),
      });
      return { width, height, fps, durationSec };
    },
  };
}
