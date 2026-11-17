import { join } from 'node:path';
import { readAssetUrls } from '@travel-route-animator/scene/render/assets';
import {
  assetsOfEtappe,
  resolveMapStyle,
  checkRenderReadiness,
  cleanVideoName,
  describeIssues,
  isRenderJobFinished,
  OutputSettingsSchema,
  refreshLocalRoutes,
  RenderRequestSchema,
  resolveOutput,
  slugify,
  suggestVideoName,
  toValidationIssues,
  tracksAwaitingRoute,
  type Etappe,
  type Project,
  type RenderJob,
} from '@travel-route-animator/core';
import type { FastifyInstance } from 'fastify';
import { isBuiltInTheme } from '@travel-route-animator/styles';
import { fillElevations } from '../elevation/fill';
import type { ElevationSampler } from '../elevation/sampler';
import { ownUrl } from '../themes/routes';
import type { ThemeStore } from '../themes/themeStore';
import { overlayStylesOf, type OverlayStyleStore } from '../overlayStyles/overlayStyles';
import {
  ProjectFileInvalidError,
  ProjectNotFoundError,
  type ProjectStore,
} from '../projects/projectStore';
import type { RenderQueue } from './queue';
import type { RevealFile } from './reveal';

export interface RenderRouteOptions {
  queue: RenderQueue;
  store: ProjectStore;
  themes: ThemeStore;
  overlayStyles: OverlayStyleStore;
  /** Fills in heights a stage needs and the file does not have yet (ADR 0012). */
  elevation: ElevationSampler;
  outputDir: string;
  now: () => Date;
  revealFile: RevealFile;
}

interface IdParams {
  id: string;
}

// Proxies and the browser may drop a quiet connection; a comment line every so often keeps
// a long render's event stream open.
const HEARTBEAT_MS = 15_000;

/**
 * What a video is called: the stage, or for several the group they make up when they are the
 * whole of it in order, else the first and the last stage.
 */
function videoTitle(project: Project, etappen: readonly Etappe[]): string {
  if (etappen.length === 1) return etappen[0]!.name;
  const group = project.groups.find(
    (g) =>
      g.etappen.length === etappen.length && g.etappen.every((e, i) => e.id === etappen[i]!.id),
  );
  return group?.name ?? `${etappen[0]!.name} bis ${etappen.at(-1)!.name}`;
}

export function registerRenderRoutes(
  app: FastifyInstance,
  {
    queue,
    store,
    themes,
    overlayStyles,
    elevation,
    outputDir,
    now,
    revealFile,
  }: RenderRouteOptions,
): void {
  void app.register((routes, _options, done) => {
    routes.setErrorHandler((error, _request, reply) => {
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: error.message });
      }
      if (error instanceof ProjectFileInvalidError) {
        return reply.code(422).send({ error: 'invalid_project_file', message: error.message });
      }
      return reply.send(error);
    });

    const notFound = (id: string) => ({
      error: 'not_found',
      message: `There is no render job "${id}"`,
    });

    routes.get('/api/render', () => queue.list());

    routes.post('/api/render', async (request, reply) => {
      const body = RenderRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Expected {"projectId", "etappeId" or "etappeIds", "output", "fileName"}',
          issues: toValidationIssues(body.error),
        });
      }
      const { projectId, output: overrides, fileName } = body.data;
      const etappeIds = body.data.etappeIds ?? [body.data.etappeId!];

      // As saved; the editor saves before it asks. Local routes are computed here, as the
      // editor does after every edit, in case the file was written by something else.
      const saved = await store.get(projectId);
      const routed = refreshLocalRoutes(saved, saved.updatedAt);
      const all = routed.groups.flatMap((group) => group.etappen);
      const etappen = etappeIds.map((id) => all.find((candidate) => candidate.id === id));
      const missing = etappeIds.find((_id, i) => !etappen[i]);
      if (missing !== undefined) {
        return reply.code(404).send({
          error: 'not_found',
          message: `Stage "${missing}" does not exist in project "${projectId}"`,
        });
      }
      const found = etappen as NonNullable<(typeof etappen)[number]>[];

      // The renderer never asks a router itself (ARCHITEKTUR: Render-Pipeline): a road route
      // that is missing or stale would come out as a straight line.
      const issues = checkRenderReadiness(routed, etappeIds);
      const awaitingRoute = found.flatMap((e) => tracksAwaitingRoute(e).map((track) => track.id));
      const title = videoTitle(routed, found);
      if (issues.length > 0 || awaitingRoute.length > 0) {
        return reply.code(409).send({
          error: 'not_ready',
          message:
            issues.length > 0
              ? `"${title}" cannot be rendered yet:\n${describeIssues(issues)}`
              : `"${title}" still waits for ${awaitingRoute.length} route(s)`,
          issues,
          awaitingRoute,
        });
      }

      const project = await fillElevations(routed, etappeIds, elevation, (message) =>
        request.log.warn(message),
      );
      // The dialog may switch codec and overlay for this render; both have to fit together.
      const checked = OutputSettingsSchema.safeParse({ ...project.defaults.output, ...overrides });
      if (!checked.success) {
        return reply.code(400).send({
          error: 'invalid_output',
          message: 'These output settings do not fit together',
          issues: toValidationIssues(checked.error),
        });
      }
      const output = resolveOutput(project, overrides);
      const name =
        fileName === undefined ? suggestVideoName(title, output, now()) : cleanVideoName(fileName);
      if (name === null) {
        return reply.code(400).send({
          error: 'invalid_file_name',
          message: 'The file name has no usable characters',
        });
      }

      const assets = [
        ...new Map(
          etappeIds.flatMap((id) => assetsOfEtappe(project, id)).map((a) => [a.id, a]),
        ).values(),
      ];
      // Own themes go along; a missing one is drawn as the default (ADR 0010).
      const ownThemes = await Promise.all(
        [...new Set(etappeIds.map((id) => resolveMapStyle(project, id).value.themeId))]
          .filter((id): id is string => id !== undefined && !isBuiltInTheme(id))
          .map((id) => themes.get(id).catch(() => undefined)),
      );
      const usedThemes = ownThemes.filter((theme) => theme !== undefined);
      const usedStyles = await overlayStylesOf(project, etappeIds, overlayStyles);
      const job = await queue.add({
        project,
        etappe: { id: etappeIds[0]!, name: title },
        ...(body.data.etappeIds && { etappeIds }),
        overrides,
        output,
        dir: join(outputDir, slugify(project.name)),
        name,
        ...(assets.length > 0 && {
          assetUrls: await readAssetUrls(await store.assetsDir(projectId), assets),
        }),
        ...(usedThemes.length > 0 && {
          themes: Object.fromEntries(usedThemes.map((theme) => [theme.id, theme])),
        }),
        ...(usedStyles.length > 0 && { overlayStyles: usedStyles }),
        serverUrl: ownUrl(request),
        ...(body.data.motionData && { motionData: true }),
        ...(body.data.editValues && { editValues: true }),
        ...(body.data.blockVideos && { blockVideos: true }),
      });
      return reply.code(202).send(job);
    });

    /**
     * Server-sent events for one job: its current state at once, then every change, until
     * it is finished. The browser closes the stream then; otherwise EventSource would
     * connect again by itself.
     */
    routes.get<{ Params: IdParams }>('/api/render/:id/events', (request, reply) => {
      const job = queue.get(request.params.id);
      if (!job) return reply.code(404).send(notFound(request.params.id));

      reply.hijack();
      const stream = reply.raw;
      stream.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (update: RenderJob) =>
        stream.write(`event: job\ndata: ${JSON.stringify(update)}\n\n`);

      send(job);
      if (isRenderJobFinished(job.state)) {
        stream.end();
        return;
      }
      const heartbeat = setInterval(() => stream.write(': keep-alive\n\n'), HEARTBEAT_MS);
      const unsubscribe = queue.subscribe((update) => {
        if (update.id !== job.id) return;
        send(update);
        if (isRenderJobFinished(update.state)) stream.end();
      });
      stream.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    });

    /** Cancels a waiting or running job; takes a finished one off the list (the file stays). */
    routes.delete<{ Params: IdParams }>('/api/render/:id', (request, reply) => {
      const { id } = request.params;
      const job = queue.get(id);
      if (!job) return reply.code(404).send(notFound(id));
      if (isRenderJobFinished(job.state)) {
        queue.remove(id);
        return reply.code(204).send();
      }
      return reply.code(202).send(queue.cancel(id));
    });

    routes.post<{ Params: IdParams }>('/api/render/:id/reveal', (request, reply) => {
      const job = queue.get(request.params.id);
      if (!job) return reply.code(404).send(notFound(request.params.id));
      if (job.state !== 'done') {
        return reply.code(409).send({ error: 'not_done', message: 'The video is not finished' });
      }
      if (!revealFile(job.outputPath)) {
        return reply.code(501).send({
          error: 'not_supported',
          message: 'Opening the folder only works on Windows; copy the path instead',
        });
      }
      return reply.code(204).send();
    });

    done();
  });
}
