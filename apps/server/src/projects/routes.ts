import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { IMAGE_LIMITS, toValidationIssues } from '@travel-route-animator/core';
import {
  AssetNotFoundError,
  ImageRejectedError,
  ProjectFileInvalidError,
  ProjectNotFoundError,
  ProjectValidationError,
  type ProjectStore,
} from './projectStore';

const CreateProjectBody = z.strictObject({
  name: z.string().trim().min(1, 'A project needs a name').max(200),
});

interface IdParams {
  id: string;
}

const ASSETS_ROUTE = '/api/projects/:id/assets';

/** The name the image had on the user's disk, for the editor to show; never used as a path. */
function displayName(raw: unknown): string {
  const name = typeof raw === 'string' ? (raw.split(/[\\/]/).pop() ?? '').trim() : '';
  return name.slice(0, 200) || 'image';
}

export function registerProjectRoutes(app: FastifyInstance, store: ProjectStore): void {
  void app.register((routes, _options, done) => {
    // Encapsulated: these error mappings only apply to the project routes.
    routes.setErrorHandler((error, request, reply) => {
      if (error instanceof ProjectNotFoundError || error instanceof AssetNotFoundError) {
        return reply.code(404).send({ error: 'not_found', message: error.message });
      }
      if (error instanceof ImageRejectedError) {
        return reply.code(422).send({
          error: 'image_rejected',
          message: error.message,
          problem: error.problem,
          values: error.values,
        });
      }
      // Fastify stops reading a body that is too large, or of a type no parser takes, before
      // the route sees it. For an image, that is the same answer as for one checked too large.
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (request.routeOptions.url === ASSETS_ROUTE) {
        if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
          return reply.code(413).send({
            error: 'image_rejected',
            message: 'The image is too large',
            problem: 'image.tooLarge',
            values: { limit: IMAGE_LIMITS.bytes },
          });
        }
        if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
          return reply.code(415).send({
            error: 'image_rejected',
            message: 'Only PNG and GIF images can be used',
            problem: 'image.unsupported',
            values: {},
          });
        }
      }
      if (error instanceof ProjectValidationError) {
        return reply.code(400).send({
          error: 'invalid_project',
          message: 'The project is not valid',
          issues: error.issues,
        });
      }
      // 422 rather than 404: the project is there, but its stored file cannot be processed.
      if (error instanceof ProjectFileInvalidError) {
        return reply.code(422).send({
          error: 'invalid_project_file',
          message: error.message,
          file: error.file,
          issues: error.issues,
        });
      }
      return reply.send(error);
    });

    routes.get('/api/projects', () => store.list());

    routes.get<{ Params: IdParams }>('/api/projects/:id', (request) =>
      store.get(request.params.id),
    );

    routes.post('/api/projects', async (request, reply) => {
      const body = CreateProjectBody.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: 'Expected a JSON body like {"name": "Portugal 2026"}',
          issues: toValidationIssues(body.error),
        });
      }
      return reply.code(201).send(await store.create(body.data.name));
    });

    routes.put<{ Params: IdParams }>('/api/projects/:id', (request) =>
      store.update(request.params.id, request.body),
    );

    routes.delete<{ Params: IdParams }>('/api/projects/:id', async (request, reply) => {
      await store.remove(request.params.id);
      return reply.code(204).send();
    });

    // Images arrive as they are, without a form around them; what they are is read from their
    // bytes (ADR 0009), so the content type only has to be one of these.
    routes.addContentTypeParser(
      ['image/png', 'image/gif', 'application/octet-stream'],
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );

    routes.post<{ Params: IdParams; Querystring: { name?: string } }>(
      ASSETS_ROUTE,
      { bodyLimit: IMAGE_LIMITS.bytes },
      async (request, reply) => {
        const bytes = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        const asset = await store.addImage(
          request.params.id,
          bytes,
          displayName(request.query.name),
        );
        return reply.code(201).send(asset);
      },
    );

    routes.get<{ Params: IdParams & { file: string } }>(
      `${ASSETS_ROUTE}/:file`,
      async (request, reply) => {
        const { bytes, mimeType } = await store.readAsset(request.params.id, request.params.file);
        // A file never changes under its name: a new image gets a new ID.
        return reply
          .header('cache-control', 'private, max-age=31536000, immutable')
          .type(mimeType)
          .send(bytes);
      },
    );

    done();
  });
}
