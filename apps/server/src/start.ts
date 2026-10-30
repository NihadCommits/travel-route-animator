import { isRenderJobFinished } from '@travel-route-animator/core';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import { buildApp } from './app';
import type { ListenOptions, RenderConfig, ServiceConfig } from './config';
import { createPhotonProvider } from './geocoding/photon';
import { removePartialVideos } from './render/outputFiles';
import { createRenderQueue, type RenderQueue } from './render/queue';
import { createRemotionRenderer } from './render/remotionRenderer';
import type { RevealFile } from './render/reveal';
import { createOrsProvider } from './routing/ors';
import { createOsrmProvider } from './routing/osrm';

export interface StartOptions {
  dataDir: string;
  outputDir: string;
  services: ServiceConfig;
  render: RenderConfig & {
    /** The Windows app's bundle, browser and compositor (see createRemotionRenderer). */
    prebuiltServeUrl?: string;
    browserExecutable?: string;
    binariesDirectory?: string;
  };
  listen: ListenOptions;
  /** If the port is taken, take any free one instead of failing (the Windows app). */
  anyPortIfTaken?: boolean;
  editorDir?: string;
  revealFile?: RevealFile;
  logger?: FastifyServerOptions['logger'];
}

export interface RunningServer {
  app: FastifyInstance;
  /** Where the server listens, e.g. http://127.0.0.1:5174 */
  url: string;
  renderQueue: RenderQueue;
  /**
   * Cancels waiting and running renders and waits until Remotion has closed its browser and
   * ffmpeg and removed the partial file, or until the time is up. Windows does not end child
   * processes with their parent, so this has to happen before the process goes.
   */
  stopRenders: (timeoutMs: number) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * The whole local server, wired as `pnpm dev` (index.ts) and the Windows app (M7b) both run
 * it: place search, routers, the render queue with Remotion, and the API on localhost.
 */
export async function startServer({
  dataDir,
  outputDir,
  services,
  render,
  listen,
  anyPortIfTaken = false,
  editorDir,
  revealFile,
  logger = true,
}: StartOptions): Promise<RunningServer> {
  // Only called during a request or after start-up, when `app` exists.
  const log = (message: string) => app.log.info(message);
  const renderer = createRemotionRenderer({
    gl: render.gl,
    log,
    ...(render.prebuiltServeUrl && { prebuiltServeUrl: render.prebuiltServeUrl }),
    ...(render.browserExecutable && { browserExecutable: render.browserExecutable }),
    ...(render.binariesDirectory && { binariesDirectory: render.binariesDirectory }),
  });
  const renderQueue = createRenderQueue({ renderer });
  const app = buildApp({
    logger,
    dataDir,
    outputDir,
    renderQueue,
    ...(editorDir && { editorDir }),
    ...(revealFile && { revealFile }),
    geocodingProvider: createPhotonProvider({
      baseUrl: services.photonUrl,
      userAgent: services.userAgent,
    }),
    routingProviders: {
      ...(services.orsApiKey && {
        ors: createOrsProvider({
          apiKey: services.orsApiKey,
          baseUrl: services.orsUrl,
          userAgent: services.userAgent,
          // The key itself is never logged.
          onQuota: (remaining, limit) =>
            log(`openrouteservice quota: ${remaining} of ${limit} left`),
        }),
      }),
      osrm: createOsrmProvider({ baseUrl: services.osrmUrl, userAgent: services.userAgent }),
    },
  });
  if (!services.orsApiKey) {
    app.log.warn('No openrouteservice key: road routes need one (ORS_API_KEY or the settings)');
  }

  // Videos that were still being rendered when the server last stopped are no videos.
  for (const path of await removePartialVideos(outputDir)) {
    log(`Removed the unfinished video ${path}`);
  }

  let url: string;
  try {
    url = await app.listen(listen);
  } catch (error) {
    if (!anyPortIfTaken || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
      await app.close();
      throw error;
    }
    app.log.warn(`Port ${listen.port} is taken, using a free one`);
    url = await app.listen({ ...listen, port: 0 });
  }

  // In the background, so the server answers at once; the first render waits for it if needed.
  if (render.prepareOnStart) {
    renderer.prepare().catch((error: unknown) => {
      app.log.warn(`Could not bundle the scene for rendering: ${String(error)}`);
    });
  }

  return {
    app,
    url,
    renderQueue,
    async stopRenders(timeoutMs) {
      for (const job of renderQueue.list()) {
        if (!isRenderJobFinished(job.state)) renderQueue.cancel(job.id);
      }
      await Promise.race([
        renderQueue.idle(),
        new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
      ]);
    },
    close: () => app.close(),
  };
}
